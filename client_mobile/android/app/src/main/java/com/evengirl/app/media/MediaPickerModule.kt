package com.evengirl.app.media

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.util.concurrent.atomic.AtomicReference

/**
 * Fotoğraf/video seçici.
 *
 * İZİN İSTEMEZ — bilerek.
 * Android Fotoğraf Seçici (`MediaStore.ACTION_PICK_IMAGES`, API 33+) ayrı
 * bir süreçte çalışır ve yalnızca kullanıcının SEÇTİĞİ öğeye geçici okuma
 * izni verir; uygulama medya deposuna hiç erişmez. Eski sürümlerde
 * `ACTION_OPEN_DOCUMENT` aynı şekilde izinsiz çalışır.
 *
 * Bu yüzden `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` GEREKMEZ. O izinleri
 * istemek, Play Console'da ayrıca gerekçelendirme formu doldurmayı ve
 * kullanıcıya "tüm fotoğraflarına erişim" sorusu sormayı gerektirirdi —
 * hiç kullanılmayan bir yetki için.
 *
 * SEÇİLEN ÖĞE UYGULAMA KUM HAVUZUNA KOPYALANIR
 * Seçicinin verdiği URI izni süreç yeniden başlayınca kaybolur.
 * Kopyalamadan saklamak, kullanıcının projesini bir dahaki açılışta
 * "dosya yok" hatasıyla bulması demektir.
 */
class MediaPickerModule(
    private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context) {

    override fun getName(): String = NAME

    /** Aynı anda tek seçim; ikinci istek reddedilir ki promise asılı kalmasın. */
    private val pending = AtomicReference<Promise?>(null)

    private val listener: ActivityEventListener =
        object : BaseActivityEventListener() {
            override fun onActivityResult(
                activity: Activity?,
                requestCode: Int,
                resultCode: Int,
                data: Intent?,
            ) {
                if (requestCode != REQUEST_CODE) return
                val promise = pending.getAndSet(null) ?: return

                // İPTAL HATA DEĞİLDİR: kullanıcı vazgeçti. Reddetmek,
                // arayüzde gereksiz bir hata mesajı göstermek olurdu.
                val uri = if (resultCode == Activity.RESULT_OK) data?.data else null
                if (uri == null) {
                    promise.resolve(null)
                    return
                }

                try {
                    promise.resolve(copyIntoSandbox(uri))
                } catch (e: Exception) {
                    promise.reject("copy_failed", e.message, e)
                }
            }
        }

    init {
        context.addActivityEventListener(listener)
    }

    override fun invalidate() {
        context.removeActivityEventListener(listener)
        // Bekleyen promise ÇÖZÜLÜR: modül yok edilirken asılı bırakmak,
        // JS tarafında sonsuza kadar bekleyen bir `await` demektir.
        pending.getAndSet(null)?.reject("cancelled", "Modül kapatıldı")
        super.invalidate()
    }

    @ReactMethod
    fun pick(kind: String, promise: Promise) {
        val activity = context.currentActivity
        if (activity == null) {
            promise.reject("no_activity", "Etkinlik yok")
            return
        }
        if (!pending.compareAndSet(null, promise)) {
            promise.reject("busy", "Seçici zaten açık")
            return
        }

        try {
            activity.startActivityForResult(intentFor(kind), REQUEST_CODE)
        } catch (e: Exception) {
            pending.set(null)
            promise.reject("launch_failed", e.message, e)
        }
    }

    private fun intentFor(kind: String): Intent {
        val mimes = when (kind) {
            "video" -> arrayOf("video/*")
            "any" -> arrayOf("image/*", "video/*")
            else -> arrayOf("image/*")
        }

        // API 33+ : sistem fotoğraf seçicisi, izin gerektirmez.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return Intent(MediaStore.ACTION_PICK_IMAGES).apply {
                type = if (mimes.size == 1) mimes[0] else "*/*"
                if (mimes.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, mimes)
            }
        }

        // Eski sürümler: SAF belge seçici — bu da izin gerektirmez.
        // `ACTION_GET_CONTENT` yerine `OPEN_DOCUMENT`: ikincisi yalnızca
        // belge sağlayıcılarını gösterir ve galeriye tam erişim istemez.
        return Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = if (mimes.size == 1) mimes[0] else "*/*"
            if (mimes.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, mimes)
        }
    }

    private fun copyIntoSandbox(uri: Uri): com.facebook.react.bridge.WritableMap {
        val inbox = File(context.filesDir, INBOX_DIR).apply { mkdirs() }

        val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
        val extension = when {
            mime.startsWith("video/") -> "mp4"
            mime.contains("png") -> "png"
            else -> "jpg"
        }

        // Ad ÇAKIŞMASIN: aynı adlı iki fotoğraf seçen kullanıcı ikinciyi
        // kaybederdi.
        val target = File(inbox, "${System.currentTimeMillis()}.$extension")
        val copied = context.contentResolver.openInputStream(uri).use { input ->
            if (input == null) -1L else target.outputStream().use { input.copyTo(it) }
        }
        if (copied <= 0L) {
            target.delete()
            throw IllegalStateException("Kaynak okunamadı")
        }

        return Arguments.createMap().apply {
            putString("uri", Uri.fromFile(target).toString())
            putString("kind", if (mime.startsWith("video/")) "video" else "photo")
            putDouble("sizeBytes", target.length().toDouble())
        }
    }

    companion object {
        const val NAME = "EvenGirlMediaPicker"
        private const val REQUEST_CODE = 0x4D50 // 'MP'
        private const val INBOX_DIR = "Inbox"
    }
}
