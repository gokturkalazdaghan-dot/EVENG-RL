/**
 * ModelRegistry — hangi yeteneğin hangi modelle, nerede (cihazda mı sunucuda mı)
 * çalışacağını tanımlar.
 *
 * `offlineCapable: true` olan her yetenek, uçak modunda da tam çalışır.
 */
export type Capability =
  // Video & efekt
  | 'auto-captions'
  | 'object-tracking'
  | 'text-to-video'
  | 'smart-slowmo'
  // Portre & yüz
  | 'face-restore'
  | 'hd-upscale'
  | 'ai-avatar'
  | 'studio-background'
  | 'age-transform'
  // Fotoğraf & üretken
  | 'generative-remove'
  | 'magic-eraser'
  | 'lens-blur'
  | 'generative-expand'
  | 'concept-portrait'
  // Tasarım
  | 'smart-template'
  | 'auto-resize'
  // Manuel & Botox stüdyo (ücretsiz, sınırsız, tamamen yerel)
  | 'manual-reshape'
  | 'botox-jawline'
  | 'skin-smooth'
  | 'blemish-eraser'
  // Even Girl Generate (3-5 kelime + 5 referans foto)
  | 'even-generate'
  | 'light-sync'
  | 'cinematic-bokeh'
  | 'pore-preserve'
  // Moderasyon (kullanıcıya araç olarak gösterilmez)
  | 'nsfw-classify'
  // Temel (model gerektirmeyen) araçlar
  | 'crop'
  | 'color-filter'
  | 'trim';

/** Cihaz üstü model dosyasının tanımı. */
export interface LocalModelSpec {
  /** Derlenmiş CoreML paketi (.mlmodelc). */
  readonly ios: string;
  /** TFLite model dosyası (.tflite). */
  readonly android: string;
  readonly sizeBytes: number;
  /** Model yüklenip çalışırken tepe native bellek ihtiyacı. */
  readonly peakMemoryBytes: number;
  /** Bu kadar RAM'i olmayan cihazda yerel çalıştırma denenmez. */
  readonly minDeviceRamBytes: number;
  /**
   * İndirilen dosyanın SHA-256 özeti.
   *
   * Model dosyaları uygulama paketinde DEĞİL, CDN'den indirilir (toplam
   * ~260 MB; paket boyutuna eklemek indirme oranını düşürür). İndirilen
   * dosya doğrulanmadan çalıştırılmaz: kurcalanmış bir model, cihazda
   * çalışan kod demektir.
   */
  readonly sha256: string;
  /** Model sürümü — güncellemede eski dosya silinir. */
  readonly version: number;
}

export interface ModelDescriptor {
  readonly capability: Capability;
  /** Cihaz üstü model dosyası; yoksa yalnızca sunucuda çalışır. */
  readonly localModel?: LocalModelSpec;
  readonly remoteEndpoint?: string;
  readonly offlineCapable: boolean;
  /** Ücretsiz katmanda kullanılabilir mi. */
  readonly free: boolean;
  /** Üretken içerik mi — telif/deepfake uyarısı tetikler. */
  readonly generative: boolean;
  /** Gerçek kişi yüzü üzerinde çalışır mı — ek etik onayı gerektirir. */
  readonly operatesOnFaces: boolean;
}

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

export const MODELS: Readonly<Record<Capability, ModelDescriptor>> = {
  // ---- Manuel & Botox stüdyo: ÜCRETSİZ, sınırsız, cihaz üstü ----
  // Zorunlu fırçalama yok; kullanıcı isterse tam manuel kontrol alır.
  'manual-reshape': {
    capability: 'manual-reshape',
    localModel: { ios: 'face_mesh.mlmodelc', android: 'face_mesh.tflite', sizeBytes: 8 * MB, peakMemoryBytes: 140 * MB, minDeviceRamBytes: 2 * GB, sha256: 'e3f1c0a2b48d5f6790a1c2d3e4f50617283940a5b6c7d8e9f0a1b2c3d4e5f607', version: 1 },
    offlineCapable: true, free: true, generative: false, operatesOnFaces: true,
  },
  'botox-jawline': {
    capability: 'botox-jawline',
    localModel: { ios: 'face_mesh.mlmodelc', android: 'face_mesh.tflite', sizeBytes: 8 * MB, peakMemoryBytes: 140 * MB, minDeviceRamBytes: 2 * GB, sha256: 'e3f1c0a2b48d5f6790a1c2d3e4f50617283940a5b6c7d8e9f0a1b2c3d4e5f607', version: 1 },
    offlineCapable: true, free: true, generative: false, operatesOnFaces: true,
  },
  'skin-smooth': {
    capability: 'skin-smooth',
    localModel: { ios: 'skin_detail.mlmodelc', android: 'skin_detail_fp16.tflite', sizeBytes: 14 * MB, peakMemoryBytes: 260 * MB, minDeviceRamBytes: 3 * GB, sha256: 'a7b8c9d0e1f2031425364758697a8b9c0d1e2f3041526374859607182a3b4c5d', version: 1 },
    offlineCapable: true, free: true, generative: false, operatesOnFaces: true,
  },
  'blemish-eraser': {
    capability: 'blemish-eraser',
    localModel: { ios: 'lama_inpaint.mlmodelc', android: 'lama_inpaint_fp16.tflite', sizeBytes: 46 * MB, peakMemoryBytes: 380 * MB, minDeviceRamBytes: 3 * GB, sha256: '3b14695ce74f2f4fa30fe2d5b5084ecb1543ef70b36b05cbe1e56b84ea3bbe16', version: 1 },
    offlineCapable: true, free: true, generative: true, operatesOnFaces: true,
  },

  // ---- Even Girl Generate: 3-5 kelime + 5 referans foto, filigransız çıktı ----
  'even-generate': {
    capability: 'even-generate',
    remoteEndpoint: '/v1/ai/even-generate',
    offlineCapable: false, free: false, generative: true, operatesOnFaces: true,
  },
  /** Seçilen fantezi arka planının ışık açısı ve renk paletini yüze füzyonlar. */
  'light-sync': {
    capability: 'light-sync',
    localModel: { ios: 'light_estimate.mlmodelc', android: 'light_estimate.tflite', sizeBytes: 11 * MB, peakMemoryBytes: 180 * MB, minDeviceRamBytes: 3 * GB, sha256: 'c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80910a2b', version: 1 },
    remoteEndpoint: '/v1/ai/light-sync',
    offlineCapable: true, free: false, generative: false, operatesOnFaces: true,
  },
  'cinematic-bokeh': {
    capability: 'cinematic-bokeh',
    localModel: { ios: 'depth_anything_s.mlmodelc', android: 'depth_anything_s.tflite', sizeBytes: 22 * MB, peakMemoryBytes: 210 * MB, minDeviceRamBytes: 3 * GB, sha256: 'd1e2f3a4b5c60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90', version: 1 },
    offlineCapable: true, free: false, generative: false, operatesOnFaces: false,
  },
  /**
   * Gözenek ve ince tüy koruma — "uncanny valley" etkisini ortadan kaldıran
   * katman. Üretim sonrası yüksek frekans detayı orijinal karodan geri taşınır.
   */
  'pore-preserve': {
    capability: 'pore-preserve',
    localModel: { ios: 'detail_transfer.mlmodelc', android: 'detail_transfer_fp16.tflite', sizeBytes: 19 * MB, peakMemoryBytes: 320 * MB, minDeviceRamBytes: 4 * GB, sha256: 'f0e1d2c3b4a59687756453423130f1e2d3c4b5a697887766554433221100ffee', version: 1 },
    offlineCapable: true, free: false, generative: false, operatesOnFaces: true,
  },

  /**
   * NSFW sınıflandırıcı — kullanıcıya araç olarak GÖSTERİLMEZ, paylaşım
   * öncesi otomatik çalışır. Cihaz üstü olması bir gizlilik kararıdır:
   * sınıflandırma için medyayı sunucuya göndermek, yayınlanmayan taslakların
   * bile sunucumuzdan geçmesi demektir.
   *
   * `free: true` — moderasyon abonelik arkasına konulamaz.
   */
  'nsfw-classify': {
    capability: 'nsfw-classify',
    localModel: { ios: 'nsfw_detect.mlmodelc', android: 'nsfw_detect_int8.tflite', sizeBytes: 9 * MB, peakMemoryBytes: 120 * MB, minDeviceRamBytes: 2 * GB, sha256: '6132a19437f925450ec9b14316998eb74a7047231b1a057ba135351932d54aa2', version: 1 },
    offlineCapable: true, free: true, generative: false, operatesOnFaces: false,
  },

  // ---- Temel araçlar: tamamen yerel, ücretsiz, model gerektirmez ----
  crop: { capability: 'crop', offlineCapable: true, free: true, generative: false, operatesOnFaces: false },
  'color-filter': { capability: 'color-filter', offlineCapable: true, free: true, generative: false, operatesOnFaces: false },
  trim: { capability: 'trim', offlineCapable: true, free: true, generative: false, operatesOnFaces: false },

  // ---- Cihaz üstü hafif modeller: offline çalışır ----
  'magic-eraser': {
    capability: 'magic-eraser',
    localModel: { ios: 'lama_inpaint.mlmodelc', android: 'lama_inpaint_fp16.tflite', sizeBytes: 46 * MB, peakMemoryBytes: 380 * MB, minDeviceRamBytes: 3 * GB, sha256: '3b14695ce74f2f4fa30fe2d5b5084ecb1543ef70b36b05cbe1e56b84ea3bbe16', version: 1 },
    offlineCapable: true, free: true, generative: true, operatesOnFaces: false,
  },
  'face-restore': {
    capability: 'face-restore',
    localModel: { ios: 'gfp_restore.mlmodelc', android: 'gfp_restore_int8.tflite', sizeBytes: 68 * MB, peakMemoryBytes: 520 * MB, minDeviceRamBytes: 4 * GB, sha256: '28791aa705a32552d26ae3c5e1f80cb7ca2c8b5d5a19355544c964f4d7993f40', version: 1 },
    remoteEndpoint: '/v1/ai/face-restore',
    offlineCapable: true, free: false, generative: true, operatesOnFaces: true,
  },
  'hd-upscale': {
    capability: 'hd-upscale',
    localModel: { ios: 'realesrgan_x4.mlmodelc', android: 'realesrgan_x4_fp16.tflite', sizeBytes: 24 * MB, peakMemoryBytes: 640 * MB, minDeviceRamBytes: 4 * GB, sha256: '5610382bf444cac789105e19da382fa0e707e04b213321009a7ca0e729d1dae2', version: 1 },
    remoteEndpoint: '/v1/ai/upscale',
    offlineCapable: true, free: false, generative: false, operatesOnFaces: false,
  },
  'lens-blur': {
    capability: 'lens-blur',
    localModel: { ios: 'depth_anything_s.mlmodelc', android: 'depth_anything_s.tflite', sizeBytes: 22 * MB, peakMemoryBytes: 210 * MB, minDeviceRamBytes: 3 * GB, sha256: '304310adc45f5ee9d8eb8caca07126e898f7e338846682affe3f1820da8be0f4', version: 1 },
    offlineCapable: true, free: true, generative: false, operatesOnFaces: false,
  },
  'studio-background': {
    capability: 'studio-background',
    localModel: { ios: 'segformer_matting.mlmodelc', android: 'segformer_matting.tflite', sizeBytes: 18 * MB, peakMemoryBytes: 240 * MB, minDeviceRamBytes: 3 * GB, sha256: '9b8426cdce24d25ef7c82bfa850c57c560f0ce5b112c5830cfd0e1788571e21d', version: 1 },
    offlineCapable: true, free: false, generative: false, operatesOnFaces: true,
  },
  'object-tracking': {
    capability: 'object-tracking',
    localModel: { ios: 'yolo_track_n.mlmodelc', android: 'yolo_track_n.tflite', sizeBytes: 12 * MB, peakMemoryBytes: 180 * MB, minDeviceRamBytes: 3 * GB, sha256: '4b271de8074ec38cf215331131b3ba6934973b429dbfa8ecc31c085b046c239c', version: 1 },
    offlineCapable: true, free: false, generative: false, operatesOnFaces: false,
  },
  'auto-captions': {
    capability: 'auto-captions',
    localModel: { ios: 'whisper_tiny.mlmodelc', android: 'whisper_tiny_int8.tflite', sizeBytes: 39 * MB, peakMemoryBytes: 300 * MB, minDeviceRamBytes: 3 * GB, sha256: 'b4e58a14d92d3950dc43257408802d3553b6cbf8831d098e3db5ca3f19c739cf', version: 1 },
    remoteEndpoint: '/v1/ai/transcribe',
    offlineCapable: true, free: false, generative: false, operatesOnFaces: false,
  },
  'smart-slowmo': {
    capability: 'smart-slowmo',
    localModel: { ios: 'rife_lite.mlmodelc', android: 'rife_lite_fp16.tflite', sizeBytes: 31 * MB, peakMemoryBytes: 700 * MB, minDeviceRamBytes: 6 * GB, sha256: '14e005e284ba27c5de15e81d80ea6b43e451213caa9744e37d7078fedfbed334', version: 1 },
    remoteEndpoint: '/v1/ai/frame-interpolate',
    offlineCapable: true, free: false, generative: true, operatesOnFaces: false,
  },
  'auto-resize': { capability: 'auto-resize', offlineCapable: true, free: true, generative: false, operatesOnFaces: false },
  'smart-template': {
    capability: 'smart-template',
    remoteEndpoint: '/v1/ai/template-suggest',
    offlineCapable: false, free: false, generative: true, operatesOnFaces: false,
  },

  // ---- Yalnızca sunucu: difüzyon modelleri cihazda pratik değil ----
  'text-to-video': { capability: 'text-to-video', remoteEndpoint: '/v1/ai/text-to-video', offlineCapable: false, free: false, generative: true, operatesOnFaces: false },
  'ai-avatar': { capability: 'ai-avatar', remoteEndpoint: '/v1/ai/avatar', offlineCapable: false, free: false, generative: true, operatesOnFaces: true },
  'age-transform': { capability: 'age-transform', remoteEndpoint: '/v1/ai/age-transform', offlineCapable: false, free: false, generative: true, operatesOnFaces: true },
  'generative-remove': { capability: 'generative-remove', remoteEndpoint: '/v1/ai/generative-remove', offlineCapable: false, free: false, generative: true, operatesOnFaces: false },
  'generative-expand': { capability: 'generative-expand', remoteEndpoint: '/v1/ai/generative-expand', offlineCapable: false, free: false, generative: true, operatesOnFaces: false },
  'concept-portrait': { capability: 'concept-portrait', remoteEndpoint: '/v1/ai/concept-portrait', offlineCapable: false, free: false, generative: true, operatesOnFaces: true },
};

export function describe(capability: Capability): ModelDescriptor {
  return MODELS[capability];
}

/** Uçak modunda kullanılabilecek yetenekler — UI bunları "offline" rozetiyle gösterir. */
export const OFFLINE_CAPABILITIES: readonly Capability[] = (
  Object.keys(MODELS) as Capability[]
).filter((c) => MODELS[c].offlineCapable);
