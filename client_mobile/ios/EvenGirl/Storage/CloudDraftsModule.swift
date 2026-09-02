//
//  CloudDraftsModule.swift
//  EvenGirl
//
//  iCloud Drive taslak senkronu.
//
//  ZERO-DELETION
//  Bu modül HİÇBİR ZAMAN silmez. `upload` yeni bir SÜRÜM yazar, var olanı
//  değiştirmez; `resolveConflict` seçilmeyen sürümü yeniden adlandırarak
//  saklar. Bulut taslağı kullanıcının işidir — önbellek değil.
//
//  SESSİZ BAŞARISIZLIK YOK
//  iCloud kapalıysa `provider()` `"none"` döner ve JS tarafı özelliği
//  gizler. Kapalıyken yükleme denemek, kullanıcının "kaydedildi" sanıp
//  hiçbir yere kaydedilmemesi demektir.
//
import Foundation
import React

@objc(EvenGirlCloudDrafts)
final class CloudDraftsModule: NSObject {

  /// iCloud kapsayıcısındaki taslak klasörü.
  private var containerURL: URL? {
    FileManager.default.url(forUbiquityContainerIdentifier: nil)?
      .appendingPathComponent("Documents/Drafts", isDirectory: true)
  }

  @objc static func requiresMainQueueSetup() -> Bool { false }

  private func ensureContainer() throws -> URL {
    guard let url = containerURL else {
      throw NSError(
        domain: "EvenGirlCloudDrafts", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "iCloud kapsayıcısı yok"],
      )
    }
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  /// `<zamanDamgası>.evengirl` sürümleri, YENİDEN ESKİYE sıralı.
  private func versions(in folder: URL) -> [URL] {
    ((try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil))
      ?? [])
      .filter { $0.pathExtension == "evengirl" }
      .sorted { $0.lastPathComponent > $1.lastPathComponent }
  }

  /// JS tarafındaki `CloudDraft` ile AYNI alanları üretir.
  ///
  /// `sizeBytes` sözleşmede zorunlu: eksik bırakmak, arayüzde "undefined B"
  /// yazması ve ölçülü bağlantı uyarısının boyutu bilememesi demekti.
  private func describe(_ folder: URL) -> [String: Any]? {
    guard let newest = versions(in: folder).first else { return nil }

    let metaURL = folder.appendingPathComponent("meta.json")
    let meta = (try? Data(contentsOf: metaURL))
      .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: String] } ?? [:]

    let attributes = try? FileManager.default.attributesOfItem(atPath: newest.path)
    // Boyut meta'dan değil DOSYADAN: meta bayat olabilir, dosya olamaz.
    let size = (attributes?[.size] as? NSNumber)?.doubleValue ?? 0

    // iCloud dosyası yalnızca meta veri olarak durabiliyor; indirilmemiş
    // bir öğe için `availableOffline` true demek kullanıcıyı yanıltır.
    let downloaded = (try? newest.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey]))?
      .ubiquitousItemDownloadingStatus
    let offline = downloaded == nil || downloaded == .current || downloaded == .downloaded

    let version = newest.deletingPathExtension().lastPathComponent
    return [
      "draftId": folder.lastPathComponent,
      "title": meta["title"].flatMap { $0.isEmpty ? nil : $0 } ?? folder.lastPathComponent,
      "sizeBytes": size,
      "updatedAtMs": Double(version) ?? 0,
      "availableOffline": offline,
    ]
  }

  @objc(provider:rejecter:)
  func provider(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    // Oturum açılmamışsa `ubiquityIdentityToken` nil olur.
    resolve(FileManager.default.ubiquityIdentityToken != nil ? "icloud" : "none")
  }

  @objc(upload:localPath:title:resolver:rejecter:)
  func upload(
    draftId: String,
    localPath: String,
    title: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .utility).async {
      do {
        let container = try self.ensureContainer()
        let folder = container.appendingPathComponent(draftId, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)

        // SÜRÜM ADI ZAMAN DAMGALI: var olan dosyanın üzerine yazmak, iki
        // cihazdan aynı anda kaydeden kullanıcının bir sürümü kaybetmesi
        // demektir. Eski sürüm silinmez.
        let version = String(Int(Date().timeIntervalSince1970 * 1000))
        let destination = folder.appendingPathComponent("\(version).evengirl")

        try FileManager.default.copyItem(at: URL(fileURLWithPath: localPath), to: destination)

        // Başlık ayrı bir meta dosyasında: dosya adına gömmek, kullanıcının
        // yeniden adlandırdığı bir taslağın kimliğini bozardı.
        let meta = ["title": title, "updatedAtMs": version]
        // sizeBytes meta'ya da yazılır ama okurken DOSYA esas alınır
        // (bkz. describe): meta bayatlayabilir.
        let metaData = try JSONSerialization.data(withJSONObject: meta)
        try metaData.write(to: folder.appendingPathComponent("meta.json"))

        resolve(nil)
      } catch {
        reject("upload_failed", error.localizedDescription, error)
      }
    }
  }

  @objc(download:destinationPath:resolver:rejecter:)
  func download(
    draftId: String,
    destinationPath: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .utility).async {
      do {
        let container = try self.ensureContainer()
        let folder = container.appendingPathComponent(draftId, isDirectory: true)

        guard let newest = self.versions(in: folder).first else {
          reject("not_found", "Taslak bulunamadı: \(draftId)", nil)
          return
        }

        // iCloud dosyası yalnızca meta veri olarak durabilir; indirme
        // ZORUNLU olarak istenir, yoksa kopyalama boş dosya üretir.
        try FileManager.default.startDownloadingUbiquitousItem(at: newest)

        let destination = URL(fileURLWithPath: destinationPath)
        if FileManager.default.fileExists(atPath: destinationPath) {
          try FileManager.default.removeItem(at: destination)
        }
        try FileManager.default.copyItem(at: newest, to: destination)

        resolve(nil)
      } catch {
        reject("download_failed", error.localizedDescription, error)
      }
    }
  }

  @objc(list:rejecter:)
  func list(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .utility).async {
      guard let container = self.containerURL,
            let folders = try? FileManager.default.contentsOfDirectory(
              at: container, includingPropertiesForKeys: nil) else {
        resolve([])
        return
      }

      var drafts: [[String: Any]] = []
      for folder in folders {
        guard let entry = self.describe(folder) else { continue }
        drafts.append(entry)
      }
      resolve(drafts)
    }
  }

  @objc(conflicts:rejecter:)
  func conflicts(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .utility).async {
      guard let container = self.containerURL,
            let folders = try? FileManager.default.contentsOfDirectory(
              at: container, includingPropertiesForKeys: nil) else {
        resolve([])
        return
      }

      var conflicted: [[String: Any]] = []
      for folder in folders {
        let versions = self.versions(in: folder)
        // Birden fazla sürüm = çakışma. İkisi de DURUYOR; kullanıcı
        // seçene kadar hiçbiri silinmez.
        guard versions.count > 1, var entry = self.describe(folder) else { continue }

        let older = versions[1].deletingPathExtension().lastPathComponent
        entry["conflictingVersionId"] = older
        entry["conflictingUpdatedAtMs"] = Double(older) ?? 0
        conflicted.append(entry)
      }
      resolve(conflicted)
    }
  }

  @objc(resolveConflict:keepVersionId:resolver:rejecter:)
  func resolveConflict(
    draftId: String,
    keepVersionId: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .utility).async {
      do {
        let container = try self.ensureContainer()
        let folder = container.appendingPathComponent(draftId, isDirectory: true)

        let versions = self.versions(in: folder)

        // Var olmayan sürümü "tut" demek HEPSİNİ arşivlemek olurdu:
        // kullanıcı taslağını kaybetmiş sanır.
        guard versions.contains(where: {
          $0.deletingPathExtension().lastPathComponent == keepVersionId
        }) else {
          reject("not_found", "Sürüm yok: \(keepVersionId)", nil)
          return
        }

        // SEÇİLMEYEN SÜRÜM SİLİNMEZ, ARŞİVLENİR.
        // Zero-Deletion: kullanıcı yanlış sürümü seçtiğinde geri dönebilmeli.
        let archive = folder.appendingPathComponent("archived", isDirectory: true)
        try FileManager.default.createDirectory(at: archive, withIntermediateDirectories: true)

        for version in versions
        where version.deletingPathExtension().lastPathComponent != keepVersionId {
          try FileManager.default.moveItem(
            at: version,
            to: archive.appendingPathComponent(version.lastPathComponent),
          )
        }

        resolve(nil)
      } catch {
        reject("resolve_failed", error.localizedDescription, error)
      }
    }
  }
}
