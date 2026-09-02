package com.evengirl.app.security

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import java.io.File

/**
 * Root tespiti.
 *
 * TASARIM: Tek kontrol yetmez — Magisk (özellikle Zygisk + DenyList) klasik
 * kontrollerin çoğunu gizler. Bu yüzden farklı KATEGORİLERDEN sinyal toplanır
 * ve ağırlıklı puan üretilir. Karar eşiği [IntegrityChecker] içindedir.
 *
 * YANLIŞ POZİTİF: Bazı üretici ROM'ları (özellikle Çin pazarı cihazları ve
 * custom ROM kullanan geliştiriciler) test-keys ile imzalıdır. Bu tek başına
 * root değildir; düşük ağırlık verilir.
 */
internal object RootDetector {

    data class Signal(val finding: String, val weight: Int)

    fun collect(context: Context): List<Signal> {
        val signals = mutableListOf<Signal>()

        // Kategori 1 — su/magisk ikilikleri. Orta güç: DenyList gizleyebilir.
        if (hasRootBinaries()) signals += Signal("ROOTED", 60)

        // Kategori 2 — Bilinen yönetici paketleri. Orta güç.
        if (hasRootPackages(context)) signals += Signal("ROOTED", 60)

        // Kategori 3 — `su` PATH üzerinde çalıştırılabiliyor mu. GÜÇLÜ.
        if (canExecuteSu()) signals += Signal("ROOTED", 100)

        // Kategori 4 — Sistem bölümü yazılabilir mi. GÜÇLÜ:
        // /system normalde salt-okunur mount edilir.
        if (isSystemPartitionWritable()) signals += Signal("ROOTED", 100)

        // Kategori 5 — Build imzası. ZAYIF (yanlış pozitif riski yüksek).
        if (isTestKeysBuild()) signals += Signal("ROOTED", 25)

        // Kategori 6 — Emülatör. Bloklamaz, yalnızca puana katkı verir.
        if (isEmulator()) signals += Signal("EMULATOR", 20)

        return signals
    }

    private fun hasRootBinaries(): Boolean =
        Obf.strings(Obf.rootBinaryPaths).any { path ->
            val file = File(path)
            // exists() hook'lanabilir; canRead() ikinci bağımsız kanaldır.
            file.exists() || file.canRead()
        }

    private fun hasRootPackages(context: Context): Boolean {
        val pm = context.packageManager
        return Obf.strings(Obf.rootPackageNames).any { pkg ->
            runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    pm.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0))
                } else {
                    @Suppress("DEPRECATION")
                    pm.getPackageInfo(pkg, 0)
                }
                true
            }.getOrDefault(false)
        }
    }

    /**
     * `which su` çalıştırır. Süreç oluşturmak pahalıdır (~20 ms) ama
     * dosya sistemi gizleme tekniklerinin çoğunu aşar.
     */
    private fun canExecuteSu(): Boolean = runCatching {
        val process = ProcessBuilder("which", "su").redirectErrorStream(true).start()
        val output = process.inputStream.bufferedReader().use { it.readText() }
        process.waitFor()
        output.isNotBlank()
    }.getOrDefault(false)

    private fun isSystemPartitionWritable(): Boolean = runCatching {
        // /proc/mounts, /system'in hangi bayraklarla mount edildiğini gösterir.
        File("/proc/mounts").readLines().any { line ->
            val parts = line.split(" ")
            parts.size >= 4 &&
                (parts[1] == "/system" || parts[1] == "/") &&
                parts[3].split(",").contains("rw")
        }
    }.getOrDefault(false)

    private fun isTestKeysBuild(): Boolean =
        Build.TAGS?.contains("test-keys") == true

    private fun isEmulator(): Boolean =
        Build.FINGERPRINT.startsWith("generic") ||
            Build.FINGERPRINT.contains("vbox") ||
            Build.FINGERPRINT.contains("emulator") ||
            Build.MODEL.contains("Emulator") ||
            Build.MODEL.contains("Android SDK built for") ||
            Build.MANUFACTURER.contains("Genymotion") ||
            Build.PRODUCT == "sdk_gphone64_arm64"
}
