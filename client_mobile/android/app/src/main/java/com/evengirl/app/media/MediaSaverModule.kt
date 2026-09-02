package com.evengirl.app.media

import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.util.concurrent.Executors

/**
 * Düzenlenen çıktıyı galeriye kaydeder.
 *
 * İZİN İSTEMEZ (API 29+)
 * Kapsamlı depolama (scoped storage) altında `MediaStore` üzerinden KENDİ
 * eklediğimiz öğeyi yazmak izin gerektirmez. `WRITE_EXTERNAL_STORAGE`
 * yalnızca API 28 ve altında gerekirdi; minSdk 24 olduğu için eski
 * sürümlerde kayıt REDDEDİLİYOR ve kullanıcıya paylaşım yolu bırakılıyor —
 * tüm depolamaya yazma izni istemek, kaçındığımız geniş yetkinin ta kendisi.
 *
 * IS_PENDING İLE ATOMİK
 * Önce `IS_PENDING = 1` ile kayıt açılıyor, veri yazıldıktan sonra
 * temizleniyor. Bu olmadan galeri uygulaması yarım yazılmış dosyayı
 * gösterir ve kullanıcı bozuk bir önizleme görür.
 */
class MediaSaverModule(
    private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context) {

    override fun getName(): String = NAME

    private val io = Executors.newSingleThreadExecutor()

    /** API 29+ için izin gerekmez; altında kayıt yolu kapalı. */
    @ReactMethod
    fun authorizationStatus(promise: Promise) {
        promise.resolve(
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) "granted" else "denied",
        )
    }

    @ReactMethod
    fun save(filePath: String, kind: String, promise: Promise) {
        io.execute {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                // Tüm depolamaya yazma izni istemektense kaydı reddetmek:
                // kullanıcı paylaşım sayfasından yine hedefine ulaşabilir.
                promise.reject("unsupported", "Bu Android sürümünde galeriye kayıt kapalı")
                return@execute
            }

            val source = File(filePath.removePrefix("file://"))
            if (!source.isFile) {
                promise.reject("not_found", "Dosya yok: $filePath")
                return@execute
            }

            val isVideo = kind == "video"
            val collection = if (isVideo) {
                MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            } else {
                MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            }

            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, source.name)
                put(MediaStore.MediaColumns.MIME_TYPE, if (isVideo) "video/mp4" else "image/jpeg")
                put(
                    MediaStore.MediaColumns.RELATIVE_PATH,
                    if (isVideo) "${Environment.DIRECTORY_MOVIES}/$ALBUM"
                    else "${Environment.DIRECTORY_PICTURES}/$ALBUM",
                )
                // Yazma bitene kadar galeride GÖRÜNMEZ.
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }

            var target: Uri? = null
            try {
                target = context.contentResolver.insert(collection, values)
                    ?: throw IllegalStateException("MediaStore kaydı açılamadı")

                val written = context.contentResolver.openOutputStream(target).use { out ->
                    if (out == null) -1L else source.inputStream().use { it.copyTo(out) }
                }
                if (written != source.length()) {
                    throw IllegalStateException("Eksik yazım: $written/${source.length()}")
                }

                context.contentResolver.update(
                    target,
                    ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) },
                    null,
                    null,
                )
                promise.resolve(null)
            } catch (e: Exception) {
                // Yarım kalan kayıt TEMİZLENİR: `IS_PENDING` bırakılırsa
                // galeride görünmeyen ama yer kaplayan bir öğe kalır.
                if (target != null) {
                    runCatching { context.contentResolver.delete(target, null, null) }
                }
                promise.reject("save_failed", e.message, e)
            }
        }
    }

    companion object {
        const val NAME = "EvenGirlMediaSaver"
        private const val ALBUM = "EVEN GIRL"
    }
}
