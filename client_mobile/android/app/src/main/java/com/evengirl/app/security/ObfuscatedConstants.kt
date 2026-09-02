// ÜRETİLMİŞ DOSYA — ELLE DÜZENLEMEYİN.
// Kaynak: tools/obfuscated-strings.json
// Yeniden üretmek için: npm run gen:obf
//
// Buradaki baytlar XOR ile maskelenmiştir. Bu bir şifreleme değildir; amaç
// `strings` ile jailbreak/root tespit sabitlerinin saniyeler içinde bulunup
// yamalanmasını engellemektir. Gerçek koruma, kontrollerin çokluğunda ve
// puanlama mantığının dağıtık olmasındadır.

package com.evengirl.app.security

internal object Obf {
    private val key = byteArrayOf(0x5A.toByte(), 0x31.toByte(), 0xC7.toByte(), 0x8E.toByte(), 0x2D.toByte(), 0x76.toByte(), 0xB4.toByte(), 0x19.toByte())

    fun str(bytes: ByteArray): String {
        val out = ByteArray(bytes.size)
        for (i in bytes.indices) out[i] = (bytes[i].toInt() xor key[i % key.size].toInt()).toByte()
        return String(out, Charsets.UTF_8)
    }

    fun strings(list: Array<ByteArray>): List<String> = list.map { str(it) }

    val rootBinaryPaths: Array<ByteArray> = arrayOf(
        byteArrayOf(0x75.toByte(), 0x42.toByte(), 0xBE.toByte(), 0xFD.toByte(), 0x59.toByte(), 0x13.toByte(), 0xD9.toByte(), 0x36.toByte(), 0x38.toByte(), 0x58.toByte(), 0xA9.toByte(), 0xA1.toByte(), 0x5E.toByte(), 0x03.toByte()), // /system/bin/su
        byteArrayOf(0x75.toByte(), 0x42.toByte(), 0xBE.toByte(), 0xFD.toByte(), 0x59.toByte(), 0x13.toByte(), 0xD9.toByte(), 0x36.toByte(), 0x22.toByte(), 0x53.toByte(), 0xAE.toByte(), 0xE0.toByte(), 0x02.toByte(), 0x05.toByte(), 0xC1.toByte()), // /system/xbin/su
        byteArrayOf(0x75.toByte(), 0x42.toByte(), 0xA5.toByte(), 0xE7.toByte(), 0x43.toByte(), 0x59.toByte(), 0xC7.toByte(), 0x6C.toByte()), // /sbin/su
        byteArrayOf(0x75.toByte(), 0x42.toByte(), 0xBE.toByte(), 0xFD.toByte(), 0x59.toByte(), 0x13.toByte(), 0xD9.toByte(), 0x36.toByte(), 0x3B.toByte(), 0x41.toByte(), 0xB7.toByte(), 0xA1.toByte(), 0x7E.toByte(), 0x03.toByte(), 0xC4.toByte(), 0x7C.toByte(), 0x28.toByte(), 0x44.toByte(), 0xB4.toByte(), 0xEB.toByte(), 0x5F.toByte(), 0x58.toByte(), 0xD5.toByte(), 0x69.toByte(), 0x31.toByte()), // /system/app/Superuser.apk
        byteArrayOf(0x75.toByte(), 0x55.toByte(), 0xA6.toByte(), 0xFA.toByte(), 0x4C.toByte(), 0x59.toByte(), 0xD8.toByte(), 0x76.toByte(), 0x39.toByte(), 0x50.toByte(), 0xAB.toByte(), 0xA1.toByte(), 0x59.toByte(), 0x1B.toByte(), 0xC4.toByte(), 0x36.toByte(), 0x29.toByte(), 0x44.toByte()), // /data/local/tmp/su
        byteArrayOf(0x75.toByte(), 0x42.toByte(), 0xBE.toByte(), 0xFD.toByte(), 0x59.toByte(), 0x13.toByte(), 0xD9.toByte(), 0x36.toByte(), 0x38.toByte(), 0x58.toByte(), 0xA9.toByte(), 0xA1.toByte(), 0x40.toByte(), 0x17.toByte(), 0xD3.toByte(), 0x70.toByte(), 0x29.toByte(), 0x5A.toByte()), // /system/bin/magisk
        byteArrayOf(0x75.toByte(), 0x55.toByte(), 0xA6.toByte(), 0xFA.toByte(), 0x4C.toByte(), 0x59.toByte(), 0xD5.toByte(), 0x7D.toByte(), 0x38.toByte(), 0x1E.toByte(), 0xAA.toByte(), 0xEF.toByte(), 0x4A.toByte(), 0x1F.toByte(), 0xC7.toByte(), 0x72.toByte()), // /data/adb/magisk
        byteArrayOf(0x75.toByte(), 0x42.toByte(), 0xBE.toByte(), 0xFD.toByte(), 0x59.toByte(), 0x13.toByte(), 0xD9.toByte(), 0x36.toByte(), 0x38.toByte(), 0x58.toByte(), 0xA9.toByte(), 0xA1.toByte(), 0x49.toByte(), 0x17.toByte(), 0xD1.toByte(), 0x74.toByte(), 0x35.toByte(), 0x5F.toByte(), 0xB4.toByte(), 0xFB.toByte()), // /system/bin/daemonsu
    )

    val rootPackageNames: Array<ByteArray> = arrayOf(
        byteArrayOf(0x39.toByte(), 0x5E.toByte(), 0xAA.toByte(), 0xA0.toByte(), 0x59.toByte(), 0x19.toByte(), 0xC4.toByte(), 0x73.toByte(), 0x35.toByte(), 0x59.toByte(), 0xA9.toByte(), 0xF9.toByte(), 0x58.toByte(), 0x58.toByte(), 0xD9.toByte(), 0x78.toByte(), 0x3D.toByte(), 0x58.toByte(), 0xB4.toByte(), 0xE5.toByte()), // com.topjohnwu.magisk
        byteArrayOf(0x3F.toByte(), 0x44.toByte(), 0xE9.toByte(), 0xED.toByte(), 0x45.toByte(), 0x17.toByte(), 0xDD.toByte(), 0x77.toByte(), 0x3C.toByte(), 0x58.toByte(), 0xB5.toByte(), 0xEB.toByte(), 0x03.toByte(), 0x05.toByte(), 0xC1.toByte(), 0x69.toByte(), 0x3F.toByte(), 0x43.toByte(), 0xB4.toByte(), 0xFB.toByte()), // eu.chainfire.supersu
        byteArrayOf(0x39.toByte(), 0x5E.toByte(), 0xAA.toByte(), 0xA0.toByte(), 0x46.toByte(), 0x19.toByte(), 0xC1.toByte(), 0x6A.toByte(), 0x32.toByte(), 0x58.toByte(), 0xAC.toByte(), 0xEA.toByte(), 0x58.toByte(), 0x02.toByte(), 0xC0.toByte(), 0x78.toByte(), 0x74.toByte(), 0x42.toByte(), 0xB2.toByte(), 0xFE.toByte(), 0x48.toByte(), 0x04.toByte(), 0xC1.toByte(), 0x6A.toByte(), 0x3F.toByte(), 0x43.toByte()), // com.koushikdutta.superuser
        byteArrayOf(0x3E.toByte(), 0x54.toByte(), 0xE9.toByte(), 0xFC.toByte(), 0x42.toByte(), 0x14.toByte(), 0xC2.toByte(), 0x37.toByte(), 0x3B.toByte(), 0x5F.toByte(), 0xA3.toByte(), 0xFC.toByte(), 0x42.toByte(), 0x1F.toByte(), 0xD0.toByte(), 0x37.toByte(), 0x22.toByte(), 0x41.toByte(), 0xA8.toByte(), 0xFD.toByte(), 0x48.toByte(), 0x12.toByte(), 0x9A.toByte(), 0x70.toByte(), 0x34.toByte(), 0x42.toByte(), 0xB3.toByte(), 0xEF.toByte(), 0x41.toByte(), 0x1A.toByte(), 0xD1.toByte(), 0x6B.toByte()), // de.robv.android.xposed.installer
        byteArrayOf(0x39.toByte(), 0x5E.toByte(), 0xAA.toByte(), 0xA0.toByte(), 0x5E.toByte(), 0x17.toByte(), 0xC1.toByte(), 0x6B.toByte(), 0x33.toByte(), 0x5A.toByte(), 0xE9.toByte(), 0xFD.toByte(), 0x58.toByte(), 0x14.toByte(), 0xC7.toByte(), 0x6D.toByte(), 0x28.toByte(), 0x50.toByte(), 0xB3.toByte(), 0xEB.toByte()), // com.saurik.substrate
    )

    val hookLibrarySignatures: Array<ByteArray> = arrayOf(
        byteArrayOf(0x37.toByte(), 0x5E.toByte(), 0xA5.toByte(), 0xE7.toByte(), 0x41.toByte(), 0x13.toByte(), 0xC7.toByte(), 0x6C.toByte(), 0x38.toByte(), 0x42.toByte(), 0xB3.toByte(), 0xFC.toByte(), 0x4C.toByte(), 0x02.toByte(), 0xD1.toByte()), // mobilesubstrate
        byteArrayOf(0x29.toByte(), 0x44.toByte(), 0xA5.toByte(), 0xFD.toByte(), 0x59.toByte(), 0x04.toByte(), 0xD5.toByte(), 0x6D.toByte(), 0x3F.toByte(), 0x5D.toByte(), 0xA8.toByte(), 0xEF.toByte(), 0x49.toByte(), 0x13.toByte(), 0xC6.toByte()), // substrateloader
        byteArrayOf(0x36.toByte(), 0x58.toByte(), 0xA5.toByte(), 0xE6.toByte(), 0x42.toByte(), 0x19.toByte(), 0xDF.toByte(), 0x7C.toByte(), 0x28.toByte()), // libhooker
        byteArrayOf(0x3C.toByte(), 0x43.toByte(), 0xAE.toByte(), 0xEA.toByte(), 0x4C.toByte()), // frida
        byteArrayOf(0x39.toByte(), 0x48.toByte(), 0xA9.toByte(), 0xE4.toByte(), 0x48.toByte(), 0x15.toByte(), 0xC0.toByte()), // cynject
        byteArrayOf(0x36.toByte(), 0x58.toByte(), 0xA5.toByte(), 0xED.toByte(), 0x54.toByte(), 0x15.toByte(), 0xC6.toByte(), 0x70.toByte(), 0x2A.toByte(), 0x45.toByte()), // libcycript
        byteArrayOf(0x2E.toByte(), 0x46.toByte(), 0xA2.toByte(), 0xEF.toByte(), 0x46.toByte(), 0x1F.toByte(), 0xDA.toByte(), 0x73.toByte(), 0x3F.toByte(), 0x52.toByte(), 0xB3.toByte()), // tweakinject
        byteArrayOf(0x28.toByte(), 0x5E.toByte(), 0xA4.toByte(), 0xE5.toByte(), 0x48.toByte(), 0x02.toByte(), 0xD6.toByte(), 0x76.toByte(), 0x35.toByte(), 0x45.toByte(), 0xB4.toByte(), 0xFA.toByte(), 0x5F.toByte(), 0x17.toByte(), 0xC4.toByte()), // rocketbootstrap
        byteArrayOf(0x36.toByte(), 0x58.toByte(), 0xA5.toByte(), 0xFD.toByte(), 0x58.toByte(), 0x14.toByte(), 0xC7.toByte(), 0x6D.toByte(), 0x33.toByte(), 0x45.toByte(), 0xB2.toByte(), 0xFA.toByte(), 0x48.toByte()), // libsubstitute
    )

    // com.evengirl.app
    val expectedApplicationId: ByteArray = byteArrayOf(0x39.toByte(), 0x5E.toByte(), 0xAA.toByte(), 0xA0.toByte(), 0x48.toByte(), 0x00.toByte(), 0xD1.toByte(), 0x77.toByte(), 0x3B.toByte(), 0x58.toByte(), 0xE9.toByte(), 0xEF.toByte(), 0x5D.toByte(), 0x06.toByte())

    // gum-js-loop
    val fridaThreadName: ByteArray = byteArrayOf(0x3D.toByte(), 0x44.toByte(), 0xAA.toByte(), 0xA3.toByte(), 0x47.toByte(), 0x05.toByte(), 0x99.toByte(), 0x75.toByte(), 0x35.toByte(), 0x5E.toByte(), 0xB7.toByte())

    // frida-agent
    val fridaLibraryName: ByteArray = byteArrayOf(0x3C.toByte(), 0x43.toByte(), 0xAE.toByte(), 0xEA.toByte(), 0x4C.toByte(), 0x5B.toByte(), 0xD5.toByte(), 0x7E.toByte(), 0x3F.toByte(), 0x5F.toByte(), 0xB3.toByte())
}
