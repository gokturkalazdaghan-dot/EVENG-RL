//
//  EvenGirlPerformanceModule.swift
//  EvenGirl
//
//  Termal durum, pil ve düşük güç modu sinyallerini JS'e taşır.
//  Karar mantığı JS tarafındadır (src/performance/ThermalPolicy.ts) — burada
//  yalnızca platform sinyalleri normalize edilir.
//
//  NEDEN POLLING YOK: ProcessInfo bildirimleri (notification) olay tabanlıdır.
//  Termal durumu döngüyle yoklamak, tam da önlemeye çalıştığımız pil tüketimini
//  yaratır. Yalnızca pil seviyesi için düşük frekanslı (60 sn) bir zamanlayıcı
//  vardır; UIDevice.batteryLevel bildirimi yalnızca %1 değişimlerde gelir ve
//  şarj durumu değişimini kaçırabilir.
//
import Foundation
import React
import UIKit

@objc(EvenGirlPerformance)
final class EvenGirlPerformanceModule: RCTEventEmitter {

    private var hasJsListeners = false
    private var batteryTimer: DispatchSourceTimer?
    private let timerQueue = DispatchQueue(label: "com.evengirl.app.performance", qos: .utility)

    override static func requiresMainQueueSetup() -> Bool { true }

    override func supportedEvents() -> [String] { ["deviceSignals"] }

    override func startObserving() { hasJsListeners = true }
    override func stopObserving() { hasJsListeners = false }

    // MARK: - Yaşam döngüsü

    @objc
    func startMonitoring() {
        DispatchQueue.main.async {
            UIDevice.current.isBatteryMonitoringEnabled = true

            let center = NotificationCenter.default
            center.addObserver(
                self,
                selector: #selector(self.signalsChanged),
                name: ProcessInfo.thermalStateDidChangeNotification,
                object: nil
            )
            center.addObserver(
                self,
                selector: #selector(self.signalsChanged),
                name: .NSProcessInfoPowerStateDidChange,
                object: nil
            )
            center.addObserver(
                self,
                selector: #selector(self.signalsChanged),
                name: UIDevice.batteryStateDidChangeNotification,
                object: nil
            )

            self.startBatteryTimer()
            self.signalsChanged()
        }
    }

    @objc
    func stopMonitoring() {
        DispatchQueue.main.async {
            NotificationCenter.default.removeObserver(self)
            UIDevice.current.isBatteryMonitoringEnabled = false
            self.batteryTimer?.cancel()
            self.batteryTimer = nil
        }
    }

    /// JS açılışta ilk değeri beklemeden okur: ilk termal bildirim dakikalar
    /// sonra gelebilir ve o ana kadar profil bilinmez.
    @objc(readSignals:rejecter:)
    func readSignals(
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async {
            resolve(self.currentSignals())
        }
    }

    // MARK: - Sinyaller

    @objc
    private func signalsChanged() {
        guard hasJsListeners else { return }
        sendEvent(withName: "deviceSignals", body: currentSignals())
    }

    private func currentSignals() -> [String: Any] {
        let device = UIDevice.current
        let info = ProcessInfo.processInfo

        // batteryLevel, izleme kapalıyken -1 döner; bilinmeyen seviyeyi 1.0
        // olarak raporlamak yanlış olur (pil dolu sanılır ve kısıtlama
        // uygulanmaz), bu yüzden güvenli tarafta 0.5 kabul ediyoruz.
        let level = device.batteryLevel
        let batteryLevel = level < 0 ? 0.5 : Double(level)

        return [
            "thermal": Self.thermalName(info.thermalState),
            "batteryLevel": batteryLevel,
            "isCharging": device.batteryState == .charging || device.batteryState == .full,
            "lowPowerMode": info.isLowPowerModeEnabled
        ]
    }

    private static func thermalName(_ state: ProcessInfo.ThermalState) -> String {
        switch state {
        case .nominal:  return "nominal"
        case .fair:     return "fair"
        case .serious:  return "serious"
        case .critical: return "critical"
        @unknown default: return "fair" // bilinmeyen durumda temkinli davran
        }
    }

    private func startBatteryTimer() {
        batteryTimer?.cancel()
        let timer = DispatchSource.makeTimerSource(queue: timerQueue)
        timer.schedule(deadline: .now() + 60, repeating: 60, leeway: .seconds(10))
        timer.setEventHandler { [weak self] in
            DispatchQueue.main.async { self?.signalsChanged() }
        }
        timer.resume()
        batteryTimer = timer
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        batteryTimer?.cancel()
    }
}
