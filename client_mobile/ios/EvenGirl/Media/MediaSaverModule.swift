//
//  MediaSaverModule.swift
//  EvenGirl
//
//  Düzenlenen çıktıyı galeriye kaydeder.
//
//  YALNIZCA EKLEME İZNİ
//  `PHPhotoLibrary.requestAuthorization(for: .addOnly)` kullanılıyor.
//  Bu izin kütüphaneyi OKUMA hakkı VERMEZ — uygulama kullanıcının
//  fotoğraflarını göremez, yalnızca yeni bir öğe ekleyebilir. Tam erişim
//  (`.readWrite`) istemek, seçici sayesinde hiç gerekmeyen bir yetkiyi
//  geri getirirdi (bkz. Info.plist açıklaması).
//
//  İZİN REDDEDİLİRSE AÇIKÇA REDDEDİLİR
//  Sessizce başarı dönmek, kullanıcının "kaydedildi" sanıp galerisinde
//  hiçbir şey bulamaması demektir.
//
import Foundation
import Photos
import React

@objc(EvenGirlMediaSaver)
final class MediaSaverModule: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { false }

  /// Kaydetme izninin durumu — istem GÖSTERMEDEN.
  @objc(authorizationStatus:rejecter:)
  func authorizationStatus(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    switch PHPhotoLibrary.authorizationStatus(for: .addOnly) {
    case .authorized, .limited: resolve("granted")
    case .denied, .restricted: resolve("denied")
    case .notDetermined: resolve("undetermined")
    @unknown default: resolve("undetermined")
    }
  }

  @objc(save:kind:resolver:rejecter:)
  func save(
    filePath: String,
    kind: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let url = filePath.hasPrefix("file://")
      ? URL(string: filePath)
      : URL(fileURLWithPath: filePath)

    guard let url, FileManager.default.fileExists(atPath: url.path) else {
      reject("not_found", "Dosya yok: \(filePath)", nil)
      return
    }

    PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
      guard status == .authorized || status == .limited else {
        // Kullanıcı reddetti: sessizce başarı DÖNMEZ.
        reject("permission_denied", "Galeriye ekleme izni verilmedi", nil)
        return
      }

      PHPhotoLibrary.shared().performChanges {
        if kind == "video" {
          PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
        } else {
          PHAssetChangeRequest.creationRequestForAssetFromImage(atFileURL: url)
        }
      } completionHandler: { success, error in
        if success {
          resolve(nil)
        } else {
          reject("save_failed", error?.localizedDescription ?? "Kaydedilemedi", error)
        }
      }
    }
  }
}
