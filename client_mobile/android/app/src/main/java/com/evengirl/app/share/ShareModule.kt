package com.evengirl.app.share

import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.io.File

/**
 * Instagram Hikayeler ve WhatsApp'a doğrudan aktarım (Android).
 *
 * FileProvider ZORUNLU: Android 7'den beri `file://` URI'si başka uygulamaya
 * verilemez (FileUriExposedException). İçerik `content://` URI olarak ve
 * `FLAG_GRANT_READ_URI_PERMISSION` ile paylaşılır — aksi halde hedef uygulama
 * dosyayı okuyamaz ve paylaşım sessizce boş açılır.
 */
class ShareModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    @ReactMethod
    fun shareToInstagramStories(input: ReadableMap, promise: Promise) {
        val path = input.getString("backgroundImagePath")
        if (path.isNullOrBlank()) {
            promise.reject("invalid_input", "Görsel yolu yok")
            return
        }

        runCatching {
            val uri = contentUriFor(path)
            val intent = Intent("com.instagram.share.ADD_TO_STORY").apply {
                setDataAndType(uri, "image/*")
                putExtra("interactive_asset_uri", uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                setPackage(INSTAGRAM_PACKAGE)
            }

            // resolveActivity null ise Instagram kurulu değil veya bu eylemi
            // desteklemiyor; startActivity çağırmak ActivityNotFoundException
            // fırlatır ve kullanıcı boş ekran görür.
            if (intent.resolveActivity(reactContext.packageManager) == null) {
                throw IllegalStateException("Instagram bulunamadı")
            }
            reactContext.startActivity(intent)
        }
            .onSuccess { promise.resolve(null) }
            .onFailure { promise.reject("instagram_unavailable", it.message, it) }
    }

    @ReactMethod
    fun shareToWhatsApp(input: ReadableMap, promise: Promise) {
        val path = input.getString("filePath")
        val mimeType = input.getString("mimeType") ?: "image/*"

        if (path.isNullOrBlank()) {
            promise.reject("invalid_input", "Dosya yolu yok")
            return
        }

        runCatching {
            val uri = contentUriFor(path)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = mimeType
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                setPackage(WHATSAPP_PACKAGE)
            }

            if (intent.resolveActivity(reactContext.packageManager) == null) {
                throw IllegalStateException("WhatsApp bulunamadı")
            }
            reactContext.startActivity(intent)
        }
            .onSuccess { promise.resolve(null) }
            .onFailure { promise.reject("whatsapp_unavailable", it.message, it) }
    }

    @ReactMethod
    fun isInstalled(target: String, promise: Promise) {
        val packageName = if (target == "instagram") INSTAGRAM_PACKAGE else WHATSAPP_PACKAGE
        val installed = runCatching {
            reactContext.packageManager.getPackageInfo(packageName, 0)
            true
        }.getOrElse { it !is PackageManager.NameNotFoundException }

        promise.resolve(installed)
    }

    private fun contentUriFor(path: String) =
        FileProvider.getUriForFile(
            reactContext,
            "${reactContext.packageName}.fileprovider",
            File(path.removePrefix("file://")),
        )

    private companion object {
        const val NAME = "EvenGirlShare"
        const val INSTAGRAM_PACKAGE = "com.instagram.android"
        const val WHATSAPP_PACKAGE = "com.whatsapp"
    }
}
