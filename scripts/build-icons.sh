#!/usr/bin/env bash
# Нарезает мастер-логотип (assets/logo.png, 1024x1024, прозрачный фон)
# в набор иконок для PWA, браузера и Android.
#
# Использование:  bash scripts/build-icons.sh
# Требуется: ImageMagick (convert).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MASTER="$ROOT/assets/logo.png"
WEB="$ROOT/public/icons"
AND="$ROOT/android/res"

if [ ! -f "$MASTER" ]; then
  echo "Нет файла $MASTER — сначала положите мастер-логотип 1024x1024." >&2
  exit 1
fi

mkdir -p "$WEB" "$AND/mipmap-mdpi" "$AND/mipmap-hdpi" "$AND/mipmap-xhdpi" \
         "$AND/mipmap-xxhdpi" "$AND/mipmap-xxxhdpi"

# Общие параметры сжатия: плоская графика хорошо переживает палитру 255 цветов.
Q="-strip -colors 255 -define png:compression-level=9"

# Иконки для браузера и PWA (прозрачный фон, «any»).
for s in 32 48 72 96 128 144 152 180 192 256 384 512; do
  convert "$MASTER" -background none -resize "${s}x${s}" $Q "$WEB/icon-${s}.png"
done

# Версия для маскируемых контекстов (Android adaptive / PWA maskable):
# логотип уменьшен до 62% и положен на плотный фон приложения.
convert "$MASTER" -background none -resize 62% /tmp/wh-logo-inner.png
convert -size 1024x1024 "xc:#080d1b" /tmp/wh-logo-inner.png -gravity center -composite \
  -resize 512x512 $Q "$WEB/icon-512-maskable.png"
convert -size 1024x1024 "xc:#080d1b" /tmp/wh-logo-inner.png -gravity center -composite \
  -resize 192x192 $Q "$WEB/icon-192-maskable.png"

# Иконки лаунчера Android (PNG для mipmap-*).
for s in 48 72 96 144 192; do
  convert "$MASTER" -background none -resize "${s}x${s}" $Q /tmp/wh-icon-${s}.png
done

# Логотип внутри интерфейса (импортируется Vite, поэтому лежит в src/assets).
mkdir -p "$ROOT/src/assets"
cp "$WEB/icon-128.png" "$ROOT/src/assets/brand-logo.png"
cp /tmp/wh-icon-48.png  "$AND/mipmap-mdpi/ic_launcher.png"
cp /tmp/wh-icon-72.png  "$AND/mipmap-hdpi/ic_launcher.png"
cp /tmp/wh-icon-96.png  "$AND/mipmap-xhdpi/ic_launcher.png"
cp /tmp/wh-icon-144.png "$AND/mipmap-xxhdpi/ic_launcher.png"
cp /tmp/wh-icon-192.png "$AND/mipmap-xxxhdpi/ic_launcher.png"

echo "Готово. Иконки:"
ls -la "$WEB" | tail -n +4
