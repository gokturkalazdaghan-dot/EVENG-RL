package com.evengirl.app.billing

import android.content.Intent
import android.net.Uri
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.InAppMessageParams
import com.android.billingclient.api.InAppMessageResult
import com.android.billingclient.api.PurchasesUpdatedListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Play Billing köprüsü — RevenueCat SDK'sının KAPSAMADIĞI mağazaya özgü işler.
 *
 * KAPSAM AYRIMI (bilinçli): Satın alma ve doğrulama RevenueCat üzerinden yürür
 * (o da altta Play Billing Library'yi çağırır). Burada onu tekrarlamıyoruz;
 * ikinci bir satın alma hattı iki doğruluk kaynağı demektir.
 *
 * Buradaki iki şey SDK'da yok:
 *
 * 1. UYGULAMA İÇİ MESAJLAR (showInAppMessages)
 *    Kartı reddedilen bir abone "grace period"a düşer. Play, bu kullanıcıya
 *    kartını güncelletecek bir mesajı UYGULAMA İÇİNDE gösterebilir. Bu çağrı
 *    yapılmazsa kullanıcı sessizce kaybedilir — ölçülebilir gelir kaybıdır
 *    ve kullanıcı da neden erişimini yitirdiğini anlamaz.
 *
 * 2. ABONELİK YÖNETİM DERİN BAĞLANTISI
 *    Play politikası iptalin kolay bulunabilir olmasını ister. Kullanıcıyı
 *    "Play Store > Menü > Abonelikler" tarifiyle baş başa bırakmak destek
 *    yükü üretir.
 */
class PlayBillingBridge(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    /**
     * Yalnızca yukarıdaki iki iş için kullanılan hafif bir istemci.
     * Satın alma dinleyicisi bilinçli olarak BOŞTUR: satın almalar bu hat
     * üzerinden yapılmaz, RevenueCat yönetir.
     */
    private val purchasesUpdatedListener = PurchasesUpdatedListener { _, _ -> }

    private val billingClient: BillingClient by lazy {
        BillingClient.newBuilder(reactContext)
            .setListener(purchasesUpdatedListener)
            .enablePendingPurchases()
            .build()
    }

    /**
     * Play içi mesajları gösterir (ödeme sorunu / grace period kurtarma).
     * Uygulama ön plana her geldiğinde çağrılmalıdır.
     */
    @ReactMethod
    fun showInAppMessages(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("no_activity", "Etkin ekran yok")
            return
        }

        withConnection(promise) {
            val params = InAppMessageParams.newBuilder()
                .addInAppMessageCategoryToShow(InAppMessageParams.InAppMessageCategoryId.TRANSACTIONAL)
                .build()

            billingClient.showInAppMessages(activity, params) { result: InAppMessageResult ->
                // SUBSCRIPTION_STATUS_UPDATED: kullanıcı kartını güncelledi,
                // abonelik canlandı. Yetkiyi hemen tazelemek gerekir, aksi halde
                // ödeme yapmış kullanıcı kilitli kalır.
                val updated =
                    result.responseCode == InAppMessageResult.InAppMessageResponseCode.SUBSCRIPTION_STATUS_UPDATED
                promise.resolve(updated)
            }
        }
    }

    /**
     * Play Store'daki abonelik yönetim sayfasını açar.
     * `sku` verilirse doğrudan o aboneliğe gider.
     */
    @ReactMethod
    fun openSubscriptionManagement(sku: String?, promise: Promise) {
        val base = "https://play.google.com/store/account/subscriptions"
        val url = if (sku.isNullOrBlank()) {
            base
        } else {
            "$base?sku=$sku&package=${reactContext.packageName}"
        }

        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        runCatching { reactContext.startActivity(intent) }
            .onSuccess { promise.resolve(null) }
            .onFailure { promise.reject("open_failed", "Abonelik sayfası açılamadı", it) }
    }

    /** BillingClient bağlantısını kurar, hazır olunca bloğu çalıştırır. */
    private fun withConnection(promise: Promise, block: () -> Unit) {
        if (billingClient.isReady) {
            block()
            return
        }

        billingClient.startConnection(
            object : com.android.billingclient.api.BillingClientStateListener {
                override fun onBillingSetupFinished(result: BillingResult) {
                    if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                        block()
                    } else {
                        promise.reject("billing_unavailable", "Play Billing hazır değil: ${result.responseCode}")
                    }
                }

                override fun onBillingServiceDisconnected() {
                    // Yeniden bağlanmayı DENEMİYORUZ: bu istemci yalnızca
                    // isteğe bağlı işler için; sessizce vazgeçmek, satın alma
                    // akışını etkilemez.
                    promise.reject("billing_disconnected", "Play Billing bağlantısı koptu")
                }
            },
        )
    }

    override fun invalidate() {
        runCatching { billingClient.endConnection() }
        super.invalidate()
    }

    private companion object {
        const val NAME = "EvenGirlPlayBilling"
    }
}
