//
//  CoreMLRuntime.swift
//  EvenGirl
//
//  Cihaz üstü çıkarım — CoreML.
//
//  TASARIM KARARLARI
//
//  1. PİKSEL VERİSİ JS KÖPRÜSÜNDEN GEÇMEZ. Giriş ve çıkış URI olarak taşınır;
//     görüntü yükleme, ölçekleme, çıkarım ve kaydetme tamamen burada olur.
//     4K bir kareyi köprüden geçirmek (base64/sayı dizisi) tek başına
//     yüzlerce ms ve iki kat bellek demektir.
//
//  2. MLComputeUnits SEÇİMİ JS'TEN GELİR. Termal kararı ThermalPolicy verir
//     (bkz. src/performance/ThermalPolicy.ts); burada yalnızca uygulanır.
//     `.all` her zaman en iyi seçim değildir: cihaz ısındığında Neural Engine
//     yerine GPU daha az güç çeker.
//
//  3. OTURUMLAR AÇIK ŞEKİLDE KAPATILIR. MLModel serbest bırakılmazsa native
//     heap'te yüzlerce MB tutulur ve JS GC'si bunu görmez.
//
import CoreML
import Foundation
import React
import UIKit

@objc(EvenGirlInference)
final class CoreMLRuntime: NSObject {

    /// sessionId -> yüklü model. JS tarafı LRU ile en fazla 2 oturum tutar.
    private var sessions: [String: MLModel] = [:]
    private let lock = NSLock()

    @objc static func requiresMainQueueSetup() -> Bool { false }

    // MARK: - Model yaşam döngüsü

    @objc(loadModel:compute:resolver:rejecter:)
    func loadModel(
        path: String,
        compute: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let configuration = MLModelConfiguration()
                configuration.computeUnits = Self.computeUnits(from: compute)
                // Aynı model birden fazla kez yüklenmesin diye isim veriyoruz;
                // CoreML derlenmiş modeli önbelleğe alabilir.
                configuration.modelDisplayName = (path as NSString).lastPathComponent

                let model = try MLModel(contentsOf: URL(fileURLWithPath: path), configuration: configuration)

                let sessionId = UUID().uuidString
                self.lock.lock()
                self.sessions[sessionId] = model
                self.lock.unlock()

                resolve(sessionId)
            } catch {
                reject("model_load_failed", "Model yüklenemedi", error)
            }
        }
    }

    @objc(unloadModel:resolver:rejecter:)
    func unloadModel(
        sessionId: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        lock.lock()
        sessions.removeValue(forKey: sessionId)
        lock.unlock()
        // Referans düşer düşmez MLModel serbest kalır; ayrıca bir şey
        // yapmaya gerek yok ama JS tarafının bunu ÇAĞIRMASI şart.
        resolve(nil)
    }

    // MARK: - Çıkarım

    @objc(run:input:resolver:rejecter:)
    func run(
        sessionId: String,
        input: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        lock.lock()
        let model = sessions[sessionId]
        lock.unlock()

        guard let model else {
            reject("session_not_found", "Model oturumu bulunamadı", nil)
            return
        }
        guard
            let sourceUri = input["sourceUri"] as? String,
            let maxEdge = input["maxEdgePx"] as? NSNumber
        else {
            reject("invalid_input", "Eksik girdi", nil)
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            let started = CFAbsoluteTimeGetCurrent()

            // autoreleasepool: CVPixelBuffer ve MLFeatureValue nesneleri
            // döngü bitmeden serbest kalsın. Video karelerinde bu blok
            // olmadan bellek doğrusal olarak büyür.
            autoreleasepool {
                do {
                    guard let image = Self.loadImage(uri: sourceUri, maxEdge: maxEdge.intValue) else {
                        reject("source_unreadable", "Kaynak okunamadı", nil)
                        return
                    }
                    guard let buffer = Self.pixelBuffer(from: image) else {
                        reject("conversion_failed", "Piksel arabelleği oluşturulamadı", nil)
                        return
                    }

                    let features = try MLDictionaryFeatureProvider(dictionary: [
                        "input": MLFeatureValue(pixelBuffer: buffer)
                    ])
                    let output = try model.prediction(from: features)

                    guard
                        let outputBuffer = output.featureValue(for: "output")?.imageBufferValue,
                        let outputUri = Self.writeOutput(outputBuffer)
                    else {
                        reject("output_write_failed", "Çıktı yazılamadı", nil)
                        return
                    }

                    resolve([
                        "outputUri": outputUri,
                        "durationMs": Int((CFAbsoluteTimeGetCurrent() - started) * 1000)
                    ])
                } catch {
                    reject("inference_failed", "Çıkarım başarısız", error)
                }
            }
        }
    }

    // MARK: - Cihaz yetenekleri

    @objc(deviceTotalRamBytes:rejecter:)
    func deviceTotalRamBytes(
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(NSNumber(value: ProcessInfo.processInfo.physicalMemory))
    }

    @objc(supportedComputeUnits:rejecter:)
    func supportedComputeUnits(
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        // Neural Engine A12 (2018) ve sonrasında var. Doğrudan sorgulanamaz;
        // CoreML `.all` isteğinde sessizce GPU'ya düşer. Bu yüzden desteklenen
        // birimleri muhafazakâr biçimde bildiriyoruz.
        var units = ["cpu", "gpu"]
        if MLModel.availableComputeDevices.contains(where: { device in
            if case .neuralEngine = device { return true }
            return false
        }) {
            units.insert("npu", at: 0)
        }
        resolve(units)
    }

    private static func computeUnits(from value: String) -> MLComputeUnits {
        switch value {
        case "npu": return .all               // Neural Engine dahil
        case "gpu": return .cpuAndGPU
        default:    return .cpuOnly
        }
    }

    // MARK: - Görüntü yardımcıları

    private static func loadImage(uri: String, maxEdge: Int) -> UIImage? {
        let url = URL(string: uri) ?? URL(fileURLWithPath: uri)
        guard let data = try? Data(contentsOf: url), let image = UIImage(data: data) else {
            return nil
        }
        guard maxEdge > 0 else { return image }

        let longestEdge = max(image.size.width, image.size.height)
        guard longestEdge > CGFloat(maxEdge) else { return image }

        // Termal profil çözünürlüğü kısıtlıyorsa burada ölçekleniyor:
        // modele küçük girdi vermek, çıktıyı sonradan küçültmekten çok daha
        // ucuzdur.
        let scale = CGFloat(maxEdge) / longestEdge
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)

        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
    }

    private static func pixelBuffer(from image: UIImage) -> CVPixelBuffer? {
        guard let cgImage = image.cgImage else { return nil }
        let width = cgImage.width
        let height = cgImage.height

        var buffer: CVPixelBuffer?
        let attributes: [CFString: Any] = [
            kCVPixelBufferCGImageCompatibilityKey: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey: true
        ]
        let status = CVPixelBufferCreate(
            kCFAllocatorDefault, width, height,
            kCVPixelFormatType_32BGRA, attributes as CFDictionary, &buffer
        )
        guard status == kCVReturnSuccess, let pixelBuffer = buffer else { return nil }

        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }

        guard let context = CGContext(
            data: CVPixelBufferGetBaseAddress(pixelBuffer),
            width: width, height: height, bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
        ) else { return nil }

        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
        return pixelBuffer
    }

    /// Çıktıyı önbellek dizinine yazar. Belgeler dizinine YAZMIYORUZ:
    /// ara çıktılar yedeklenmemeli (bkz. src/storage/paths.ts).
    private static func writeOutput(_ buffer: CVPixelBuffer) -> String? {
        let ciImage = CIImage(cvPixelBuffer: buffer)
        let context = CIContext()
        guard let data = context.jpegRepresentation(
            of: ciImage,
            colorSpace: CGColorSpaceCreateDeviceRGB(),
            options: [:]
        ) else { return nil }

        let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("render", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let url = directory.appendingPathComponent("\(UUID().uuidString).jpg")
        do {
            try data.write(to: url, options: .atomic)
            return url.absoluteString
        } catch {
            return nil
        }
    }
}
