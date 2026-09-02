package com.evengirl.app.inference

import android.app.ActivityManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.gpu.CompatibilityList
import org.tensorflow.lite.gpu.GpuDelegate
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Cihaz üstü çıkarım — TensorFlow Lite.
 *
 * TASARIM KARARLARI
 *
 * 1. PİKSEL VERİSİ JS KÖPRÜSÜNDEN GEÇMEZ. Giriş/çıkış URI olarak taşınır;
 *    tüm bitmap işi burada kalır. 4K bir kareyi köprüden geçirmek tek başına
 *    yüzlerce ms ve iki kat bellek demektir.
 *
 * 2. DELEGATE SEÇİMİ JS'TEN GELİR. Termal kararı ThermalPolicy verir
 *    (src/performance/ThermalPolicy.ts); burada yalnızca uygulanır. GPU
 *    delegate her zaman daha iyi değildir: küçük modellerde aktarım maliyeti
 *    kazancı yer, ısınmada ise CPU'ya düşmek gerekir.
 *
 * 3. INTERPRETER VE DELEGATE AÇIKÇA KAPATILIR. `Interpreter.close()`
 *    çağrılmazsa native heap'te yüzlerce MB kalır ve JVM GC'si bunu görmez —
 *    uygulama LMK tarafından öldürülür.
 *
 * 4. MODEL DOSYASI MEMORY-MAPPED AÇILIR. Tüm dosyayı heap'e okumak, 68 MB'lık
 *    bir model için gereksiz bir tepe kullanım yaratır.
 */
class TFLiteRuntime(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    private class Session(
        val interpreter: Interpreter,
        val gpuDelegate: GpuDelegate?,
    ) {
        fun close() {
            interpreter.close()
            // Delegate, interpreter'dan SONRA kapatılmalı; ters sıra native
            // çökmeye yol açar.
            gpuDelegate?.close()
        }
    }

    private val sessions = ConcurrentHashMap<String, Session>()
    private val executor = Executors.newSingleThreadExecutor()

    // -------------------------------------------------------- yaşam döngüsü ----

    @ReactMethod
    fun loadModel(path: String, compute: String, promise: Promise) {
        executor.execute {
            runCatching {
                val options = Interpreter.Options()
                var gpuDelegate: GpuDelegate? = null

                when (compute) {
                    "npu" -> {
                        // NNAPI, donanım hızlandırmayı (NPU/DSP) sürücüye
                        // bırakır. Android 8.1+ gerekir; yoksa sessizce CPU'ya
                        // düşer, bu yüzden JS tarafı desteklenen birimleri
                        // ayrıca sorgular.
                        options.setUseNNAPI(true)
                        options.setNumThreads(2)
                    }
                    "gpu" -> {
                        if (CompatibilityList().isDelegateSupportedOnThisDevice) {
                            gpuDelegate = GpuDelegate()
                            options.addDelegate(gpuDelegate)
                        } else {
                            options.setNumThreads(availableThreads())
                        }
                    }
                    else -> {
                        // CPU: tüm çekirdekleri kullanmak ısınmayı artırır;
                        // yarısı gecikme/güç dengesinde daha iyi sonuç verir.
                        options.setNumThreads(availableThreads())
                    }
                }

                val interpreter = Interpreter(mapModelFile(path), options)
                val sessionId = UUID.randomUUID().toString()
                sessions[sessionId] = Session(interpreter, gpuDelegate)
                sessionId
            }
                .onSuccess { promise.resolve(it) }
                .onFailure { promise.reject("model_load_failed", "Model yüklenemedi", it) }
        }
    }

    @ReactMethod
    fun unloadModel(sessionId: String, promise: Promise) {
        executor.execute {
            sessions.remove(sessionId)?.close()
            promise.resolve(null)
        }
    }

    // ------------------------------------------------------------- çıkarım ----

    @ReactMethod
    fun run(sessionId: String, input: ReadableMap, promise: Promise) {
        val session = sessions[sessionId]
        if (session == null) {
            promise.reject("session_not_found", "Model oturumu bulunamadı")
            return
        }

        val sourceUri = input.getString("sourceUri")
        if (sourceUri.isNullOrBlank()) {
            promise.reject("invalid_input", "Kaynak URI yok")
            return
        }
        val maxEdge = if (input.hasKey("maxEdgePx")) input.getInt("maxEdgePx") else 0

        executor.execute {
            val started = System.currentTimeMillis()
            var bitmap: Bitmap? = null
            var output: Bitmap? = null

            try {
                bitmap = decodeScaled(sourceUri, maxEdge)
                if (bitmap == null) {
                    promise.reject("source_unreadable", "Kaynak okunamadı")
                    return@execute
                }

                val inputBuffer = toInputBuffer(bitmap)
                val outputBuffer = ByteBuffer
                    .allocateDirect(bitmap.width * bitmap.height * CHANNELS * BYTES_PER_FLOAT)
                    .order(ByteOrder.nativeOrder())

                session.interpreter.run(inputBuffer, outputBuffer)

                output = toBitmap(outputBuffer, bitmap.width, bitmap.height)
                val outputUri = writeOutput(output)

                promise.resolve(
                    Arguments.createMap().apply {
                        putString("outputUri", outputUri)
                        putInt("durationMs", (System.currentTimeMillis() - started).toInt())
                    },
                )
            } catch (t: Throwable) {
                promise.reject("inference_failed", "Çıkarım başarısız", t)
            } finally {
                // Bitmap'ler native heap'te durur; recycle() çağrılmazsa
                // ardışık karelerde bellek doğrusal büyür.
                bitmap?.recycle()
                output?.recycle()
            }
        }
    }

    // -------------------------------------------------- cihaz yetenekleri ----

    @ReactMethod
    fun deviceTotalRamBytes(promise: Promise) {
        val manager = reactContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val info = ActivityManager.MemoryInfo()
        manager.getMemoryInfo(info)
        promise.resolve(info.totalMem.toDouble())
    }

    @ReactMethod
    fun supportedComputeUnits(promise: Promise) {
        val units = Arguments.createArray()
        // NNAPI, Android 8.1+ ile geldi ama gerçek hızlandırma sürücüye bağlı.
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
            units.pushString("npu")
        }
        if (CompatibilityList().isDelegateSupportedOnThisDevice) {
            units.pushString("gpu")
        }
        units.pushString("cpu")
        promise.resolve(units)
    }

    // ------------------------------------------------------------ yardımcı ----

    private fun availableThreads(): Int =
        (Runtime.getRuntime().availableProcessors() / 2).coerceAtLeast(1)

    /** Model dosyasını memory-mapped açar — heap'e kopyalamaz. */
    private fun mapModelFile(path: String): ByteBuffer {
        val file = File(path)
        file.inputStream().use { stream ->
            return stream.channel.map(FileChannel.MapMode.READ_ONLY, 0, file.length())
        }
    }

    /**
     * Görüntüyü hedef kenara göre ÖLÇEKLENMİŞ olarak çözer.
     *
     * `inSampleSize` ile çözerken küçültmek, tam boyutta çözüp sonra
     * küçültmekten kat kat ucuzdur: 48 MP bir fotoğrafı tam boyutta çözmek
     * tek başına ~190 MB'dır.
     */
    private fun decodeScaled(uri: String, maxEdge: Int): Bitmap? {
        val resolver = reactContext.contentResolver
        val parsed = Uri.parse(uri)

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(parsed)?.use { BitmapFactory.decodeStream(it, null, bounds) }

        val longestEdge = maxOf(bounds.outWidth, bounds.outHeight)
        var sampleSize = 1
        if (maxEdge > 0) {
            while (longestEdge / (sampleSize * 2) >= maxEdge) sampleSize *= 2
        }

        val options = BitmapFactory.Options().apply {
            inSampleSize = sampleSize
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        return resolver.openInputStream(parsed)?.use {
            BitmapFactory.decodeStream(it, null, options)
        }
    }

    private fun toInputBuffer(bitmap: Bitmap): ByteBuffer {
        val buffer = ByteBuffer
            .allocateDirect(bitmap.width * bitmap.height * CHANNELS * BYTES_PER_FLOAT)
            .order(ByteOrder.nativeOrder())

        val pixels = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)

        for (pixel in pixels) {
            // [0,1] normalizasyonu — model tanımına göre değişir.
            buffer.putFloat(((pixel shr 16) and 0xFF) / 255f)
            buffer.putFloat(((pixel shr 8) and 0xFF) / 255f)
            buffer.putFloat((pixel and 0xFF) / 255f)
        }
        buffer.rewind()
        return buffer
    }

    private fun toBitmap(buffer: ByteBuffer, width: Int, height: Int): Bitmap {
        buffer.rewind()
        val pixels = IntArray(width * height)
        for (i in pixels.indices) {
            val r = (buffer.float.coerceIn(0f, 1f) * 255).toInt()
            val g = (buffer.float.coerceIn(0f, 1f) * 255).toInt()
            val b = (buffer.float.coerceIn(0f, 1f) * 255).toInt()
            pixels[i] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
        }
        return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
    }

    /**
     * Çıktıyı ÖNBELLEK dizinine yazar (files/ değil): ara çıktılar
     * yedeklenmemeli ve CacheManager tarafından temizlenebilmeli
     * (bkz. src/storage/paths.ts).
     */
    private fun writeOutput(bitmap: Bitmap): String {
        val directory = File(reactContext.cacheDir, "render").apply { mkdirs() }
        val file = File(directory, "${UUID.randomUUID()}.jpg")
        FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 92, it) }
        return Uri.fromFile(file).toString()
    }

    override fun invalidate() {
        sessions.values.forEach { it.close() }
        sessions.clear()
        executor.shutdownNow()
        super.invalidate()
    }

    private companion object {
        const val NAME = "EvenGirlInference"
        const val CHANNELS = 3
        const val BYTES_PER_FLOAT = 4
    }
}
