#!/usr/bin/env bash
#
# Release öncesi sertleştirme doğrulaması (Xcode Run Script, Release'te çalışır).
#
# Android'deki `verifyReleaseHardening` görevinin iOS karşılığı: yapılandırma
# kaymasını code review'a bırakmak yerine build'i kırarak yakalar.
set -euo pipefail

if [ "${CONFIGURATION}" != "Release" ]; then
  exit 0
fi

fail() { echo "error: $1" >&2; exit 1; }

PIN_FILE="${SRCROOT}/EvenGirl/Security/PinConfiguration.swift"
INFO_PLIST="${SRCROOT}/EvenGirl/Info.plist"

# 1) Gerçek SPKI pin'leri doldurulmuş mu?
grep -q "sha256/AAAAAAAA" "${PIN_FILE}" \
  && fail "PinConfiguration.swift: yer tutucu pin'ler hâlâ duruyor."

# 2) Her host için en az iki pin (yedek pin kuralı)?
python3 - "${PIN_FILE}" <<'PY'
import re, sys
source = open(sys.argv[1]).read()
for host, block in re.findall(r'"([^"]+)":\s*\[(.*?)\]', source, re.S):
    pins = re.findall(r'"sha256/[^"]+"', block)
    if len(pins) < 2:
        sys.exit(f"error: {host} için yedek pin yok ({len(pins)} pin).")
PY

# 3) ATS istisnası sızmış mı? (Debug'da eklenen istisna release'e geçmemeli)
if /usr/libexec/PlistBuddy -c "Print :NSAppTransportSecurity:NSAllowsArbitraryLoads" "${INFO_PLIST}" 2>/dev/null | grep -q true; then
  fail "Info.plist: NSAllowsArbitraryLoads=true — ATS devre dışı."
fi

# 4) Debug entitlement'ı (get-task-allow) release'te olmamalı.
ENTITLEMENTS="${SRCROOT}/EvenGirl/EvenGirl.entitlements"
if [ -f "${ENTITLEMENTS}" ] && /usr/libexec/PlistBuddy -c "Print :get-task-allow" "${ENTITLEMENTS}" 2>/dev/null | grep -q true; then
  fail "get-task-allow=true — debugger attach edilebilir."
fi

echo "[verify] Release sertleştirme kontrolleri geçti."
