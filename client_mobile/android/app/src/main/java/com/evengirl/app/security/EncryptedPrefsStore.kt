package com.evengirl.app.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Hassas kısa ömürlü değerlerin (entitlement token'ı, model lisansı) saklanması.
 *
 * AES256-GCM ile şifreli SharedPreferences; anahtar Android Keystore'da tutulur
 * ve mümkünse StrongBox'a (donanım güvenlik modülü) yerleştirilir. Anahtar
 * uygulama sürecine ÇIKMAZ — rootlu cihazda dahi ham anahtar dosyadan okunamaz.
 *
 * Düz `SharedPreferences` bu değerler için ASLA kullanılmaz: /data/data altındaki
 * XML dosyası rootlu cihazda düz metin okunur.
 */
internal class EncryptedPrefsStore(context: Context) {

    private val prefs: SharedPreferences = createPrefs(context)

    fun put(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    fun get(key: String): String? = prefs.getString(key, null)

    fun remove(key: String) {
        prefs.edit().remove(key).apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    private companion object {
        const val FILE_NAME = "evengirl_secure_store"

        fun createPrefs(context: Context): SharedPreferences {
            val masterKey = MasterKey.Builder(context, MasterKey.DEFAULT_MASTER_KEY_ALIAS)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                // StrongBox varsa donanım destekli anahtar kullanılır. Bazı
                // cihazlarda StrongBox mevcut ama hatalıdır; bu yüzden
                // istek başarısız olursa yazılım destekli anahtara düşülür.
                .setRequestStrongBoxBacked(true)
                .build()

            return runCatching { build(context, masterKey) }
                .getOrElse {
                    val fallbackKey = MasterKey.Builder(context, MasterKey.DEFAULT_MASTER_KEY_ALIAS)
                        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                        .build()
                    build(context, fallbackKey)
                }
        }

        fun build(context: Context, masterKey: MasterKey): SharedPreferences =
            EncryptedSharedPreferences.create(
                context,
                FILE_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
    }
}
