#!/usr/bin/env bash
#
# iOS kod karartma — Xcode "Run Script" build phase'i olarak eklenir.
#
# Kurulum: Xcode > Target EvenGirl > Build Phases > + > New Run Script Phase
#          Sıra ÖNEMLİ: "Compile Sources" fazından ÖNCE çalışmalıdır.
#          Script: "${SRCROOT}/scripts/obfuscate.sh"
#
# İKİ KATMAN:
#   1) SwiftShield  — Swift sınıf/metot/özellik adlarını rastgeleleştirir.
#                     Sembol adları class-dump ve Hopper çıktısında anlamsızlaşır.
#   2) OLLVM        — (opsiyonel, ticari/derleyici gerektirir) kontrol akışı
#                     düzleştirme + sahte kod ekleme. Yalnızca güvenlik
#                     çekirdeğine uygulanır; tüm hedefe uygulamak binary'yi
#                     ~%40 büyütür ve açılışı yavaşlatır.
#
# GÜVENLİK NOTU: Karartma bir savunma DEĞİL, geciktiricidir. Kararlı bir
# tersine mühendisi durdurmaz; toplu/otomatik analizi pahalılaştırır. Para ile
# ilgili kararlar (abonelik) bu yüzden sunucuda doğrulanır.
set -euo pipefail

if [ "${CONFIGURATION}" != "Release" ]; then
  echo "[obfuscate] ${CONFIGURATION} — karartma atlanıyor (yalnızca Release)."
  exit 0
fi

# ------------------------------------------------------------ SwiftShield ----
if ! command -v swiftshield >/dev/null 2>&1; then
  echo "error: swiftshield bulunamadı. 'brew install swiftshield' veya CI imajına ekleyin." >&2
  exit 1
fi

echo "[obfuscate] SwiftShield çalışıyor..."
swiftshield obfuscate \
  --project-root "${SRCROOT}" \
  --workspace "${SRCROOT}/EvenGirl.xcworkspace" \
  --scheme "EvenGirl" \
  --ignore-public

# SwiftShield, sembol eşlemesini conversionMap.txt olarak üretir. Bu dosya
# crash raporlarını çözmek için ŞARTTIR ve asla uygulamayla dağıtılmaz.
MAP_SOURCE="${SRCROOT}/swiftshield-output/conversionMap.txt"
MAP_DEST="${BUILT_PRODUCTS_DIR}/symbol-map-${MARKETING_VERSION}-${CURRENT_PROJECT_VERSION}.txt"

if [ -f "${MAP_SOURCE}" ]; then
  cp "${MAP_SOURCE}" "${MAP_DEST}"
  echo "[obfuscate] Sembol haritası: ${MAP_DEST}"
  echo "[obfuscate] Bu dosyayı sürüm arşivine yükleyin — kaybolursa o sürümün"
  echo "[obfuscate] çökme raporları KALICI olarak çözülemez hale gelir."
else
  echo "error: conversionMap.txt üretilmedi." >&2
  exit 1
fi

# ----------------------------------------------------------------- OLLVM ----
# OLLVM ayrı bir toolchain gerektirir. Etkinleştirmek için Build Settings'e:
#   OTHER_CFLAGS   = -mllvm -fla -mllvm -sub -mllvm -bcf
#   OTHER_SWIFT_FLAGS = -Xllvm -fla -Xllvm -sub
# ve yalnızca Security/ dizinindeki dosyalar için ayrı bir hedef tanımlayın.
if [ "${AIGUARD_ENABLE_OLLVM:-0}" = "1" ]; then
  echo "[obfuscate] OLLVM bayrakları etkin (fla + sub + bcf)."
fi

echo "[obfuscate] Tamamlandı."
