package com.evengirl.app.security

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.net.URI
import java.util.concurrent.Executors

/**
 * React Native köprüsü. JS sözleşmesi: src/security/native/NativeSecurity.ts
 *
 * KURAL: Bu sınıf KARAR VERMEZ, kararı taşır. Güvenlik mantığının tamamı
 * native taraftadır; JS bundle'ı değiştirilebilir olduğu için JS'te yapılan
 * bir kontrol koruma sayılmaz.
 */
class EvenGirlSecurityModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    // I/O ağırlıklı kontroller UI thread'ini bloklamamalı.
    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    private val secureStore by lazy { EncryptedPrefsStore(reactContext) }

    private var monitorRunnable: Runnable? = null

    // ---------------------------------------------------------- Bütünlük ----

    @ReactMethod
    fun runIntegrityCheck(promise: Promise) {
        executor.execute {
            runCatching { IntegrityChecker.run(reactContext) }
                .onSuccess { report ->
                    promise.resolve(
                        Arguments.createMap().apply {
                            putArray("findings", Arguments.fromList(report.findings))
                            putBoolean("compromised", report.compromised)
                            putDouble("checkedAtMs", System.currentTimeMillis().toDouble())
                        },
                    )
                }
                .onFailure { promise.reject("integrity_check_failed", it) }
        }
    }

    /**
     * Sürekli izleme: açılışta temiz olup sonradan attach edilen debugger'ı
     * (veya çalışma anında enjekte edilen Frida'yı) yakalar.
     *
     * Aralık sabit tutulmaz — sabit periyot, saldırganın kontrol anını
     * atlatmasını kolaylaştırır.
     */
    @ReactMethod
    fun startContinuousMonitoring() {
        stopContinuousMonitoring()

        val runnable = object : Runnable {
            override fun run() {
                executor.execute {
                    val signals = DebuggerDetector.collect(reactContext)
                    if (signals.isNotEmpty()) {
                        emitViolation(signals.map { it.finding }.distinct())
                    }
                }
                val jitter = (0..3000).random()
                mainHandler.postDelayed(this, MONITOR_INTERVAL_MS + jitter)
            }
        }
        monitorRunnable = runnable
        mainHandler.postDelayed(runnable, MONITOR_INTERVAL_MS)
    }

    @ReactMethod
    fun stopContinuousMonitoring() {
        monitorRunnable?.let { mainHandler.removeCallbacks(it) }
        monitorRunnable = null
    }

    private fun emitViolation(findings: List<String>) {
        val payload = Arguments.createMap().apply {
            putArray("findings", Arguments.fromList(findings))
            putBoolean("compromised", true)
            putDouble("checkedAtMs", System.currentTimeMillis().toDouble())
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("integrityViolation", payload)
    }

    // --------------------------------------------------- Güvenli depolama ----

    @ReactMethod
    fun secureSet(key: String, value: String, promise: Promise) {
        executor.execute {
            runCatching { secureStore.put(key, value) }
                .onSuccess { promise.resolve(null) }
                .onFailure { promise.reject("secure_write_failed", it) }
        }
    }

    @ReactMethod
    fun secureGet(key: String, promise: Promise) {
        executor.execute {
            runCatching { secureStore.get(key) }
                .onSuccess { promise.resolve(it) }
                .onFailure { promise.reject("secure_read_failed", it) }
        }
    }

    @ReactMethod
    fun secureDelete(key: String, promise: Promise) {
        executor.execute {
            runCatching { secureStore.remove(key) }
                .onSuccess { promise.resolve(null) }
                .onFailure { promise.reject("secure_delete_failed", it) }
        }
    }

    // ------------------------------------------------------ Pinlenmiş ağ ----

    @ReactMethod
    fun pinnedFetch(url: String, options: ReadableMap, promise: Promise) {
        executor.execute {
            val host = runCatching { URI(url).host }.getOrNull()
            if (host == null || !PinnedHttpClient.isPinned(host)) {
                // Pin tanımsız host'a bağlanmak pinning'i sessizce kapatmaktır.
                promise.reject("not_pinned", "Bu host için pin tanımlı değil")
                return@execute
            }

            val method = options.getString("method") ?: "GET"
            val body = if (options.hasKey("body")) options.getString("body") else null
            val headers = buildMap {
                options.getMap("headers")?.let { map ->
                    val iterator = map.keySetIterator()
                    while (iterator.hasNextKey()) {
                        val key = iterator.nextKey()
                        map.getString(key)?.let { put(key, it) }
                    }
                }
            }

            runCatching { PinnedHttpClient.execute(url, method, headers, body) }
                .onSuccess { response ->
                    response.use {
                        promise.resolve(
                            Arguments.createMap().apply {
                                putInt("status", it.code)
                                putString("body", it.body?.string() ?: "")
                            },
                        )
                    }
                }
                .onFailure {
                    // Pin uyuşmazlığı ile ağ hatasını AYIRT ETTİRMİYORUZ:
                    // ayrım, saldırgana doğrudan geri bildirimdir.
                    promise.reject("request_failed", "İstek tamamlanamadı")
                }
        }
    }

    override fun invalidate() {
        stopContinuousMonitoring()
        executor.shutdownNow()
        super.invalidate()
    }

    private companion object {
        const val NAME = "EvenGirlSecurity"
        const val MONITOR_INTERVAL_MS = 5_000L
    }
}
