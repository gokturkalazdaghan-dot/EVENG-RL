//
//  PinnedSession.swift
//  EvenGirl
//
//  SSL Public Key Pinning (SPKI SHA-256).
//
//  NEDEN SERTİFİKA DEĞİL, PUBLIC KEY PİNLENİR?
//  Sertifika pinlenirse her yenilemede (Let's Encrypt'te 90 gün) uygulama
//  sahada kilitlenir ve acil sürüm çıkmak gerekir. Public key (SPKI) pinlemede
//  aynı anahtar çiftiyle yenilenen sertifika pin'i bozmaz.
//
//  YEDEK PİN ZORUNLULUĞU
//  Her host için en az 2 pin şarttır: biri aktif, biri henüz yayında olmayan
//  yedek anahtar. Tek pinli yapılandırma, anahtar kaybında uygulamayı
//  kurtarılamaz biçimde kilitler. `assertConfigurationIsSafe()` bu kuralı
//  DEBUG'ta assert ile, release'te bağlantıyı reddederek uygular.
//
import CryptoKit
import Foundation

enum PinningError: Error {
    case noPinsConfigured(host: String)
    case insufficientBackupPins(host: String)
    case chainValidationFailed
    case pinMismatch
}

final class PinnedSession: NSObject {

    /// host -> "sha256/BASE64" pin listesi. JS tarafındaki ENV.pinnedHosts ile
    /// aynı kaynaktan (build script) üretilir.
    private let pinsByHost: [String: [String]]
    private lazy var session: URLSession = URLSession(
        configuration: .ephemeral,   // disk cache yok: yanıtlar diske düşmez
        delegate: self,
        delegateQueue: nil
    )

    init(pinsByHost: [String: [String]]) {
        self.pinsByHost = pinsByHost
        super.init()
    }

    /// Yedek pin kuralını uygular. Uygulama açılışında bir kez çağrılır.
    func assertConfigurationIsSafe() throws {
        for (host, pins) in pinsByHost {
            if pins.isEmpty { throw PinningError.noPinsConfigured(host: host) }
            if pins.count < 2 { throw PinningError.insufficientBackupPins(host: host) }
        }
    }

    // MARK: - İstek

    func request(
        url: URL,
        method: String,
        headers: [String: String],
        body: Data?,
        completion: @escaping (Result<(Int, Data), Error>) -> Void
    ) {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.timeoutInterval = 30
        headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }

        session.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            completion(.success((status, data ?? Data())))
        }.resume()
    }

    // MARK: - SPKI özeti

    /// Sertifikanın public key'ini DER SubjectPublicKeyInfo'ya çevirip
    /// SHA-256 özetini alır.
    static func spkiHash(for certificate: SecCertificate) -> String? {
        guard let publicKey = SecCertificateCopyKey(certificate),
              let attributes = SecKeyCopyAttributes(publicKey) as? [CFString: Any],
              let keyData = SecKeyCopyExternalRepresentation(publicKey, nil) as Data?
        else { return nil }

        guard let header = asn1Header(for: attributes) else { return nil }

        let spki = header + keyData
        let digest = SHA256.hash(data: spki)
        return "sha256/" + Data(digest).base64EncodedString()
    }

    /// `SecKeyCopyExternalRepresentation` yalnızca ham anahtarı döndürür;
    /// SPKI özeti için anahtar tipine uygun ASN.1 başlığı eklenmelidir.
    /// (RFC 5280 SubjectPublicKeyInfo)
    private static func asn1Header(for attributes: [CFString: Any]) -> Data? {
        let keyType = attributes[kSecAttrKeyType] as? String
        let keySize = attributes[kSecAttrKeySizeInBits] as? Int ?? 0

        if keyType == (kSecAttrKeyTypeRSA as String) {
            switch keySize {
            case 2048:
                return Data([
                    0x30, 0x82, 0x01, 0x22, 0x30, 0x0D, 0x06, 0x09, 0x2A, 0x86,
                    0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x01, 0x05, 0x00, 0x03,
                    0x82, 0x01, 0x0F, 0x00
                ])
            case 4096:
                return Data([
                    0x30, 0x82, 0x02, 0x22, 0x30, 0x0D, 0x06, 0x09, 0x2A, 0x86,
                    0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x01, 0x05, 0x00, 0x03,
                    0x82, 0x02, 0x0F, 0x00
                ])
            default:
                return nil
            }
        }

        if keyType == (kSecAttrKeyTypeECSECPrimeRandom as String) {
            switch keySize {
            case 256: // secp256r1
                return Data([
                    0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE,
                    0x3D, 0x02, 0x01, 0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D,
                    0x03, 0x01, 0x07, 0x03, 0x42, 0x00
                ])
            case 384: // secp384r1
                return Data([
                    0x30, 0x76, 0x30, 0x10, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE,
                    0x3D, 0x02, 0x01, 0x06, 0x05, 0x2B, 0x81, 0x04, 0x00, 0x22,
                    0x03, 0x62, 0x00
                ])
            default:
                return nil
            }
        }

        return nil
    }
}

// MARK: - URLSessionDelegate

extension PinnedSession: URLSessionDelegate {

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = challenge.protectionSpace.serverTrust
        else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        let host = challenge.protectionSpace.host
        guard let expectedPins = pinsByHost[host], !expectedPins.isEmpty else {
            // Pin tanımlanmamış host'a bağlanmayı REDDEDİYORUZ. "Pin yoksa
            // sistem güvenine düş" davranışı, saldırganın trafiği pinlenmemiş
            // bir alt alan adına yönlendirmesiyle pinning'i tamamen bypass eder.
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        // 1) ÖNCE standart zincir doğrulaması. Pin eşleşse bile süresi dolmuş
        //    veya iptal edilmiş sertifika kabul edilmemelidir.
        var trustError: CFError?
        guard SecTrustEvaluateWithError(serverTrust, &trustError) else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        // 2) Zincirdeki HERHANGİ bir sertifikanın SPKI özeti pin listesinde mi?
        //    (Yaprak yerine ara CA pinlemek isteyen kurulumlar da desteklenir.)
        let chain = (SecTrustCopyCertificateChain(serverTrust) as? [SecCertificate]) ?? []

        for certificate in chain {
            guard let hash = PinnedSession.spkiHash(for: certificate) else { continue }
            if expectedPins.contains(hash) {
                completionHandler(.useCredential, URLCredential(trust: serverTrust))
                return
            }
        }

        // 3) Eşleşme yok: MitM olasılığı. Bağlantı TLS seviyesinde kesilir.
        //    Hangi pin'in beklendiği LOGLANMAZ — saldırgana geri bildirim
        //    vermek doğrudan yardım etmektir.
        completionHandler(.cancelAuthenticationChallenge, nil)
    }
}
