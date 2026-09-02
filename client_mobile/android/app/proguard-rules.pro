# ==============================================================================
#  EVEN GIRL — R8 / ProGuard yapılandırması
# ==============================================================================
#
#  HEDEF: Release APK/AAB'de sınıf, metot ve alan adlarını okunamaz hale
#  getirmek; kullanılmayan kodu atmak; güvenlik kontrollerini decompile
#  çıktısında anlamsızlaştırmak.
#
#  ÖNEMLİ: R8 varsayılan olarak yalnızca "shrink" yapar. Karartma (obfuscation)
#  için build.gradle'da `minifyEnabled true` YETMEZ — `-dontobfuscate`
#  bulunmadığından emin olun ve aşağıdaki `-repackageclasses` ile paket
#  hiyerarşisini de düzleştirin.
#
#  DexGuard (ticari) kullanılıyorsa bu dosya aynen geçerlidir; DexGuard ek
#  olarak string şifreleme, sınıf şifreleme ve kontrol akışı karartması sunar
#  (bkz. docs/SECURITY.md > "Karartma katmanları").

# ------------------------------------------------------------------ Genel ----
-optimizationpasses 5
-allowaccessmodification
-mergeinterfacesaggressively

# Tüm sınıfları tek bir isimsiz pakete topla: paket adlarından mimari sızmasın.
-repackageclasses ''

# Kaynak dosya adı ve satır numaralarını KORU ama sahte bir adla değiştir.
# Tamamen atarsak crash raporlarındaki yığın izleri okunamaz hale gelir
# (bkz. src/telemetry/AnonymousCrashReporter.ts — deobfuscation mapping.txt
# ile yapılır, mapping dosyası ASLA dağıtılmaz).
-renamesourcefileattribute SourceFile
-keepattributes SourceFile,LineNumberTable

# Anotasyonlar ve generic imzalar: Gson/Kotlin reflection için gerekli.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# ----------------------------------------------------------- React Native ----
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class * { *; }
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}

# JNI ile çağrılan her şey korunmalı — aksi halde çalışma zamanında
# UnsatisfiedLinkError alınır.
-keepclasseswithmembernames,includedescriptorclasses class * {
    native <methods>;
}

# RN köprü metotları refleksiyonla çağrılır.
-keepclassmembers class * extends com.facebook.react.bridge.ReactContextBaseJavaModule {
    @com.facebook.react.bridge.ReactMethod <methods>;
}
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keep class * implements com.facebook.react.ReactPackage { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# ------------------------------------------------------------- Reanimated ----
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }

# ------------------------------------------------------------------ OkHttp ----
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# --------------------------------------------------------------- Billing ----
# Play Billing Library refleksiyon kullanır; karartılırsa satın alma akışı kırılır.
-keep class com.android.billingclient.api.** { *; }
-keep class com.revenuecat.purchases.** { *; }

# ----------------------------------------------------------- androidx.security ----
-keep class androidx.security.crypto.** { *; }
-dontwarn com.google.crypto.tink.**

# ------------------------------------------------------- TFLite / CoreML ----
# TFLite delegate'leri (NNAPI/GPU) JNI üzerinden yüklenir.
-keep class org.tensorflow.lite.** { *; }
-keep class org.tensorflow.lite.gpu.** { *; }
-dontwarn org.tensorflow.lite.**

# ------------------------------------------------ EVEN GIRL güvenlik çekirdeği ----
# DİKKAT: Güvenlik sınıflarını `-keep` ile KORUMUYORUZ — bilerek.
# Bu sınıfların adlarının karartılması korumanın bir parçasıdır. Yalnızca
# köprüden çağrılan giriş noktası (RN modülü) korunur, iç mantık karartılır.
-keep class com.evengirl.app.security.EvenGirlSecurityModule { 
    @com.facebook.react.bridge.ReactMethod <methods>;
}
-keep class com.evengirl.app.security.EvenGirlSecurityPackage { <init>(); }

# Obf sabitleri: alan adları karartılabilir, sınıf içeriği korunmamalı.
-keepclassmembers class com.evengirl.app.security.Obf {
    private static final byte[] key;
}

# --------------------------------------------------------------- Kotlin ----
-dontwarn kotlin.**
-keepclassmembers class **$WhenMappings { <fields>; }
-assumenosideeffects class kotlin.jvm.internal.Intrinsics {
    static void checkNotNullParameter(java.lang.Object, java.lang.String);
    static void checkNotNullExpressionValue(java.lang.Object, java.lang.String);
}

# ----------------------------------------------------------- Log temizliği ----
# Release binary'de log çağrıları tamamen kaldırılır: log satırları hem
# bilgi sızdırır hem de logcat üzerinden davranış analizi kolaylaştırır.
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int d(...);
    public static int i(...);
    public static int w(...);
}
