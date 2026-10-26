#!/usr/bin/env bash
# Нарезает мастер-логотип (assets/logo-master.png) во все нужные размеры:
#   • public/icons/*        — иконки PWA и браузера (все размеры из manifest.webmanifest)
#   • public/favicon.ico    — иконка вкладки
#   • android/res/mipmap-*  — классические иконки лаунчера
#   • android/res/mipmap-anydpi-v26 + drawable-nodpi — adaptive icon (Android 8+)
#
# Запуск: bash scripts/make-icons.sh [путь/к/мастеру.png]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$ROOT/assets/logo-master.png}"
MATTE="#1A222D"   # цвет фона мастер-логотипа (под него подгоняются подложки)

if [ ! -f "$SRC" ]; then
  echo "Не найден мастер-логотип: $SRC" >&2
  exit 1
fi

echo "== мастер: $SRC =="
identify "$SRC" | sed 's/^/   /'

# --- 1. Иконки PWA / браузера ---
mkdir -p "$ROOT/public/icons"
for size in 32 48 72 96 144 152 180 192 256 384 512; do
  convert "$SRC" -resize "${size}x${size}" -strip "$ROOT/public/icons/icon-${size}.png"
done

# Maskable: знак в безопасной зоне (центр 80%), поля залиты цветом фона логотипа.
for size in 192 512; do
  inner=$(( size * 78 / 100 ))
  convert "$SRC" -resize "${inner}x${inner}" -background "$MATTE" -gravity center \
          -extent "${size}x${size}" -strip "$ROOT/public/icons/icon-${size}-maskable.png"
done

convert "$SRC" -resize 256x256 -define icon:auto-resize=64,48,32,16 -strip "$ROOT/public/favicon.ico"

# --- 2. Классические иконки Android ---
cp -f "$ROOT/public/icons/icon-48.png"  "$ROOT/android/res/mipmap-mdpi/ic_launcher.png"
cp -f "$ROOT/public/icons/icon-72.png"  "$ROOT/android/res/mipmap-hdpi/ic_launcher.png"
cp -f "$ROOT/public/icons/icon-96.png"  "$ROOT/android/res/mipmap-xhdpi/ic_launcher.png"
cp -f "$ROOT/public/icons/icon-144.png" "$ROOT/android/res/mipmap-xxhdpi/ic_launcher.png"
cp -f "$ROOT/public/icons/icon-192.png" "$ROOT/android/res/mipmap-xxxhdpi/ic_launcher.png"

# --- 3. Adaptive icon (Android 8+): знак чуть крупнее, фон — тот же тёмный цвет ---
mkdir -p "$ROOT/android/res/mipmap-anydpi-v26" "$ROOT/android/res/drawable" "$ROOT/android/res/drawable-nodpi"
convert "$SRC" -resize 112% -gravity center -crop 1024x1024+0+0 +repage \
        -resize 432x432 -strip "$ROOT/android/res/drawable-nodpi/ic_launcher_foreground.png"

cat > "$ROOT/android/res/drawable/ic_launcher_background.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#1A222D" />
</shape>
XML

cat > "$ROOT/android/res/mipmap-anydpi-v26/ic_launcher.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
XML

echo "== готово =="
ls -1 "$ROOT/public/icons" | sed 's/^/   public\/icons\//'
ls -1 "$ROOT/android/res/mipmap-anydpi-v26" "$ROOT/android/res/drawable-nodpi" | sed 's/^/   android\/res\//'
