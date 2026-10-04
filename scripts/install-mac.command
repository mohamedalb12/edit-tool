#!/bin/bash
# EditFast — مثبّت ماك. دبل كليك عليه (أو: bash install-mac.command)
set -e
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/EditFast"
echo "==> نسخ الإضافة إلى $DEST"
rm -rf "$DEST"; mkdir -p "$DEST"
for d in CSXS client core host assets bin; do [ -d "$SRC/$d" ] && cp -R "$SRC/$d" "$DEST/"; done
cp "$SRC/README.md" "$DEST/" 2>/dev/null || true
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

echo "==> تفعيل الإضافات الغير موقّعة (PlayerDebugMode)"
for v in 9 10 11 12 13; do defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1; done

if command -v brew >/dev/null 2>&1; then
  echo "==> ffmpeg + whisper.cpp عن طريق Homebrew"
  command -v ffmpeg >/dev/null 2>&1 || brew install ffmpeg
  command -v whisper-cli >/dev/null 2>&1 || brew install whisper-cpp
else
  echo "!! مفيش Homebrew — ثبّته من https://brew.sh وبعدين: brew install ffmpeg whisper-cpp"
fi
echo ""
echo "خلصت ✓  افتح بريمير > Window > Extensions > EditFast"
echo "أول مرة: من تبويب الإعدادات حط مفتاح OpenRouter وحمّل موديل Whisper."
