package com.evengirl.app.security

import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.os.Build
import android.util.Base64
import java.security.MessageDigest

/**
 * Yeniden paketleme (repackaging) tespiti.
 *
 * Bir APK decompile edilip değiştirildiğinde ORİJİNAL anahtarla yeniden
 * imzalanamaz; saldırgan kendi anahtarını kullanmak zorundadır. İmza özetini
 * karşılaştırmak, "modlu APK" dağıtımına karşı en doğrudan kontroldür.
 *
 * NOT: Beklenen özet, uygulamanın kendi imzasıdır — gizli bir değer değildir,
 * herkes mağazadaki APK'dan hesaplayabilir. Buradaki koruma gizlilikten değil,
 * saldırganın kontrolü de yamalamak zorunda kalmasından gelir.
 *
 * Google Play App Signing kullanılıyorsa buradaki değer, Play Console >
 * Setup > App integrity ekranındaki "App signing key certificate" SHA-256
 * özetidir (upload key DEĞİL).
 */
internal object SignatureVerifier {

    /** Play Console'daki app signing sertifikasının SHA-256 özeti (base64). */
    private const val EXPECTED_SIGNATURE_SHA256 = "REPLACE_WITH_RELEASE_SIGNING_CERT_SHA256_BASE64"

    data class Signal(val finding: String, val weight: Int)

    fun collect(context: Context): List<Signal> {
        val signals = mutableListOf<Signal>()

        if (context.packageName != Obf.str(Obf.expectedApplicationId)) {
            signals += Signal("REPACKAGED", 100)
        }
        if (!hasExpectedSignature(context)) {
            signals += Signal("APP_SIGNATURE_MISMATCH", 100)
        }
        if (isInstalledFromUnknownSource(context)) {
            // Sideload tek başına kötü niyet değildir (kurumsal dağıtım,
            // beta test), bu yüzden düşük ağırlık.
            signals += Signal("REPACKAGED", 30)
        }
        return signals
    }

    private fun hasExpectedSignature(context: Context): Boolean {
        if (EXPECTED_SIGNATURE_SHA256.startsWith("REPLACE_WITH")) {
            // Yapılandırılmamış: sahada yanlış pozitif üretmemek için kontrolü
            // atla. CI, release build'de bu değerin doldurulduğunu doğrular
            // (bkz. verifySigningConfig görevi).
            return true
        }
        return runCatching {
            currentSignatures(context).any { signature ->
                val digest = MessageDigest.getInstance("SHA-256").digest(signature.toByteArray())
                Base64.encodeToString(digest, Base64.NO_WRAP) == EXPECTED_SIGNATURE_SHA256
            }
        }.getOrDefault(false)
    }

    private fun currentSignatures(context: Context): Array<Signature> {
        val pm = context.packageManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val info = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
            info.signingInfo?.let {
                if (it.hasMultipleSigners()) it.apkContentsSigners else it.signingCertificateHistory
            } ?: emptyArray()
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES).signatures
                ?: emptyArray()
        }
    }

    private fun isInstalledFromUnknownSource(context: Context): Boolean = runCatching {
        val pm = context.packageManager
        val installer = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            pm.getInstallSourceInfo(context.packageName).installingPackageName
        } else {
            @Suppress("DEPRECATION")
            pm.getInstallerPackageName(context.packageName)
        }
        installer !in setOf("com.android.vending", "com.google.android.feedback")
    }.getOrDefault(false)
}
