#!/usr/bin/env bash
# Скачивает инструменты для сборки APK без Android SDK/Gradle.
# Результат складывается в .cache/android-tools (каталог в .gitignore).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="$ROOT/.cache/android-tools"
mkdir -p "$TOOLS"

echo "== tools dir: $TOOLS =="

# --- 1. android.jar, d8.jar, apksigner.jar, aapt2 (из bundletool) ---
if [ ! -f "$TOOLS/android.jar" ] || [ ! -f "$TOOLS/aapt2" ]; then
  rm -rf /tmp/h2apk
  git clone --filter=blob:none --no-checkout --depth 1 https://github.com/HashShin/H2APK /tmp/h2apk
  git -C /tmp/h2apk sparse-checkout init --cone
  git -C /tmp/h2apk sparse-checkout set tools
  git -C /tmp/h2apk checkout
  ls -la /tmp/h2apk/tools || true
  cp -f /tmp/h2apk/tools/android.jar "$TOOLS/" 2>/dev/null || true
  cp -f /tmp/h2apk/tools/d8.jar "$TOOLS/" 2>/dev/null || true
  cp -f /tmp/h2apk/tools/apksigner.jar "$TOOLS/" 2>/dev/null || true
  cp -f /tmp/h2apk/tools/bundletool.jar "$TOOLS/" 2>/dev/null || true
  if [ -f "$TOOLS/bundletool.jar" ] && [ ! -f "$TOOLS/aapt2" ]; then
    unzip -o -j "$TOOLS/bundletool.jar" "linux/aapt2" -d "$TOOLS" || unzip -o -j "$TOOLS/bundletool.jar" "aapt2" -d "$TOOLS"
    chmod +x "$TOOLS/aapt2" 2>/dev/null || true
  fi
fi

# --- 2. ecj (компилятор Java вместо javac) ---
if [ ! -f "$TOOLS/ecj.jar" ]; then
  rm -rf /tmp/tinyapk
  git clone --filter=blob:none --no-checkout --depth 1 https://github.com/Promastergame/tinyapk-lab /tmp/tinyapk || true
  if [ -d /tmp/tinyapk ]; then
    git -C /tmp/tinyapk sparse-checkout init --cone || true
    git -C /tmp/tinyapk sparse-checkout set tools || true
    git -C /tmp/tinyapk checkout || true
    find /tmp/tinyapk/tools -name "ecj*.jar" 2>/dev/null | head -5
    cp -f "$(find /tmp/tinyapk/tools -name 'ecj*.jar' | head -1)" "$TOOLS/ecj.jar" 2>/dev/null || true
  fi
fi

# --- 3. JRE/JDK (нужен java + keytool) ---
if [ ! -x "$TOOLS/jre/bin/java" ]; then
  rm -rf /tmp/pydeps
  pip3 install --quiet --target=/tmp/pydeps jdk4py
  JRE="$(find /tmp/pydeps/jdk4py -maxdepth 2 -type d -name java-runtime | head -1)"
  if [ -n "$JRE" ]; then
    rm -rf "$TOOLS/jre"
    cp -r "$JRE" "$TOOLS/jre"
    chmod +x "$TOOLS/jre/bin/"* 2>/dev/null || true
  fi
fi

echo "== итог =="
ls -la "$TOOLS"
"$TOOLS/jre/bin/java" -version 2>&1 | head -3 || true
