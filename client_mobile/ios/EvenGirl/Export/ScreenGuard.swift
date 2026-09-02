//
//  ScreenGuard.swift
//  EvenGirl
//
//  Ekran görüntüsü / kayıt koruması (iOS).
//
//  iOS'ta Android'in FLAG_SECURE karşılığı YOKTUR. Yapılabilecekler:
//    1. UIScreen.isCaptured — ekran kaydediliyor veya yansıtılıyorsa true.
//       Değişimi capturedDidChangeNotification ile izlenir.
//    2. Kayıt algılandığında pencere içeriği opak bir katmanla kapatılır.
//    3. Ekran görüntüsü ALINDIKTAN sonra userDidTakeScreenshotNotification
//       ile haber verilir (engellenemez, yalnızca tepki verilebilir).
//    4. Hassas alanlar UITextField.isSecureTextEntry katmanına gömülerek
//       ekran görüntüsünde boş çıkar — burada tam ekran kaplama için kullanılır.
//    5. Kalkanla BİRLİKTE bellekteki tam çözünürlük tamponları boşaltılır
//       (ImageBufferRegistry). Ekranı kapatıp belleği bırakmak, korumanın
//       yarısıdır: kalkan çizilene kadarki kareler, arka plan snapshot'ı ve
//       bellek dökümü hâlâ filigransız görüntü taşır.
//
//  KALKAN NEDİR: PaywallGateView — opak, metinli, tek çıkışı olan bir
//  görünüm. Genel bir siyah pencere kullanıcıya arıza gibi görünürdü.
//
import Foundation
import React
import UIKit

@objc(EvenGirlScreenGuard)
final class ScreenGuard: RCTEventEmitter {

    private var protectionEnabled = false
    private var overlayWindow: UIWindow?
    private var secureContainer: UIView?
    private var hasJsListeners = false

    /// Kalkan metinleri JS'ten gelir (dil senkronu tek yerde kalsın diye).
    /// Native tarafta sabit metin tutmak, 8 dilin 9.'sunu yaratırdı.
    private var gateTitle = "EVEN GIRL"
    private var gateBody = ""
    private var gateActionTitle: String?

    override static func requiresMainQueueSetup() -> Bool { true }

    override func supportedEvents() -> [String] {
        ["screenCaptureChanged", "screenshotTaken", "gateContinueTapped"]
    }

    override func startObserving() { hasJsListeners = true }
    override func stopObserving() { hasJsListeners = false }

    // MARK: - Koruma

    @objc
    func enableCaptureProtection() {
        DispatchQueue.main.async {
            guard !self.protectionEnabled else { return }
            self.protectionEnabled = true

            let center = NotificationCenter.default
            center.addObserver(
                self,
                selector: #selector(self.captureStateChanged),
                name: UIScreen.capturedDidChangeNotification,
                object: nil
            )
            center.addObserver(
                self,
                selector: #selector(self.screenshotTaken),
                name: UIApplication.userDidTakeScreenshotNotification,
                object: nil
            )

            self.installSecureLayer()
            self.captureStateChanged()
        }
    }

    @objc
    func disableCaptureProtection() {
        DispatchQueue.main.async {
            guard self.protectionEnabled else { return }
            self.protectionEnabled = false

            NotificationCenter.default.removeObserver(self)
            self.removeSecureLayer()
            self.hideOverlay()
        }
    }

    /// Kalkan metinlerini JS'ten alır. Kalkan görünürken çağrılırsa
    /// metinler yerinde güncellenir — dil değişimi kalkanı kırmaz.
    @objc(setGateStrings:body:actionTitle:)
    func setGateStrings(title: String, body: String, actionTitle: String?) {
        DispatchQueue.main.async {
            self.gateTitle = title
            self.gateBody = body
            self.gateActionTitle = actionTitle

            if let gate = self.overlayWindow?.rootViewController?.view as? PaywallGateView {
                gate.updateStrings(title: title, body: body, actionTitle: actionTitle)
            }
        }
    }

    /// Bellekteki tam çözünürlük tamponlarını boşaltır.
    ///
    /// JS politikası (`CaptureShield.decideCaptureResponse`) `purgeBuffers`
    /// döndürdüğünde çağrılır. Native taraf da yakalama anında kendiliğinden
    /// çağırır — JS thread'i meşgulse köprü yanıtını beklemek, korunmak
    /// istenen karelerin geçmesi demektir.
    @objc
    func purgeImageBuffers() {
        ImageBufferRegistry.shared.purgeAll()
    }

    /// Şu anda korunan bir tampon var mı (politika bağlamı için).
    @objc(hasProtectedBuffer:rejecter:)
    func hasProtectedBuffer(
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async {
            resolve(ImageBufferRegistry.shared.hasActiveBuffers)
        }
    }

    @objc(isCaptured:rejecter:)
    func isCaptured(
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async {
            resolve(UIScreen.main.isCaptured)
        }
    }

    // MARK: - Olaylar

    @objc
    private func captureStateChanged() {
        let captured = UIScreen.main.isCaptured

        if captured {
            // SIRA ÖNEMLİ: önce bellek boşaltılır, sonra kalkan çizilir.
            // Ters sıra, kalkanın çizildiği kare ile boşaltmanın gerçekleştiği
            // kare arasında tam çözünürlük görüntünün bellekte kalması demek.
            ImageBufferRegistry.shared.purgeAll()
            showOverlay()
        } else {
            hideOverlay()
        }

        guard hasJsListeners else { return }
        sendEvent(withName: "screenCaptureChanged", body: ["captured": captured])
    }

    @objc
    private func screenshotTaken() {
        // Ekran görüntüsü ENGELLENEMEZ; bildirim kare ALINDIKTAN sonra gelir.
        // Yapılabilecek tek anlamlı şey: bir SONRAKİ kareyi korumak.
        //
        // Boşaltma ve kalkan burada JS yanıtını BEKLEMEDEN yapılır. Köprüyü
        // beklemek, JS thread'i meşgulken korunmak istenen karelerin geçmesi
        // demektir; JS tarafı kararı ayrıca alır ve paywall yönlendirmesini
        // o yapar.
        ImageBufferRegistry.shared.purgeAll()
        showOverlay()

        guard hasJsListeners else { return }
        sendEvent(withName: "screenshotTaken", body: nil)
    }

    /// Kalkanı kaldırır ve tamponların yeniden yüklenmesini ister.
    ///
    /// JS tarafı `shouldLiftShield` true döndürdüğünde çağırır (abonelik
    /// alındı, kayıt durdu). Native taraf tek başına karar VERMEZ: ekran
    /// görüntüsü sonrası kalkanın ne zaman kalkacağı bir ürün kararıdır.
    @objc
    func dismissGate() {
        DispatchQueue.main.async { self.hideOverlay() }
    }

    // MARK: - Güvenli katman

    /// `isSecureTextEntry` açık bir UITextField'in katmanı, ekran görüntüsü ve
    /// kayıtta BOŞ render edilir. Uygulama içeriğini bu katmana taşımak,
    /// iOS'ta FLAG_SECURE'a en yakın davranışı verir.
    private func installSecureLayer() {
        guard secureContainer == nil,
              let window = Self.keyWindow else { return }

        let field = UITextField()
        field.isSecureTextEntry = true
        guard let secureView = field.layer.sublayers?.first?.delegate as? UIView else { return }

        secureView.translatesAutoresizingMaskIntoConstraints = false
        secureView.isUserInteractionEnabled = false

        // Mevcut alt görünümler güvenli katmana taşınır.
        let existing = window.subviews
        window.addSubview(secureView)
        NSLayoutConstraint.activate([
            secureView.topAnchor.constraint(equalTo: window.topAnchor),
            secureView.bottomAnchor.constraint(equalTo: window.bottomAnchor),
            secureView.leadingAnchor.constraint(equalTo: window.leadingAnchor),
            secureView.trailingAnchor.constraint(equalTo: window.trailingAnchor)
        ])
        existing.forEach { secureView.addSubview($0) }

        secureContainer = secureView
    }

    private func removeSecureLayer() {
        guard let secureView = secureContainer, let window = Self.keyWindow else { return }
        secureView.subviews.forEach { window.addSubview($0) }
        secureView.removeFromSuperview()
        secureContainer = nil
    }

    // MARK: - Kayıt kaplaması

    private func showOverlay() {
        guard overlayWindow == nil, let scene = Self.activeScene else { return }

        let gate = PaywallGateView(
            title: gateTitle,
            body: gateBody,
            actionTitle: gateActionTitle
        )
        gate.onContinue = { [weak self] in
            // Kalkan kapatılmaz — paywall'ı JS açar. Kalkanı burada kapatmak,
            // paywall yüklenene kadar korumasız kareler bırakırdı.
            guard let self, self.hasJsListeners else { return }
            self.sendEvent(withName: "gateContinueTapped", body: nil)
        }

        let root = UIViewController()
        root.view = gate

        // `.alert + 1`: sistem uyarılarının da üstünde. Bir alert'in kalkanın
        // üstüne çıkması, altındaki içeriğin kenarlarını görünür bırakırdı.
        let window = UIWindow(windowScene: scene)
        window.windowLevel = .alert + 1
        window.rootViewController = root
        window.isHidden = false
        overlayWindow = window
    }

    private func hideOverlay() {
        overlayWindow?.isHidden = true
        overlayWindow = nil
    }

    private static var activeScene: UIWindowScene? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
    }

    private static var keyWindow: UIWindow? {
        activeScene?.windows.first { $0.isKeyWindow }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}
