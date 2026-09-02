package com.evengirl.app.storage

import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import androidx.documentfile.provider.DocumentFile
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.util.concurrent.Executors

/**
 * Android taslak bulut senkronu — KULLANICININ SEÇTİĞİ klasöre.
 *
 * NEDEN GOOGLE DRIVE API DEĞİL
 * Drive API'si (`drive.appdata`) Google Sign-In ister; bu, uygulamanın
 * kullanıcının Google kimliğini görmesi demektir. Ürünün temel kuralı
 * kimlik bilgisi TALEP ETMEMEK olduğu için Drive SDK'sı bilinçli olarak
 * kullanılmıyor. Bunun yerine Storage Access Framework kullanılıyor:
 * kullanıcı bir kez klasör seçer (Drive, OneDrive, Dropbox veya cihaz
 * belleği — hangi sağlayıcıyı seçerse), izin kalıcı olarak saklanır ve
 * uygulama o ağacın DIŞINA çıkamaz. Hesap yok, jeton yok, kimlik yok.
 *
 * ZERO-DELETION
 * Bu modül HİÇBİR ZAMAN kullanıcı dosyası silmez:
 *   - `upload` zaman damgalı YENİ sürüm yazar, üzerine yazmaz.
 *   - `resolveConflict` seçilmeyen sürümü `archived/` altına TAŞIR.
 * `DocumentFile.delete()` çağrısı bu dosyada yalnızca `archived/` içine
 * taşıma tamamlandıktan sonraki kaynak kopyası için kullanılır (SAF'ta
 * atomik "move" yoktur; kopyala + kaynağı bırak). Kopya doğrulanmadan
 * kaynak asla bırakılmaz.
 *
 * SESSİZ BAŞARISIZLIK YOK
 * Klasör seçilmemişse `provider()` `"none"` döner ve JS tarafı özelliği
 * gizler. Yükleme denemesi `no_folder` ile REDDEDİLİR — kullanıcının
 * "yedeklendi" sanıp hiçbir yere yedeklenmemesi, sessiz veri kaybıdır.
 */
class CloudDraftsModule(
    private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context) {

    override fun getName(): String = NAME

    /** Dosya kopyalama JS köprüsünün iş parçacığını bloke etmemeli. */
    private val io = Executors.newSingleThreadExecutor()

    private val prefs
        get() = context.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)

    // --- Kök klasör -------------------------------------------------------

    /**
     * Kalıcı izinle saklanmış kök ağaç. İzin iptal edildiyse (kullanıcı
     * ayarlardan geri aldı, sağlayıcı kaldırıldı) `null` döner: kaydedilmiş
     * URI'yi izin listesine bakmadan kullanmak, her yazmada güvenlik
     * istisnası fırlatır ve JS tarafına "bilinmeyen hata" olarak yansır.
     */
    private fun rootTree(): DocumentFile? {
        val saved = prefs.getString(KEY_TREE, null) ?: return null
        val uri = Uri.parse(saved)
        val held = context.contentResolver.persistedUriPermissions.any {
            it.uri == uri && it.isReadPermission && it.isWritePermission
        }
        if (!held) return null
        val tree = DocumentFile.fromTreeUri(context, uri) ?: return null
        return if (tree.canWrite()) tree else null
    }

    private fun draftsFolder(create: Boolean): DocumentFile? {
        val root = rootTree() ?: return null
        val existing = root.findFile(DRAFTS_DIR)
        if (existing != null && existing.isDirectory) return existing
        return if (create) root.createDirectory(DRAFTS_DIR) else null
    }

    private fun draftFolder(draftId: String, create: Boolean): DocumentFile? {
        val drafts = draftsFolder(create) ?: return null
        val existing = drafts.findFile(draftId)
        if (existing != null && existing.isDirectory) return existing
        return if (create) drafts.createDirectory(draftId) else null
    }

    /** `<zamanDamgası>.evengirl` sürümleri, YENİDEN ESKİYE sıralı. */
    private fun versionsOf(folder: DocumentFile): List<DocumentFile> =
        folder.listFiles()
            .filter { it.isFile && (it.name ?: "").endsWith(VERSION_SUFFIX) }
            .sortedByDescending { versionIdOf(it) }

    private fun versionIdOf(file: DocumentFile): String =
        (file.name ?: "").removeSuffix(VERSION_SUFFIX)

    // --- JS köprüsü -------------------------------------------------------

    /**
     * Klasör seçtirme niyeti. JS tarafı bu niyeti başlatıp dönen ağaç
     * URI'sini `setFolder` ile geri verir. Niyeti native tarafta
     * başlatmıyoruz çünkü sonuç `Activity.onActivityResult` üzerinden
     * gelir ve modülün etkinlik ömrüne bağlanması gerekir.
     */
    @ReactMethod
    fun folderPickerIntent(promise: Promise) {
        val map = Arguments.createMap()
        map.putString("action", Intent.ACTION_OPEN_DOCUMENT_TREE)
        map.putInt(
            "flags",
            Intent.FLAG_GRANT_READ_URI_PERMISSION or
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
        )
        promise.resolve(map)
    }

    /** Kullanıcının seçtiği ağacı kalıcı izinle saklar. */
    @ReactMethod
    fun setFolder(treeUri: String, promise: Promise) {
        try {
            val uri = Uri.parse(treeUri)
            context.contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
            )
            prefs.edit().putString(KEY_TREE, treeUri).apply()
            promise.resolve(providerName())
        } catch (e: SecurityException) {
            // İzin alınamadıysa URI'yi SAKLAMIYORUZ: saklamak, sonraki her
            // yedeklemenin sessizce başarısız olması demek olurdu.
            promise.reject("permission_denied", e.message, e)
        }
    }

    /**
     * Sağlayıcı adı. Ağaç Google Drive belge sağlayıcısındaysa `"drive"`,
     * başka bir sağlayıcı veya cihaz belleğiyse `"folder"`, hiç klasör
     * seçilmemişse `"none"`.
     *
     * Drive olmayan bir klasör için `"drive"` döndürmek, kullanıcıya
     * arayüzde yalan söylemek olurdu.
     */
    private fun providerName(): String {
        val saved = prefs.getString(KEY_TREE, null) ?: return "none"
        if (rootTree() == null) return "none"
        val authority = Uri.parse(saved).authority ?: return "folder"
        return if (authority == DRIVE_AUTHORITY) "drive" else "folder"
    }

    @ReactMethod
    fun provider(promise: Promise) {
        promise.resolve(providerName())
    }

    /**
     * Yerel dosyayı buluta YENİ SÜRÜM olarak yazar.
     *
     * Var olan sürüme dokunulmaz: iki cihazdan aynı anda kaydeden
     * kullanıcının bir sürümü kaybetmemesi için üzerine yazma yok.
     */
    @ReactMethod
    fun upload(draftId: String, localPath: String, title: String, promise: Promise) {
        io.execute {
            try {
                val source = File(localPath)
                if (!source.isFile) {
                    promise.reject("not_found", "Yerel dosya yok: $localPath")
                    return@execute
                }
                val folder = draftFolder(draftId, create = true)
                if (folder == null) {
                    promise.reject("no_folder", "Bulut klasörü seçilmemiş")
                    return@execute
                }

                val version = System.currentTimeMillis().toString()
                val target = folder.createFile(MIME_DRAFT, version + VERSION_SUFFIX)
                if (target == null) {
                    promise.reject("upload_failed", "Sürüm dosyası oluşturulamadı")
                    return@execute
                }

                val written = context.contentResolver.openOutputStream(target.uri).use { out ->
                    if (out == null) -1L else source.inputStream().use { it.copyTo(out) }
                }
                // Kısmi yazımı başarı saymak, geri yüklemede bozuk taslak
                // demektir: eksikse yarım dosyayı bırakıp hata döndürüyoruz.
                if (written != source.length()) {
                    target.delete()
                    promise.reject("upload_failed", "Eksik yazım: $written/${source.length()}")
                    return@execute
                }

                writeMeta(folder, title, version, source.length())
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("upload_failed", e.message, e)
            }
        }
    }

    /**
     * Başlık ve boyut ayrı meta dosyasında.
     *
     * Dosya adına gömmek, kullanıcının yeniden adlandırdığı bir taslağın
     * kimliğini bozardı; SAF'ta görünen ad kullanıcı tarafından
     * değiştirilebilir.
     */
    private fun writeMeta(folder: DocumentFile, title: String, version: String, sizeBytes: Long) {
        val existing = folder.findFile(META_FILE)
        val file = existing ?: folder.createFile(MIME_JSON, META_FILE) ?: return
        val json = org.json.JSONObject()
            .put("title", title)
            .put("updatedAtMs", version)
            .put("sizeBytes", sizeBytes)
            .toString()
        context.contentResolver.openOutputStream(file.uri, "wt")?.use {
            it.write(json.toByteArray(Charsets.UTF_8))
        }
    }

    private fun readMeta(folder: DocumentFile): org.json.JSONObject? {
        val file = folder.findFile(META_FILE)?.takeIf { it.isFile } ?: return null
        return try {
            val text = context.contentResolver.openInputStream(file.uri)
                ?.use { it.readBytes().toString(Charsets.UTF_8) } ?: return null
            org.json.JSONObject(text)
        } catch (e: Exception) {
            null
        }
    }

    @ReactMethod
    fun download(draftId: String, destinationPath: String, promise: Promise) {
        io.execute {
            try {
                val folder = draftFolder(draftId, create = false)
                if (folder == null) {
                    promise.reject("no_folder", "Bulut klasörü seçilmemiş")
                    return@execute
                }
                val newest = versionsOf(folder).firstOrNull()
                if (newest == null) {
                    promise.reject("not_found", "Taslak bulunamadı: $draftId")
                    return@execute
                }

                // ÖNCE GEÇİCİ DOSYAYA: doğrudan hedefe yazmak, indirme
                // yarıda kesildiğinde kullanıcının ELİNDEKİ SAĞLAM yerel
                // taslağı bozuk bir dosyayla değiştirirdi.
                val destination = File(destinationPath)
                destination.parentFile?.mkdirs()
                val temp = File(destinationPath + ".part")
                val copied = context.contentResolver.openInputStream(newest.uri).use { input ->
                    if (input == null) -1L else temp.outputStream().use { input.copyTo(it) }
                }
                if (copied <= 0L) {
                    temp.delete()
                    promise.reject("download_failed", "Okunamadı: $draftId")
                    return@execute
                }
                if (!temp.renameTo(destination)) {
                    temp.copyTo(destination, overwrite = true)
                    temp.delete()
                }
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("download_failed", e.message, e)
            }
        }
    }

    @ReactMethod
    fun list(promise: Promise) {
        io.execute {
            val out: WritableArray = Arguments.createArray()
            val drafts = draftsFolder(create = false)
            if (drafts == null) {
                promise.resolve(out)
                return@execute
            }
            for (folder in drafts.listFiles()) {
                if (!folder.isDirectory) continue
                val entry = describe(folder) ?: continue
                out.pushMap(entry)
            }
            promise.resolve(out)
        }
    }

    private fun describe(folder: DocumentFile): WritableMap? {
        val versions = versionsOf(folder)
        val newest = versions.firstOrNull() ?: return null
        val meta = readMeta(folder)
        val name = folder.name ?: return null

        val map = Arguments.createMap()
        map.putString("draftId", name)
        map.putString("title", meta?.optString("title")?.takeIf { it.isNotEmpty() } ?: name)
        // Boyut meta'dan değil DOSYADAN: meta bayat olabilir, dosya olamaz.
        map.putDouble("sizeBytes", newest.length().toDouble())
        map.putDouble("updatedAtMs", versionIdOf(newest).toDoubleOrNull() ?: 0.0)
        // SAF sağlayıcısı isteğe bağlı indirme yapabilir; uzunluğu 0 olan
        // bir belge henüz yerelde değildir.
        map.putBoolean("availableOffline", newest.length() > 0L)
        return map
    }

    @ReactMethod
    fun conflicts(promise: Promise) {
        io.execute {
            val out: WritableArray = Arguments.createArray()
            val drafts = draftsFolder(create = false)
            if (drafts == null) {
                promise.resolve(out)
                return@execute
            }
            for (folder in drafts.listFiles()) {
                if (!folder.isDirectory) continue
                val versions = versionsOf(folder)
                // Birden fazla sürüm = çakışma. İKİSİ DE DURUYOR; kullanıcı
                // seçene kadar hiçbiri silinmez.
                if (versions.size < 2) continue
                val entry = describe(folder) ?: continue
                val older = versions[1]
                entry.putString("conflictingVersionId", versionIdOf(older))
                entry.putDouble(
                    "conflictingUpdatedAtMs",
                    versionIdOf(older).toDoubleOrNull() ?: 0.0,
                )
                out.pushMap(entry)
            }
            promise.resolve(out)
        }
    }

    /**
     * Çakışmayı kullanıcının seçimiyle çözer.
     *
     * SEÇİLMEYEN SÜRÜM SİLİNMEZ, `archived/` altına taşınır: kullanıcı
     * yanlış sürümü seçtiğinde geri dönebilmeli. SAF'ta atomik taşıma
     * garanti değildir; `moveDocument` desteklenmiyorsa kopyala + kaynağı
     * bırak yoluna düşülür ve kopya DOĞRULANMADAN kaynak bırakılmaz.
     */
    @ReactMethod
    fun resolveConflict(draftId: String, keepVersionId: String, promise: Promise) {
        io.execute {
            try {
                val folder = draftFolder(draftId, create = false)
                if (folder == null) {
                    promise.reject("no_folder", "Bulut klasörü seçilmemiş")
                    return@execute
                }
                val versions = versionsOf(folder)
                if (versions.none { versionIdOf(it) == keepVersionId }) {
                    // Var olmayan sürümü "tut" demek, HEPSİNİ arşivlemek
                    // olurdu: kullanıcı taslağını kaybetmiş sanır.
                    promise.reject("not_found", "Sürüm yok: $keepVersionId")
                    return@execute
                }
                val archive = folder.findFile(ARCHIVE_DIR)?.takeIf { it.isDirectory }
                    ?: folder.createDirectory(ARCHIVE_DIR)
                if (archive == null) {
                    promise.reject("resolve_failed", "Arşiv klasörü oluşturulamadı")
                    return@execute
                }

                for (version in versions) {
                    if (versionIdOf(version) == keepVersionId) continue
                    if (!archiveVersion(folder, archive, version)) {
                        promise.reject("resolve_failed", "Arşivlenemedi: ${version.name}")
                        return@execute
                    }
                }
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("resolve_failed", e.message, e)
            }
        }
    }

    /** `true` yalnızca sürüm arşivde DOĞRULANDIYSA döner. */
    private fun archiveVersion(
        folder: DocumentFile,
        archive: DocumentFile,
        version: DocumentFile,
    ): Boolean {
        val name = version.name ?: return false

        // Yol 1: sağlayıcı gerçek taşımayı destekliyorsa.
        try {
            val moved = DocumentsContract.moveDocument(
                context.contentResolver,
                version.uri,
                folder.uri,
                archive.uri,
            )
            if (moved != null) return true
        } catch (e: Exception) {
            // Desteklenmiyor; kopyalama yoluna düşülür.
        }

        // Yol 2: kopyala, DOĞRULA, sonra kaynağı bırak.
        val target = archive.createFile(MIME_DRAFT, name) ?: return false
        val expected = version.length()
        val copied = context.contentResolver.openInputStream(version.uri).use { input ->
            if (input == null) return@use -1L
            context.contentResolver.openOutputStream(target.uri).use { out ->
                if (out == null) -1L else input.copyTo(out)
            }
        }
        if (copied != expected) {
            target.delete()
            return false
        }
        return version.delete()
    }

    companion object {
        const val NAME = "EvenGirlCloudDrafts"
        private const val PREFS = "evengirl_cloud_drafts"
        private const val KEY_TREE = "tree_uri"
        private const val DRAFTS_DIR = "EvenGirl Drafts"
        private const val ARCHIVE_DIR = "archived"
        private const val META_FILE = "meta.json"
        private const val VERSION_SUFFIX = ".evengirl"
        private const val MIME_DRAFT = "application/octet-stream"
        private const val MIME_JSON = "application/json"
        private const val DRIVE_AUTHORITY = "com.google.android.apps.docs.storage"
    }
}
