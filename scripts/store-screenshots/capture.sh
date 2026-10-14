#!/usr/bin/env bash
# Capture Galaxy Store screenshots from a real device over USB (adb).
#
# Why this exists: the Galaxy rejection said "screenshot is blurred".
# Screenshots that travel phone → WhatsApp/e-mail → laptop arrive
# recompressed and undersized. `adb screencap` pulls the framebuffer at
# NATIVE resolution as PNG, untouched — the sharpness the reviewer wants.
#
# Usage:
#   1. Enable Developer options + USB debugging on the Samsung.
#   2. Open CyberShop, visit each screen in docs/galaxy-store.md §1 in
#      order (open the app once first so the intro curtain is gone, and
#      let images finish loading before each capture).
#   3. Run this script once per screen; it names and pulls each shot.
#
#   ./scripts/store-screenshots/capture.sh
#
# Requires: adb (Android SDK platform-tools) on PATH.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="store-listing/screenshots"
mkdir -p "$OUT"

command -v adb >/dev/null || { echo "error: adb not found — install Android SDK platform-tools"; exit 1; }
adb get-state >/dev/null 2>&1 || { echo "error: no device — connect the Samsung with USB debugging on"; exit 1; }

SHOTS=(
  "01-shop-home"
  "02-shop-filters"
  "03-listing-whatsapp-cta"
  "04-whatsapp-handover"
  "05-whatsapp-cart"
  "06-storefront"
  "07-vendor-dashboard"
  "08-safety"
)

echo "Device: $(adb shell getprop ro.product.model | tr -d '\r')"
echo "Native size: $(adb shell wm size | tr -d '\r')"
echo
for name in "${SHOTS[@]}"; do
  read -r -p "Show ${name} on the phone, then press Enter… " _
  adb shell screencap -p "/sdcard/${name}.png"
  adb pull -q "/sdcard/${name}.png" "${OUT}/${name}.png"
  adb shell rm "/sdcard/${name}.png"
  echo "  ✓ ${OUT}/${name}.png"
done

echo
python3 scripts/store-screenshots/check_screenshots.py "$OUT" || true
echo "Upload the PNGs in ${OUT}/ in filename order. Do not edit, crop in a"
echo "messaging app, or convert to JPEG on the way."
