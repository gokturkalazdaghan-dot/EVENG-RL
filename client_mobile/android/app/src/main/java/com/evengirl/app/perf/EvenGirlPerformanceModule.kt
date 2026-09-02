package com.evengirl.app.perf

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Termal durum, pil ve güç tasarrufu sinyallerini JS'e taşır.
 * Karar mantığı JS'tedir (src/performance/ThermalPolicy.ts).
 *
 * NEDEN POLLING YOK: PowerManager.addThermalStatusListener (API 29+) olay
 * tabanlıdır. Sıcaklığı döngüyle yoklamak, tam da önlemeye çalıştığımız pil
 * tüketimini yaratır. API 29 altındaki cihazlarda termal API yoktur; orada
 * yalnızca pil ve güç tasarrufu sinyalleriyle çalışılır (thermal = "nominal").
 */
class EvenGirlPerformanceModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    private val powerManager by lazy {
        reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
    }

    private var thermalListener: PowerManager.OnThermalStatusChangedListener? = null
    private var receiver: BroadcastReceiver? = null

    // ---------------------------------------------------------- yaşam döngüsü ----

    @ReactMethod
    fun startMonitoring() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && thermalListener == null) {
            val listener = PowerManager.OnThermalStatusChangedListener { emitSignals() }
            powerManager.addThermalStatusListener(listener)
            thermalListener = listener
        }

        if (receiver == null) {
            val batteryReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) = emitSignals()
            }
            val filter = IntentFilter().apply {
                addAction(Intent.ACTION_BATTERY_CHANGED)
                addAction(Intent.ACTION_POWER_CONNECTED)
                addAction(Intent.ACTION_POWER_DISCONNECTED)
                addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
            }
            reactContext.registerReceiver(batteryReceiver, filter)
            receiver = batteryReceiver
        }

        emitSignals()
    }

    @ReactMethod
    fun stopMonitoring() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            thermalListener?.let { powerManager.removeThermalStatusListener(it) }
        }
        thermalListener = null

        receiver?.let { runCatching { reactContext.unregisterReceiver(it) } }
        receiver = null
    }

    /** JS açılışta ilk olayı beklemeden okur. */
    @ReactMethod
    fun readSignals(promise: Promise) {
        runCatching { currentSignals() }
            .onSuccess { promise.resolve(it) }
            .onFailure { promise.reject("signals_unavailable", it) }
    }

    // ---------------------------------------------------------------- sinyaller ----

    private fun emitSignals() {
        if (!reactContext.hasActiveReactInstance()) return
        runCatching {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("deviceSignals", currentSignals())
        }
    }

    private fun currentSignals(): WritableMap {
        val batteryIntent = reactContext.registerReceiver(
            null,
            IntentFilter(Intent.ACTION_BATTERY_CHANGED),
        )

        val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        // Seviye okunamadıysa 1.0 raporlamak yanlış olur (pil dolu sanılır ve
        // kısıtlama uygulanmaz); güvenli tarafta 0.5 kabul ediyoruz.
        val batteryLevel = if (level >= 0 && scale > 0) level.toDouble() / scale else 0.5

        val status = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
            status == BatteryManager.BATTERY_STATUS_FULL

        return Arguments.createMap().apply {
            putString("thermal", currentThermalName())
            putDouble("batteryLevel", batteryLevel)
            putBoolean("isCharging", isCharging)
            putBoolean("lowPowerMode", powerManager.isPowerSaveMode)
        }
    }

    /**
     * Android'in 7 kademeli termal durumu, iOS'un 4 kademesine eşlenir.
     * JS tarafı tek bir ölçekle çalışır; platform farkı burada biter.
     */
    private fun currentThermalName(): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "nominal"

        return when (powerManager.currentThermalStatus) {
            PowerManager.THERMAL_STATUS_NONE -> "nominal"
            PowerManager.THERMAL_STATUS_LIGHT -> "fair"
            PowerManager.THERMAL_STATUS_MODERATE -> "fair"
            PowerManager.THERMAL_STATUS_SEVERE -> "serious"
            // CRITICAL ve üstü (EMERGENCY, SHUTDOWN): cihaz kapanmaya yakın.
            else -> "critical"
        }
    }

    override fun invalidate() {
        stopMonitoring()
        super.invalidate()
    }

    private companion object {
        const val NAME = "EvenGirlPerformance"
    }
}
