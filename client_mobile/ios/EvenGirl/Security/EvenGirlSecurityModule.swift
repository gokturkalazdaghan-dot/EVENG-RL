//
//  EvenGirlSecurityModule.swift
//  EvenGirl
//
//  React Native köprüsü. JS tarafındaki sözleşme:
//  src/security/native/NativeSecurity.ts
//
//  KURAL: Bu sınıf KARAR VERMEZ, kararı taşır. Tüm güvenlik mantığı native
//  tarafta (IntegrityChecker / AntiDebug) çalışır; JS yalnızca sonucu okuyup
//  UI'a çevirir. JS bundle'ı değiştirilebilir olduğu için JS'te yapılan bir
//  kontrol koruma sayılmaz.
//
import Foundation
import React

@objc(EvenGirlSecurity)
final class EvenGirlSecurityModule: RCTEventEmitter {

    private var hasJsListeners = false
    private lazy var pinnedSession = PinnedSession(pinsByHost: PinConfiguration.pinsByHost)

    // MARK: - RCTEventEmitter

    override static func requiresMainQueueSetup() -> Bool { false }

    override func supportedEvents() -> [String] { ["integrityViolation"] }

    override func startObserving() { hasJsListeners = true }
    override func stopObserving() { hasJsListeners = false }

    // MARK: - Bütünlük

    @objc(runIntegrityCheck:rejecter:)
    func runIntegrityCheck(
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        // Kontroller dosya/soket I/O içerir; UI thread'i bloklamamak için
        // arka planda çalıştırılır (açılışta ~30-60 ms).
        DispatchQueue.global(qos: .userInitiated).async {
            let result = IntegrityChecker.run()
            resolve(result.asDictionary())
        }
    }

    @objc
    func startContinuousMonitoring() {
        AntiDebug.startMonitoring { [weak self] findings in
            guard let self, self.hasJsListeners else { return }
            self.sendEvent(
                withName: "integrityViolation",
                body: [
                    "findings": findings.map { $0.rawValue },
                    "compromised": true,
                    "checkedAtMs": Int(Date().timeIntervalSince1970 * 1000)
                ]
            )
        }
    }

    @objc
    func stopContinuousMonitoring() {
        AntiDebug.stopMonitoring()
    }

    // MARK: - Güvenli depolama

    @objc(secureSet:value:resolver:rejecter:)
    func secureSet(
        key: String,
        value: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        do {
            try KeychainStore.set(value, for: key)
            resolve(nil)
        } catch {
            reject("keychain_write_failed", "Keychain yazma başarısız", error)
        }
    }

    @objc(secureGet:resolver:rejecter:)
    func secureGet(
        key: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        do {
            resolve(try KeychainStore.get(key))
        } catch {
            reject("keychain_read_failed", "Keychain okuma başarısız", error)
        }
    }

    @objc(secureDelete:resolver:rejecter:)
    func secureDelete(
        key: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        do {
            try KeychainStore.delete(key)
            resolve(nil)
        } catch {
            reject("keychain_delete_failed", "Keychain silme başarısız", error)
        }
    }

    // MARK: - Pinlenmiş ağ

    @objc(pinnedFetch:init:resolver:rejecter:)
    func pinnedFetch(
        urlString: String,
        options: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let url = URL(string: urlString) else {
            reject("invalid_url", "Geçersiz URL", nil)
            return
        }

        let method = (options["method"] as? String) ?? "GET"
        let headers = (options["headers"] as? [String: String]) ?? [:]
        let body = (options["body"] as? String)?.data(using: .utf8)

        pinnedSession.request(url: url, method: method, headers: headers, body: body) { result in
            switch result {
            case .success(let (status, data)):
                resolve([
                    "status": status,
                    "body": String(data: data, encoding: .utf8) ?? ""
                ])
            case .failure:
                // Hata detayı JS'e SIZDIRILMAZ: pin uyuşmazlığı ile ağ hatasını
                // ayırt edebilmek saldırgana doğrudan geri bildirimdir.
                reject("request_failed", "İstek tamamlanamadı", nil)
            }
        }
    }
}
