//
//  MediaPickerModule.swift
//  EvenGirl
//
//  Fotoğraf/video seçici.
//
//  İZİN İSTEMEZ — bilerek.
//  PHPickerViewController ayrı bir süreçte çalışır ve yalnızca kullanıcının
//  SEÇTİĞİ öğenin bir kopyasını verir; uygulama fotoğraf kütüphanesine hiç
//  erişmez. Bu yüzden `NSPhotoLibraryUsageDescription` gerekmez ve
//  kullanıcıya "tüm fotoğraflarına erişim" sorusu HİÇ sorulmaz.
//
//  `PHAsset` / `PHPhotoLibrary` kullanan bir seçici kütüphanesi eklemek,
//  tam da kaçındığımız izni geri getirirdi.
//
//  SEÇİLEN ÖĞE UYGULAMA KUM HAVUZUNA KOPYALANIR
//  Seçicinin verdiği geçici URL, denetleyici kapandıktan sonra geçersiz
//  olur. Kopyalamadan döndürmek, kullanıcının bir dakika sonra "dosya yok"
//  hatası görmesi demektir.
//
import Foundation
import PhotosUI
import React
import UIKit
import UniformTypeIdentifiers

@objc(EvenGirlMediaPicker)
final class MediaPickerModule: NSObject {

  /// Aynı anda tek seçim: iki seçicinin üst üste açılması, ikinci
  /// promise'in asla çözülmemesine yol açardı.
  private var pending: (resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock)?
  private let lock = NSLock()

  @objc static func requiresMainQueueSetup() -> Bool { true }

  /// Seçilen öğelerin kopyalandığı klasör.
  private var inboxURL: URL {
    let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    return base.appendingPathComponent("Inbox", isDirectory: true)
  }

  @objc(pick:resolver:rejecter:)
  func pick(
    kind: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    lock.lock()
    if pending != nil {
      lock.unlock()
      reject("busy", "Seçici zaten açık", nil)
      return
    }
    pending = (resolve, reject)
    lock.unlock()

    DispatchQueue.main.async {
      guard let presenter = Self.topViewController() else {
        self.finish(reject: ("no_presenter", "Sunacak denetleyici yok"))
        return
      }

      var configuration = PHPickerConfiguration()
      configuration.selectionLimit = 1
      switch kind {
      case "video": configuration.filter = .videos
      case "any": configuration.filter = .any(of: [.images, .videos])
      default: configuration.filter = .images
      }

      let picker = PHPickerViewController(configuration: configuration)
      picker.delegate = self
      presenter.present(picker, animated: true)
    }
  }

  private func finish(resolve value: Any?) {
    lock.lock()
    let handlers = pending
    pending = nil
    lock.unlock()
    handlers?.resolve(value)
  }

  private func finish(reject error: (code: String, message: String)) {
    lock.lock()
    let handlers = pending
    pending = nil
    lock.unlock()
    handlers?.reject(error.code, error.message, nil)
  }

  private static func topViewController() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
    var top = scene?.windows.first { $0.isKeyWindow }?.rootViewController
    while let presented = top?.presentedViewController { top = presented }
    return top
  }
}

extension MediaPickerModule: PHPickerViewControllerDelegate {

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)

    guard let provider = results.first?.itemProvider else {
      // İPTAL HATA DEĞİLDİR: kullanıcı vazgeçti. Reddetmek, arayüzde
      // gereksiz bir hata mesajı göstermek olurdu.
      finish(resolve: nil)
      return
    }

    let types: [UTType] = [.movie, .image]
    guard let type = types.first(where: { provider.hasItemConformingToTypeIdentifier($0.identifier) })
    else {
      finish(reject: ("unsupported", "Desteklenmeyen medya türü"))
      return
    }

    provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { [weak self] url, error in
      guard let self else { return }
      guard let url else {
        self.finish(reject: ("load_failed", error?.localizedDescription ?? "Okunamadı"))
        return
      }

      do {
        try FileManager.default.createDirectory(at: self.inboxURL, withIntermediateDirectories: true)
        // Ad ÇAKIŞMASIN: aynı adlı iki fotoğraf seçen kullanıcı ikinciyi
        // kaybederdi. Zaman damgası + orijinal ad.
        let name = "\(Int(Date().timeIntervalSince1970 * 1000))-\(url.lastPathComponent)"
        let destination = self.inboxURL.appendingPathComponent(name)
        try FileManager.default.copyItem(at: url, to: destination)

        // `try?` bir sözlük aboneliğiyle zincirlendiğinde iç içe isteğe
        // bağlı (`NSNumber??`) üretir; `??.` diye bir operatör YOKTUR.
        // Öznitelikler önce ayrı bir değişkene alınıyor.
        let attributes = try? FileManager.default.attributesOfItem(atPath: destination.path)
        let size = (attributes?[.size] as? NSNumber)?.doubleValue ?? 0

        self.finish(resolve: [
          "uri": destination.absoluteString,
          "kind": type == .movie ? "video" : "photo",
          "sizeBytes": size,
        ])
      } catch {
        self.finish(reject: ("copy_failed", error.localizedDescription))
      }
    }
  }
}
