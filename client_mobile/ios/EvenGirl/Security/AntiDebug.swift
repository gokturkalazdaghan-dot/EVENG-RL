//
//  AntiDebug.swift
//  EvenGirl
//
//  Hata ayıklayıcı (LLDB) ve dinamik analiz aracı (Frida) tespiti.
//
//  NE YAPAR, NE YAPMAZ
//  - Yapar: debugger'ın süreçle ilişkilendiğini tespit eder, periyodik olarak
//    yeniden kontrol eder (açılışta temiz olup sonradan attach edilen LLDB'yi
//    yakalamak için), Frida'nın açtığı yerel portları ve enjekte ettiği
//    kütüphaneleri arar.
//  - Yapmaz: kararlı bir saldırganı kalıcı olarak durduramaz. Amaç, otomatik
//    araçlarla yapılan toplu analizin ve "5 dakikada premium açma" tipi
//    rehberlerin maliyetini yükseltmektir. Gerçek yetki kararı SUNUCUDA verilir
//    (bkz. server/revenuecat-webhook.example.js) — istemci kararı asla tek
//    doğruluk kaynağı değildir.
//
import Darwin
import Foundation

enum AntiDebug {

    // MARK: - Debugger tespiti

    /// `sysctl(KERN_PROC)` ile P_TRACED bayrağını okur.
    ///
    /// Bu, Apple'ın belgelenmiş (public) API'sidir; `ptrace(PT_DENY_ATTACH)`
    /// gibi private API kullanımı DEĞİLDİR ve App Store incelemesinde sorun
    /// çıkarmaz. PT_DENY_ATTACH bilinçli olarak KULLANILMAMAKTADIR:
    /// geçmişte reddedilme sebebi olmuş, üstelik tek talimatla (`ret`)
    /// yamalanabildiği için koruma değeri düşüktür.
    static func isDebuggerAttached() -> Bool {
        var info = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]

        let result = mib.withUnsafeMutableBufferPointer { pointer -> Int32 in
            sysctl(pointer.baseAddress, u_int(pointer.count), &info, &size, nil, 0)
        }
        guard result == 0 else { return false }

        return (info.kp_proc.p_flag & P_TRACED) != 0
    }

    /// İkinci bağımsız kanal: getppid(). Normalde ana süreç launchd'dir (1).
    /// LLDB'nin başlattığı süreçte ebeveyn debugger olur.
    static func hasUnexpectedParent() -> Bool {
        getppid() != 1
    }

    // MARK: - Frida tespiti

    /// Frida varsayılan olarak 27042 (ve gadget modunda 27043) portlarını
    /// dinler. Port taraması tek başına kanıt değildir ama diğer sinyallerle
    /// birlikte puanı yükseltir.
    static func hasFridaListeningPorts() -> Bool {
        let candidatePorts: [UInt16] = [27042, 27043]

        for port in candidatePorts {
            let socketFd = socket(AF_INET, SOCK_STREAM, 0)
            guard socketFd >= 0 else { continue }
            defer { close(socketFd) }

            var addr = sockaddr_in()
            addr.sin_family = sa_family_t(AF_INET)
            addr.sin_port = port.bigEndian
            addr.sin_addr.s_addr = inet_addr("127.0.0.1")

            let connected = withUnsafePointer(to: &addr) { pointer in
                pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPointer in
                    connect(socketFd, sockPointer, socklen_t(MemoryLayout<sockaddr_in>.size)) == 0
                }
            }
            if connected { return true }
        }
        return false
    }

    // MARK: - Sürekli izleme

    private static var monitorTimer: DispatchSourceTimer?
    private static let monitorQueue = DispatchQueue(label: "com.evengirl.app.security.monitor", qos: .utility)

    /// Açılışta temiz olup sonradan attach edilen debugger'ı yakalamak için
    /// periyodik kontrol. Aralık sabit değil, JITTER'lıdır: sabit periyot,
    /// saldırganın "kontrol anını atlatma" (sleep & patch) işini kolaylaştırır.
    static func startMonitoring(interval: TimeInterval = 5.0, onViolation: @escaping ([IntegrityFinding]) -> Void) {
        stopMonitoring()

        let timer = DispatchSource.makeTimerSource(queue: monitorQueue)
        timer.schedule(deadline: .now() + interval, repeating: interval, leeway: .seconds(2))
        timer.setEventHandler {
            var findings: [IntegrityFinding] = []

            if isDebuggerAttached() { findings.append(.debuggerAttached) }
            if hasFridaListeningPorts() { findings.append(.hookingFramework) }

            guard !findings.isEmpty else { return }
            DispatchQueue.main.async { onViolation(findings) }
        }
        timer.resume()
        monitorTimer = timer
    }

    static func stopMonitoring() {
        monitorTimer?.cancel()
        monitorTimer = nil
    }
}
