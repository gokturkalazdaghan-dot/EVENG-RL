//
//  TensorArenaModule.swift
//  EvenGirl
//
//  Native tensor belleğinin AÇIK ömür yönetimi.
//
//  NEDEN GEREKLİ
//  TFLite/CoreML tensor'ları JS heap'inde değil native heap'te durur. JS
//  GC'si native belleği SAYMAZ: 4K bir kare için ayrılan 100+ MB, JS tarafı
//  "boş" görünürken dakikalarca tutulabilir. Sonuç iOS'ta jetsam, yani
//  kullanıcı için "uygulama kapandı".
//
//  Bu modül olmadan `TensorArena` sessizce -1 döndürüp ayırdığını sanıyordu:
//  serbest bırakma hiçbir şey yapmıyor, `nativeHeapUsedBytes` 0 dönüyor ve
//  bellek yöneticisi baskı hiç görmüyordu.
//
import Foundation
import React

@objc(EvenGirlTensor)
final class TensorArenaModule: NSObject {

  /// Tutamaç → ayrılmış bellek. Arena kimliğiyle gruplanır ki bir arena
  /// kapandığında TEK ÇAĞRIYLA hepsi bırakılabilsin.
  private struct Allocation {
    let arenaId: String
    let pointer: UnsafeMutableRawPointer
    let bytes: Int
  }

  private var allocations: [Int: Allocation] = [:]
  private var nextHandle: Int = 1

  /// Sözlük birden çok thread'den güncellenir (çıkarım kuyruğu + JS köprüsü).
  /// Kilitsiz erişim, serbest bırakılmış bir işaretçinin ikinci kez
  /// bırakılmasına ve çökmeye yol açar.
  private let lock = NSLock()

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(allocate:bytes:label:resolver:rejecter:)
  func allocate(
    arenaId: String,
    bytes: NSNumber,
    label: String,
    resolve: RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    let size = bytes.intValue
    guard size > 0 else {
      reject("invalid_size", "Ayırma boyutu pozitif olmalı: \(size)", nil)
      return
    }

    // `calloc`: sıfırlanmış bellek. `malloc` önceki tahsisin artıklarını
    // taşır ve bir tensor kısmen yazıldığında çöp veri modele girer.
    guard let pointer = calloc(1, size) else {
      reject("out_of_memory", "\(size) bayt ayrılamadı", nil)
      return
    }

    lock.lock()
    let handle = nextHandle
    nextHandle += 1
    allocations[handle] = Allocation(arenaId: arenaId, pointer: pointer, bytes: size)
    lock.unlock()

    resolve(handle)
  }

  @objc(release:resolver:rejecter:)
  func release(handle: NSNumber, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    lock.lock()
    let allocation = allocations.removeValue(forKey: handle.intValue)
    lock.unlock()

    // Bilinmeyen tutamaç HATA DEĞİLDİR: arena kapanışı ile tek tek
    // serbest bırakma yarışabilir ve ikinci çağrı zaten bırakılmış bir
    // tutamacı görür. Hata döndürmek, doğru kodu gürültüye boğardı.
    if let allocation { free(allocation.pointer) }
    resolve(nil)
  }

  @objc(releaseAll:resolver:rejecter:)
  func releaseAll(
    arenaId: String,
    resolve: RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    lock.lock()
    let handles = allocations.filter { $0.value.arenaId == arenaId }.map(\.key)
    for handle in handles {
      if let allocation = allocations.removeValue(forKey: handle) {
        free(allocation.pointer)
      }
    }
    lock.unlock()

    resolve(handles.count)
  }

  /// Bu modülün ayırdığı toplam bayt.
  ///
  /// İşletim sisteminin toplam yerleşik belleğini DEĞİL, yalnızca burada
  /// izleneni döndürür: uygulamanın kendi tensor baskısını ölçmek istiyoruz,
  /// sistemin gürültüsünü değil.
  @objc(nativeHeapUsedBytes:rejecter:)
  func nativeHeapUsedBytes(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    lock.lock()
    let total = allocations.values.reduce(0) { $0 + $1.bytes }
    lock.unlock()
    resolve(total)
  }

  deinit {
    // Modül yok edilirken sızıntı bırakılmaz.
    for allocation in allocations.values { free(allocation.pointer) }
    allocations.removeAll()
  }
}
