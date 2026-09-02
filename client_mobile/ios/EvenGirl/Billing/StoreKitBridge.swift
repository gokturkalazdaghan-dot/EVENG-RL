//
//  StoreKitBridge.swift
//  EvenGirl
//
//  StoreKit 2 köprüsü — RevenueCat SDK'sının KAPSAMADIĞI mağazaya özgü işler.
//
//  KAPSAM AYRIMI (bilinçli)
//  Satın alma, makbuz doğrulama ve yenileme takibi RevenueCat üzerinden yürür
//  (o da altta StoreKit 2'yi çağırır). Buradaki kod onu TEKRARLAMAZ; ikinci bir
//  satın alma hattı kurmak iki farklı doğruluk kaynağı yaratır ve gelir
//  kayıplarının klasik sebebidir.
//
//  Burada yalnızca SDK'nın sunmadığı üç şey var:
//    1. Abonelik yönetim sayfası (Guideline 3.1.2: kolay erişilebilir olmalı)
//    2. Uygulama içi iade talebi (iOS 15+) — App Store'a yönlendirmekten iyidir
//       ve şikâyet/1 yıldız oranını ölçülebilir biçimde düşürür
//    3. Transaction.updates dinleyicisi — uygulama kapalıyken tamamlanan
//       "Ask to Buy" (aile onayı) ve ertelenmiş işlemleri yakalar
//
import Foundation
import React
import StoreKit
import UIKit

@objc(EvenGirlStoreKit)
final class StoreKitBridge: RCTEventEmitter {

    private var hasJsListeners = false
    private var updatesTask: Task<Void, Never>?

    override static func requiresMainQueueSetup() -> Bool { true }

    override func supportedEvents() -> [String] { ["transactionUpdated"] }

    override func startObserving() { hasJsListeners = true }
    override func stopObserving() { hasJsListeners = false }

    // MARK: - İşlem dinleyicisi

    /// Uygulama açılışında başlatılır.
    ///
    /// `Transaction.updates`, uygulama KAPALIYKEN onaylanan işlemleri de
    /// yayınlar. Bu dinleyici olmadan "Ask to Buy" ile ebeveyn onayı bekleyen
    /// bir çocuk hesabında satın alma tamamlanır ama uygulama bunu asla
    /// öğrenmez — kullanıcı ödediği halde Pro olmaz.
    @objc
    func startTransactionListener() {
        guard updatesTask == nil else { return }

        updatesTask = Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard case .verified(let transaction) = result else {
                    // Doğrulanmamış işlem: StoreKit imzayı reddetti. İşleme
                    // ALINMAZ; `finish()` de çağrılmaz ki tekrar denensin.
                    continue
                }

                await self?.emitTransaction(transaction)

                // İşlemi kapatmak zorunludur; aksi halde StoreKit her açılışta
                // aynı işlemi tekrar yayınlar.
                await transaction.finish()
            }
        }
    }

    @objc
    func stopTransactionListener() {
        updatesTask?.cancel()
        updatesTask = nil
    }

    @MainActor
    private func emitTransaction(_ transaction: Transaction) {
        guard hasJsListeners else { return }
        sendEvent(
            withName: "transactionUpdated",
            body: [
                "productId": transaction.productID,
                "purchaseDateMs": Int(transaction.purchaseDate.timeIntervalSince1970 * 1000),
                "isUpgraded": transaction.isUpgraded,
                "revocationReason": transaction.revocationReason?.rawValue as Any
            ]
        )
    }

    // MARK: - Abonelik yönetimi

    /// Sistemin abonelik yönetim sayfasını uygulama İÇİNDE açar.
    ///
    /// Guideline 3.1.2, iptalin kolay bulunabilir olmasını ister. Kullanıcıyı
    /// "Ayarlar > Apple Kimliği > Abonelikler" tarifiyle baş başa bırakmak,
    /// hem ret riski hem de destek yükü üretir.
    @objc(showManageSubscriptions:rejecter:)
    func showManageSubscriptions(
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        Task { @MainActor in
            guard let scene = Self.activeWindowScene() else {
                reject("no_scene", "Etkin pencere bulunamadı", nil)
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                resolve(nil)
            } catch {
                reject("manage_failed", "Abonelik yönetimi açılamadı", error)
            }
        }
    }

    /// Uygulama içi iade talebi (iOS 15+).
    ///
    /// Kullanıcı iade istediğinde App Store'a yönlendirmek yerine burada
    /// hallettirmek, olumsuz değerlendirme bırakma olasılığını düşürür.
    @objc(beginRefundRequest:resolver:rejecter:)
    func beginRefundRequest(
        transactionId: NSNumber,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        Task { @MainActor in
            guard let scene = Self.activeWindowScene() else {
                reject("no_scene", "Etkin pencere bulunamadı", nil)
                return
            }
            do {
                let status = try await Transaction.beginRefundRequest(
                    for: UInt64(truncating: transactionId),
                    in: scene
                )
                resolve(status == .success ? "submitted" : "cancelled")
            } catch {
                reject("refund_failed", "İade talebi başlatılamadı", error)
            }
        }
    }

    /// Tanıtım teklifi (1 gün deneme) uygunluğunun StoreKit 2 üzerinden
    /// doğrudan sorgulanması. RevenueCat cevabıyla çelişirse SDK'nınki esas
    /// alınır; bu yalnızca hata ayıklama ve destek için ikinci bir kanaldır.
    @objc(isEligibleForIntroOffer:resolver:rejecter:)
    func isEligibleForIntroOffer(
        productId: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let subscription = products.first?.subscription else {
                    resolve(false)
                    return
                }
                resolve(await subscription.isEligibleForIntroOffer)
            } catch {
                // Bilinmiyorsa DENEME GÖSTERİLMEZ: olmayan bir teklifi vaat edip
                // satın alma anında tam ücret tahsil ettirmek en kötü sürprizdir.
                resolve(false)
            }
        }
    }

    @MainActor
    private static func activeWindowScene() -> UIWindowScene? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
    }

    deinit {
        updatesTask?.cancel()
    }
}
