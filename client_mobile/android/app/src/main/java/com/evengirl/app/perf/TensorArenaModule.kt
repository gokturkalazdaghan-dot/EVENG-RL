package com.evengirl.app.perf

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Native tensor belleğinin AÇIK ömür yönetimi (Android).
 *
 * NEDEN GEREKLİ
 * TFLite tensor'ları Java heap'inde değil native heap'te durur. Java GC'si
 * native belleği SAYMAZ: 4K bir kare için ayrılan 100+ MB, JS ve Java tarafı
 * "boş" görünürken tutulabilir. Sonuç Low Memory Killer tarafından
 * öldürülme; kullanıcı için "uygulama kapandı".
 *
 * Bu modül olmadan `TensorArena` sessizce -1 döndürüp ayırdığını sanıyordu.
 *
 * NEDEN `allocateDirect`
 * Doğrudan ByteBuffer, native heap'te yer alır ve TFLite'a KOPYASIZ
 * geçirilebilir. Java dizisi kullanmak her çıkarımda bir kopya demektir —
 * 4K bir kare için bu, işlem başına onlarca megabaytlık gereksiz trafik.
 */
class TensorArenaModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    private data class Allocation(val arenaId: String, val buffer: ByteBuffer, val bytes: Int)

    /**
     * Eşzamanlı harita: çıkarım kuyruğu ve JS köprüsü aynı anda yazar.
     * Senkronsuz bir HashMap burada bozulur ve serbest bırakma kaybolur.
     */
    private val allocations = ConcurrentHashMap<Int, Allocation>()
    private val nextHandle = AtomicInteger(1)

    override fun getName(): String = NAME

    @ReactMethod
    fun allocate(arenaId: String, bytes: Double, label: String, promise: Promise) {
        val size = bytes.toInt()
        if (size <= 0) {
            promise.reject("invalid_size", "Ayırma boyutu pozitif olmalı: $size")
            return
        }

        try {
            // allocateDirect sıfırlanmış bellek verir; artık veri modele girmez.
            val buffer = ByteBuffer.allocateDirect(size)
            val handle = nextHandle.getAndIncrement()
            allocations[handle] = Allocation(arenaId, buffer, size)
            promise.resolve(handle)
        } catch (e: OutOfMemoryError) {
            // OOM YAKALANIR ve JS'e HATA olarak döner. Yakalanmazsa süreç
            // ölür ve kullanıcı sebebini hiç öğrenemez; hata dönerse
            // uygulama daha küçük bir çözünürlükle yeniden deneyebilir.
            promise.reject("out_of_memory", "$size bayt ayrılamadı", e)
        }
    }

    @ReactMethod
    fun release(handle: Double, promise: Promise) {
        // Bilinmeyen tutamaç HATA DEĞİLDİR: arena kapanışı ile tek tek
        // serbest bırakma yarışabilir ve ikinci çağrı zaten bırakılmış bir
        // tutamacı görür.
        allocations.remove(handle.toInt())
        promise.resolve(null)
    }

    @ReactMethod
    fun releaseAll(arenaId: String, promise: Promise) {
        val handles = allocations.entries.filter { it.value.arenaId == arenaId }.map { it.key }
        handles.forEach { allocations.remove(it) }

        // Doğrudan ByteBuffer'lar referans düştüğünde bırakılır; GC'yi
        // ÖNERMEK, büyük bir arena kapandığında geri kazanımı hızlandırır.
        // Zorlamaz — System.gc() bir istektir, garanti değil.
        if (handles.isNotEmpty()) System.gc()

        promise.resolve(handles.size)
    }

    /**
     * Bu modülün ayırdığı toplam bayt.
     *
     * Debug.getNativeHeapAllocatedSize() DEĞİL: o, tüm süreci ölçer ve
     * başka kütüphanelerin gürültüsünü taşır. Burada uygulamanın kendi
     * tensor baskısı ölçülüyor.
     */
    @ReactMethod
    fun nativeHeapUsedBytes(promise: Promise) {
        promise.resolve(allocations.values.sumOf { it.bytes }.toDouble())
    }

    override fun invalidate() {
        // Köprü yıkılırken sızıntı bırakılmaz.
        allocations.clear()
        super.invalidate()
    }

    private companion object {
        const val NAME = "EvenGirlTensor"
    }
}
