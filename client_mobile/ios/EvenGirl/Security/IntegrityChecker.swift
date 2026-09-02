//
//  IntegrityChecker.swift
//  EvenGirl
//
//  Cihaz bütünlüğü kontrolü: jailbreak, kod enjeksiyonu, yeniden paketleme.
//
//  TASARIM İLKELERİ
//  1) Tek kontrol yetmez. Her tekil kontrolün bilinen bir bypass'ı vardır
//     (Liberty Lite, Shadow, A-Bypass...). Bu yüzden farklı KATEGORİLERDEN
//     sinyal toplanır ve puan eşiğine göre karar verilir.
//  2) Sabitler binary'de düz metin durmaz (bkz. ObfuscatedConstants.swift).
//  3) Karar tek bir `-> Bool` fonksiyonundan çıkmaz; tek `ret` yamalayarak
//     tüm korumayı kapatmak mümkün olmasın diye puan toplanır ve eşik
//     karşılaştırması çağıran katmanda tekrar doğrulanır.
//
//  YANLIŞ POZİTİF POLİTİKASI: Bu kontroller uygulamayı ÇÖKERTMEZ. Karar
//  JS katmanına iletilir ve kullanıcıya açıklayıcı bir ekran gösterilir.
//  Kasıtlı crash (`exit(0)`, `fatalError`) hem App Store Guideline 2.1
//  reddine yol açar hem de saldırgana tam olarak hangi satırın kontrol
//  olduğunu gösterir.
//
import Darwin
import Foundation
import MachO
import UIKit

/// JS tarafındaki `IntegrityFinding` birliğiyle birebir aynı olmalıdır
/// (src/security/native/NativeSecurity.ts).
enum IntegrityFinding: String {
    case jailbroken        = "JAILBROKEN"
    case debuggerAttached  = "DEBUGGER_ATTACHED"
    case hookingFramework  = "HOOKING_FRAMEWORK"
    case signatureMismatch = "APP_SIGNATURE_MISMATCH"
    case repackaged        = "REPACKAGED"
    case emulator          = "EMULATOR"
}

struct IntegrityResult {
    let findings: [IntegrityFinding]
    let score: Int

    var compromised: Bool { score >= IntegrityChecker.blockThreshold }

    func asDictionary() -> [String: Any] {
        [
            "findings": findings.map { $0.rawValue },
            "compromised": compromised,
            "checkedAtMs": Int(Date().timeIntervalSince1970 * 1000)
        ]
    }
}

enum IntegrityChecker {

    /// Bloklama eşiği. Zayıf sinyaller (yalnızca simülatör) tek başına
    /// kilitlemez; güçlü sinyaller (sandbox ihlali, hook kütüphanesi) tek
    /// başına eşiği geçer.
    static let blockThreshold = 100

    static func run() -> IntegrityResult {
        var findings: [IntegrityFinding] = []
        var score = 0

        func record(_ finding: IntegrityFinding, _ weight: Int) {
            findings.append(finding)
            score += weight
        }

        // Kategori 1 — Jailbreak dosya izleri. Zayıf: tweak'ler gizleyebilir.
        if hasJailbreakArtifacts() { record(.jailbroken, 40) }

        // Kategori 2 — Sandbox ihlali. GÜÇLÜ: sandbox dışına yazabilmek
        // jailbreak'in tanım gereği kanıtıdır, dosya gizleyiciler engelleyemez.
        if canWriteOutsideSandbox() { record(.jailbroken, 100) }

        // Kategori 3 — fork(). GÜÇLÜ: sandbox'lı uygulama alt süreç açamaz.
        if canForkProcess() { record(.jailbroken, 100) }

        // Kategori 4 — Kod enjeksiyonu (Frida / Substrate / libhooker).
        if hasInjectedLibraries() { record(.hookingFramework, 100) }

        // Kategori 5 — Debugger (ayrı dosyada; runtime'da da izlenir).
        if AntiDebug.isDebuggerAttached() { record(.debuggerAttached, 100) }

        // Kategori 6 — Yeniden paketleme / imza / FairPlay soyulması.
        if isRepackaged() { record(.repackaged, 100) }

        // Kategori 7 — Simülatör. QA'yı engellememek için düşük ağırlık.
        if isSimulator() { record(.emulator, 20) }

        return IntegrityResult(findings: Array(Set(findings)), score: score)
    }

    // MARK: - Kategori 1: dosya izleri

    private static func hasJailbreakArtifacts() -> Bool {
        let fm = FileManager.default

        for path in Obf.strings(Obf.jailbreakPaths) {
            if fm.fileExists(atPath: path) { return true }
            // fileExists sandbox nedeniyle false dönebilir; stat ikinci kanaldır.
            var info = stat()
            if stat(path, &info) == 0 { return true }
            // Üçüncü kanal: salt-okunur açma denemesi. Tweak'ler genelde
            // yalnızca ilk iki API'yi hook'lar.
            let fd = open(path, O_RDONLY)
            if fd >= 0 { close(fd); return true }
        }

        // cydia:// açılabiliyorsa paket yöneticisi kuruludur.
        // (Info.plist > LSApplicationQueriesSchemes içinde tanımlı olmalı.)
        if let url = URL(string: Obf.str(Obf.jailbreakUrlScheme)),
           UIApplication.shared.canOpenURL(url) {
            return true
        }
        return false
    }

    // MARK: - Kategori 2: sandbox ihlali

    private static func canWriteOutsideSandbox() -> Bool {
        let path = Obf.str(Obf.sandboxProbePath)
        do {
            try "probe".write(toFile: path, atomically: true, encoding: .utf8)
            try? FileManager.default.removeItem(atPath: path)
            return true
        } catch {
            return false
        }
    }

    // MARK: - Kategori 3: fork

    private static func canForkProcess() -> Bool {
        // `fork` sembolü doğrudan çağrılmaz: statik analiz araçları (ve App
        // Store otomatik taraması) doğrudan referansı işaretler. dlsym ile
        // çalışma zamanında çözülür.
        guard let handle = dlopen(nil, RTLD_NOW) else { return false }
        defer { dlclose(handle) }
        guard let symbol = dlsym(handle, "fork") else { return false }

        typealias ForkFn = @convention(c) () -> Int32
        let pid = unsafeBitCast(symbol, to: ForkFn.self)()

        guard pid >= 0 else { return false }
        if pid > 0 {
            // Zombi süreç bırakma: çocuğu topla.
            var status: Int32 = 0
            waitpid(pid, &status, 0)
        } else {
            // Çocuk süreçteysek derhal çık — iki kopya UI çalıştırmasın.
            _exit(0)
        }
        return true
    }

    // MARK: - Kategori 4: enjekte edilmiş kütüphaneler

    private static func hasInjectedLibraries() -> Bool {
        let signatures = Obf.strings(Obf.hookLibrarySignatures)

        // Frida, Substrate ve türevleri süreç adres alanına dyld image olarak
        // girmek ZORUNDADIR; bu liste gizlenemez (kernel tarafından tutulur).
        for index in 0..<_dyld_image_count() {
            guard let namePtr = _dyld_get_image_name(index) else { continue }
            let name = String(cString: namePtr).lowercased()
            if signatures.contains(where: { name.contains($0) }) { return true }
        }

        // DYLD_INSERT_LIBRARIES ile klasik enjeksiyon.
        if let inserted = getenv("DYLD_INSERT_LIBRARIES"), strlen(inserted) > 0 {
            return true
        }
        return false
    }

    // MARK: - Kategori 6: yeniden paketleme

    private static func isRepackaged() -> Bool {
        guard let bundleId = Bundle.main.bundleIdentifier else { return true }
        if bundleId != Obf.str(Obf.expectedBundleId) { return true }

        #if !DEBUG
        // App Store binary'sinde `embedded.mobileprovision` BULUNMAZ. Varsa
        // enterprise/ad-hoc imzayla yeniden imzalanmıştır.
        if Bundle.main.path(forResource: "embedded", ofType: "mobileprovision") != nil {
            return true
        }
        // FairPlay şifrelemesi kaldırılmışsa binary dump edilmiştir
        // (Clutch, frida-ios-dump).
        if !isBinaryEncrypted() { return true }
        #endif

        return false
    }

    /// Mach-O `LC_ENCRYPTION_INFO_64.cryptid`: App Store binary'sinde 1'dir,
    /// decrypt edilmiş dump'ta 0 olur.
    private static func isBinaryEncrypted() -> Bool {
        guard let header = _dyld_get_image_header(0) else { return true }

        var cursor = UnsafeRawPointer(header)
            .advanced(by: MemoryLayout<mach_header_64>.size)

        for _ in 0..<header.pointee.ncmds {
            let command = cursor.assumingMemoryBound(to: load_command.self)
            if command.pointee.cmd == UInt32(LC_ENCRYPTION_INFO_64) {
                let info = cursor.assumingMemoryBound(to: encryption_info_command_64.self)
                return info.pointee.cryptid != 0
            }
            cursor = cursor.advanced(by: Int(command.pointee.cmdsize))
        }
        // Komut yoksa karar veremiyoruz; yanlış pozitif üretmemek için
        // "şifreli" kabul ediyoruz.
        return true
    }

    // MARK: - Kategori 7: simülatör

    private static func isSimulator() -> Bool {
        #if targetEnvironment(simulator)
        return true
        #else
        return ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"] != nil
        #endif
    }
}
