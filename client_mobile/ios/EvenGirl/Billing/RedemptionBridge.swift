//
//  RedemptionBridge.swift
//  EvenGirl
//
//  StoreKit kod kullanım sayfası.
//
//  `presentCodeRedemptionSheet` iOS 14+ ile gelir ve sistem sayfasını
//  UYGULAMA İÇİNDE açar — kullanıcı App Store'a çıkmaz. Kod girildikten
//  sonra abonelik mağazada oluşur; `Transaction.updates` dinleyicisi
//  (StoreKitBridge.swift) bunu yakalar ve yetki normal yoldan gelir.
//
//  Kod, UYGULAMAYA HİÇ GİRMEZ: kullanıcı doğrudan sistem sayfasına yazar.
//  Kodu uygulamada tutmak, ekran görüntüsü ve pano üzerinden sızma yüzeyi
//  açardı.
//
import Foundation
import React
import StoreKit
import UIKit

@objc(EvenGirlRedemption)
final class RedemptionBridge: NSObject {

    @objc static func requiresMainQueueSetup() -> Bool { true }

    @objc(isSupported:rejecter:)
    func isSupported(
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        if #available(iOS 16.0, *) {
            resolve(true)
        } else if #available(iOS 14.0, *) {
            resolve(true)
        } else {
            resolve(false)
        }
    }

    @objc(presentCodeRedemptionSheet:rejecter:)
    func presentCodeRedemptionSheet(
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        Task { @MainActor in
            if #available(iOS 16.0, *) {
                guard let scene = Self.activeScene else {
                    reject("no_scene", "Etkin pencere bulunamadı", nil)
                    return
                }
                do {
                    try await AppStore.presentOfferCodeRedeemSheet(in: scene)
                    resolve(nil)
                } catch {
                    reject("redeem_failed", "Kod sayfası açılamadı", error)
                }
                return
            }

            if #available(iOS 14.0, *) {
                // iOS 14-15: eski StoreKit API'si. Tamamlanma geri bildirimi
                // yoktur; sayfanın açıldığını varsayıyoruz ve yetki tazelemesi
                // JS tarafında yapılıyor.
                SKPaymentQueue.default().presentCodeRedemptionSheet()
                resolve(nil)
                return
            }

            reject("unsupported", "iOS 14 ve üzeri gerekiyor", nil)
        }
    }

    @MainActor
    private static var activeScene: UIWindowScene? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
    }
}
