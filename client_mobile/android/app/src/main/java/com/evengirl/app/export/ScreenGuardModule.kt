package com.evengirl.app.export

import android.app.Activity
import android.os.Build
import android.view.WindowManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.Executor

/**
 * Ekran görüntüsü / kayıt koruması (Android).
 *
 * FLAG_SECURE, ekran görüntüsünü ve ekran kaydını İŞLETİM SİSTEMİ düzeyinde
 * engeller: kayıtta pencere siyah çıkar, screenshot denemesi başarısız olur.
 * iOS'un aksine burada gerçek bir engelleme mümkündür — bu yüzden Android'de
 * kalkan görünümüne gerek yoktur, sistem zaten kareyi vermez.
 *
 * ANDROID 14+ EK OLARAK NE VERİR
 * `Activity.ScreenCaptureCallback`, kullanıcı ekran görüntüsü ALDIĞINDA
 * haber verir. FLAG_SECURE açıkken bu geri çağrı zaten tetiklenmez
 * (deneme başarısız olur); ama koruma KAPALIYKEN — yani kullanıcının hâlâ
 * ücretsiz hakkı varken — olayı görmek, JS tarafının politikayı iOS ile
 * aynı sözleşme üzerinden işletmesini sağlar.
 *
 * TAMPON BOŞALTMA
 * FLAG_SECURE kareyi engeller ama BELLEĞİ temizlemez. `purgeImageBuffers`,
 * iOS'taki `ImageBufferRegistry.purgeAll()` ile aynı sözleşmeyi sunar:
 * tam çözünürlük çıktı bellekte tutulmaz. Android'de bu, JS tarafındaki
 * görüntü önbelleğinin boşaltılması olarak uygulanır (olay JS'e iletilir);
 * native tarafta tutulan ek bir tampon yoktur.
 */
class ScreenGuardModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    private var screenshotCallback: Any? = null

    override fun getName(): String = NAME

    @ReactMethod
    fun enableCaptureProtection() {
        val activity = currentActivity ?: return
        activity.runOnUiThread {
            activity.window.setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE,
            )
            registerScreenshotCallback(activity)
        }
    }

    @ReactMethod
    fun disableCaptureProtection() {
        val activity = currentActivity ?: return
        activity.runOnUiThread {
            activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            unregisterScreenshotCallback(activity)
        }
    }

    /**
     * Android'de "şu anda kaydediliyor mu" sorgusu YOKTUR — FLAG_SECURE zaten
     * engellediği için gerekmez. Sözleşmeyi iOS ile aynı tutmak için false
     * döndürüyoruz.
     */
    @ReactMethod
    fun isCaptured(promise: Promise) {
        promise.resolve(false)
    }

    /**
     * iOS sözleşmesiyle eşleşen no-op olmayan karşılık.
     *
     * Native tarafta tutulan bir tampon olmadığı için boşaltma isteği JS'e
     * iletilir; görüntü önbelleğini boşaltmak orada yapılır. Sessizce hiçbir
     * şey yapmamak, iOS'ta korunan bir şeyin Android'de korunmadığını
     * gizlerdi.
     */
    @ReactMethod
    fun purgeImageBuffers() {
        emit("purgeImageBuffers", null)
    }

    @ReactMethod
    fun hasProtectedBuffer(promise: Promise) {
        // Karar JS tarafında verilir; native tarafın bilgisi yoktur.
        promise.resolve(false)
    }

    /** iOS'taki kalkan görünümünün Android karşılığı yoktur (FLAG_SECURE yeter). */
    @ReactMethod
    fun setGateStrings(title: String?, body: String?, actionTitle: String?) = Unit

    @ReactMethod
    fun dismissGate() = Unit

    // React Native olay yayımı için gerekli; olmadan uyarı basılır.
    @ReactMethod
    fun addListener(eventName: String?) = Unit

    @ReactMethod
    fun removeListeners(count: Int) = Unit

    // ------------------------------------------------------------ dahili ----

    private fun registerScreenshotCallback(activity: Activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
        if (screenshotCallback != null) return

        val executor = Executor { command -> activity.runOnUiThread(command) }
        val callback = Activity.ScreenCaptureCallback {
            // FLAG_SECURE açıkken buraya normalde gelinmez; geldiyse koruma
            // beklenmedik şekilde düşmüş demektir ve JS bunu bilmeli.
            emit("screenshotTaken", null)
        }
        activity.registerScreenCaptureCallback(executor, callback)
        screenshotCallback = callback
    }

    private fun unregisterScreenshotCallback(activity: Activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
        val callback = screenshotCallback as? Activity.ScreenCaptureCallback ?: return
        activity.unregisterScreenCaptureCallback(callback)
        screenshotCallback = null
    }

    private fun emit(event: String, payload: Any?) {
        if (!reactContext.hasActiveReactInstance()) return
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, payload)
    }

    private companion object {
        const val NAME = "EvenGirlScreenGuard"
    }
}
