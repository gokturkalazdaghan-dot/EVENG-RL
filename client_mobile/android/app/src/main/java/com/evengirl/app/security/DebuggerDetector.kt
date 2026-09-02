package com.evengirl.app.security

import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.Debug
import java.io.File
import java.net.InetSocketAddress
import java.net.Socket

/**
 * Hata ayıklayıcı ve dinamik analiz (Frida / Xposed) tespiti.
 *
 * NE YAPAR, NE YAPMAZ: Kararlı bir saldırganı durdurmaz; otomatik araçlarla
 * yapılan toplu analizin maliyetini yükseltir. Abonelik gibi PARA İLE İLGİLİ
 * kararlar burada değil, sunucuda verilir (bkz. server/revenuecat-webhook).
 */
internal object DebuggerDetector {

    data class Signal(val finding: String, val weight: Int)

    fun collect(context: Context): List<Signal> {
        val signals = mutableListOf<Signal>()

        if (isDebuggerConnected()) signals += Signal("DEBUGGER_ATTACHED", 100)
        if (isTracedByAnotherProcess()) signals += Signal("DEBUGGER_ATTACHED", 100)
        if (isDebuggableBuild(context)) signals += Signal("DEBUGGER_ATTACHED", 60)
        if (hasFridaArtifacts()) signals += Signal("HOOKING_FRAMEWORK", 100)

        return signals
    }

    /** Framework API'si — JDWP debugger bağlıysa true. */
    private fun isDebuggerConnected(): Boolean =
        Debug.isDebuggerConnected() || Debug.waitingForDebugger()

    /**
     * `/proc/self/status` içindeki TracerPid alanı, sürece ptrace ile bağlanan
     * sürecin PID'sidir. 0'dan farklıysa (gdb, lldb, frida-server) izleniyoruz.
     * Framework API'sinden bağımsız bir kanaldır; JDWP kapalıyken de yakalar.
     */
    private fun isTracedByAnotherProcess(): Boolean = runCatching {
        File("/proc/self/status").readLines()
            .firstOrNull { it.startsWith("TracerPid:") }
            ?.substringAfter(":")
            ?.trim()
            ?.toIntOrNull()
            ?.let { it != 0 } ?: false
    }.getOrDefault(false)

    /** Release APK'da FLAG_DEBUGGABLE olmamalıdır; varsa yeniden paketlenmiştir. */
    private fun isDebuggableBuild(context: Context): Boolean =
        (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0

    /**
     * Frida üç iz bırakır:
     *   1) enjekte edilen kütüphane süreç bellek haritasında görünür,
     *   2) "gum-js-loop" adlı bir thread açar,
     *   3) varsayılan olarak 27042/27043 portlarını dinler.
     */
    private fun hasFridaArtifacts(): Boolean {
        val libraryName = Obf.str(Obf.fridaLibraryName)
        val threadName = Obf.str(Obf.fridaThreadName)
        val hookSignatures = Obf.strings(Obf.hookLibrarySignatures)

        // 1) /proc/self/maps — enjekte edilmiş .so'lar burada listelenir.
        val mapsHit = runCatching {
            File("/proc/self/maps").readLines().any { line ->
                val lower = line.lowercase()
                lower.contains(libraryName) || hookSignatures.any { lower.contains(it) }
            }
        }.getOrDefault(false)
        if (mapsHit) return true

        // 2) Thread adları.
        val threadHit = runCatching {
            File("/proc/self/task").listFiles()?.any { task ->
                runCatching { File(task, "comm").readText().trim() == threadName }
                    .getOrDefault(false)
            } ?: false
        }.getOrDefault(false)
        if (threadHit) return true

        // 3) Yerel portlar. Tek başına kanıt değil; kısa timeout ile denenir ki
        //    açılış süresini uzatmasın.
        return listOf(27042, 27043).any { port ->
            runCatching {
                Socket().use { socket ->
                    socket.connect(InetSocketAddress("127.0.0.1", port), 120)
                    true
                }
            }.getOrDefault(false)
        }
    }
}
