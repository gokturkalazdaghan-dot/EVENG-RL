//
//  ShareBridge.swift
//  EvenGirl
//
//  Instagram Hikayeler ve WhatsApp'a doğrudan aktarım.
//
//  INSTAGRAM: `instagram-stories://share?source_application=<appId>` şeması,
//  içeriği UIPasteboard üzerinden alır. Pano öğesi 5 dakika ömürlüdür ve
//  YALNIZCA Instagram tarafından okunur (com.instagram.sharedSticker.*
//  anahtarları başka uygulamalar tarafından kullanılmaz).
//
//  WHATSAPP: `whatsapp://send` metin taşır ama MEDYA taşımaz. Medya için
//  UIDocumentInteractionController ile "Open In" akışı gerekir; kullanıcı
//  hedefi (Durum, sohbet) WhatsApp içinde seçer.
//
import Foundation
import React
import UIKit

@objc(EvenGirlShare)
final class ShareBridge: NSObject {

    private var documentController: UIDocumentInteractionController?

    @objc static func requiresMainQueueSetup() -> Bool { true }

    // MARK: - Instagram Hikayeler

    @objc(shareToInstagramStories:resolver:rejecter:)
    func shareToInstagramStories(
        input: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard
            let backgroundPath = input["backgroundImagePath"] as? String,
            let appId = input["appId"] as? String
        else {
            reject("invalid_input", "Eksik girdi", nil)
            return
        }

        DispatchQueue.main.async {
            guard let url = URL(string: "instagram-stories://share?source_application=\(appId)"),
                  UIApplication.shared.canOpenURL(url)
            else {
                // Instagram kurulu değil veya şema Info.plist'te bildirilmemiş.
                // Çağıran taraf sistem paylaşım sayfasına düşer.
                reject("instagram_unavailable", "Instagram açılamıyor", nil)
                return
            }

            guard let image = Self.loadImage(from: backgroundPath),
                  let data = image.pngData()
            else {
                reject("image_unreadable", "Görsel okunamadı", nil)
                return
            }

            var items: [String: Any] = ["com.instagram.sharedSticker.backgroundImage": data]

            if let stickerPath = input["stickerImagePath"] as? String,
               let sticker = Self.loadImage(from: stickerPath),
               let stickerData = sticker.pngData() {
                items["com.instagram.sharedSticker.stickerImage"] = stickerData
            }

            // Pano öğesi 5 dakika sonra düşer: kullanıcının panosunda
            // süresiz bir görsel bırakmıyoruz.
            UIPasteboard.general.setItems(
                [items],
                options: [.expirationDate: Date().addingTimeInterval(300)]
            )

            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { resolve(nil) } else { reject("open_failed", "Instagram açılamadı", nil) }
            }
        }
    }

    // MARK: - WhatsApp

    @objc(shareToWhatsApp:resolver:rejecter:)
    func shareToWhatsApp(
        input: NSDictionary,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let filePath = input["filePath"] as? String else {
            reject("invalid_input", "Dosya yolu yok", nil)
            return
        }

        DispatchQueue.main.async {
            guard let scheme = URL(string: "whatsapp://app"),
                  UIApplication.shared.canOpenURL(scheme)
            else {
                reject("whatsapp_unavailable", "WhatsApp açılamıyor", nil)
                return
            }

            guard let presenter = Self.topViewController() else {
                reject("no_presenter", "Sunum yapılacak ekran yok", nil)
                return
            }

            let fileUrl = URL(fileURLWithPath: filePath.replacingOccurrences(of: "file://", with: ""))
            let controller = UIDocumentInteractionController(url: fileUrl)
            // WhatsApp'ın kendi UTI'si: paylaşım listesinde yalnızca WhatsApp
            // görünür, kullanıcı hedefi uygulama içinde seçer.
            controller.uti = "net.whatsapp.movie"

            self.documentController = controller

            let presented = controller.presentOpenInMenu(
                from: presenter.view.bounds,
                in: presenter.view,
                animated: true
            )
            if presented { resolve(nil) } else { reject("present_failed", "Menü açılamadı", nil) }
        }
    }

    // MARK: - Kurulu mu

    @objc(isInstalled:resolver:rejecter:)
    func isInstalled(
        target: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async {
            let scheme = target == "instagram" ? "instagram-stories://" : "whatsapp://"
            guard let url = URL(string: scheme) else {
                resolve(false)
                return
            }
            resolve(UIApplication.shared.canOpenURL(url))
        }
    }

    // MARK: - Yardımcı

    private static func loadImage(from path: String) -> UIImage? {
        let cleaned = path.replacingOccurrences(of: "file://", with: "")
        return UIImage(contentsOfFile: cleaned)
    }

    private static func topViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }

        var top = scene?.windows.first { $0.isKeyWindow }?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }
}
