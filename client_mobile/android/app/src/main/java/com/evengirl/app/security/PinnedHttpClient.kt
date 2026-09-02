package com.evengirl.app.security

import okhttp3.CertificatePinner
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.util.concurrent.TimeUnit

/**
 * SSL Public Key Pinning (SPKI SHA-256) — OkHttp CertificatePinner.
 *
 * Neden sertifika değil public key pinlenir: sertifika her yenilendiğinde
 * (Let's Encrypt'te 90 gün) pin bozulur ve uygulama sahada kilitlenir. SPKI
 * pinlemede aynı anahtar çiftiyle yenilenen sertifika sorun çıkarmaz.
 *
 * OkHttp'nin CertificatePinner'ı Android'in kendi TLS doğrulamasının ÜSTÜNE
 * çalışır: önce standart zincir doğrulaması yapılır (süresi dolmuş/iptal
 * sertifika pin eşleşse bile reddedilir), sonra pin karşılaştırması yapılır.
 *
 * Ek katman: network_security_config.xml (bkz. res/xml) kullanıcı tarafından
 * eklenen CA'lara güveni tamamen kapatır. İki katman birlikte, hem Burp/Charles
 * tipi proxy'leri hem de sistem CA deposuna eklenen kök sertifikaları engeller.
 */
internal object PinnedHttpClient {

    /**
     * host -> pin listesi. Her host için EN AZ 2 pin zorunludur
     * (aktif + henüz yayına alınmamış yedek anahtar).
     *
     * Hesaplama:
     *   openssl s_client -servername api.armanalabs.com -connect api.armanalabs.com:443 \
     *     | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der \
     *     | openssl dgst -sha256 -binary | openssl enc -base64
     */
    private val PINS: Map<String, List<String>> = mapOf(
        "api.armanalabs.com" to listOf(
            "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", // aktif
            "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=", // yedek
        ),
        "crash.armanalabs.com" to listOf(
            "sha256/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=",
            "sha256/DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD=",
        ),
    )

    class PinConfigurationError(message: String) : IllegalStateException(message)

    /** Yedek pin kuralı. Uygulama açılışında bir kez doğrulanır. */
    fun assertConfigurationIsSafe() {
        PINS.forEach { (host, pins) ->
            if (pins.size < 2) {
                throw PinConfigurationError("$host için yedek pin tanımlı değil")
            }
        }
    }

    private val client: OkHttpClient by lazy {
        val pinnerBuilder = CertificatePinner.Builder()
        PINS.forEach { (host, pins) ->
            pins.forEach { pin -> pinnerBuilder.add(host, pin) }
        }

        OkHttpClient.Builder()
            .certificatePinner(pinnerBuilder.build())
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            // Yanıtlar diske yazılmasın: token içeren gövdeler cache'te kalmamalı.
            .cache(null)
            .build()
    }

    fun isPinned(host: String): Boolean = PINS.containsKey(host)

    fun execute(
        url: String,
        method: String,
        headers: Map<String, String>,
        body: String?,
    ): Response {
        val requestBody = body?.toRequestBody("application/json".toMediaType())

        val request = Request.Builder()
            .url(url)
            .method(method, requestBody)
            .apply { headers.forEach { (name, value) -> addHeader(name, value) } }
            .build()

        return client.newCall(request).execute()
    }
}
