package com.evengirl.app.security

import android.content.Context

/**
 * Android tarafındaki bütünlük karar noktası.
 *
 * RootDetector / DebuggerDetector / SignatureVerifier'dan gelen ağırlıklı
 * sinyalleri toplar ve eşiğe göre karar verir. iOS'taki IntegrityChecker ile
 * aynı eşiği (100) ve aynı bulgu isimlerini kullanır; JS tarafı iki platformu
 * ayırt etmek zorunda kalmaz.
 *
 * KASITLI CRASH YOK: Uygulama `System.exit()` ile kapatılmaz. Kararı JS'e
 * iletiriz ve açıklayıcı bir ekran gösteririz. Kasıtlı çökme hem Play Console
 * "kararlılık" metriklerini bozar hem de saldırgana hangi satırın kontrol
 * olduğunu net biçimde işaret eder.
 */
internal object IntegrityChecker {

    const val BLOCK_THRESHOLD = 100

    data class Report(
        val findings: List<String>,
        val score: Int,
    ) {
        val compromised: Boolean get() = score >= BLOCK_THRESHOLD
    }

    fun run(context: Context): Report {
        val signals = buildList {
            addAll(RootDetector.collect(context).map { it.finding to it.weight })
            addAll(DebuggerDetector.collect(context).map { it.finding to it.weight })
            addAll(SignatureVerifier.collect(context).map { it.finding to it.weight })
        }

        val score = signals.sumOf { it.second }
        val findings = signals.map { it.first }.distinct()

        return Report(findings = findings, score = score)
    }
}
