#!/bin/bash
set -e

# Reattend Desktop Deploy Script
# Usage: ./scripts/deploy.sh
# Builds macOS, creates DMG, notarizes, signs, uploads to server.
# Windows builds are handled by GitHub Actions automatically on push.

SERVER="root@157.245.110.176"
DOWNLOAD_DIR="/var/www/reattend/public/download"
UPDATER_DIR="/var/www/reattend/data/updater"
SIGNING_KEY_PATH="$HOME/.tauri/reattend-updater-v2.key"
SIGNING_KEY_PASSWORD="reattend2024"
NOTARY_PROFILE="reattend"

BUNDLE_DIR="src-tauri/target/release/bundle"
APP_PATH="$BUNDLE_DIR/macos/Reattend.app"

echo "========================================="
echo "  Reattend Desktop Deploy"
echo "========================================="

# Step 1: Build
echo ""
echo "[1/8] Building macOS app..."
npx tauri build 2>&1 | tail -5 || true

# Verify app was built
if [ ! -d "$APP_PATH" ]; then
  echo "ERROR: App not built at $APP_PATH"
  exit 1
fi

# Verify capture binary is bundled
if [ ! -f "$APP_PATH/Contents/Resources/swift-plugin/.build/release/reattend-capture" ]; then
  echo "WARNING: reattend-capture not bundled!"
fi

echo "  App built successfully"

# Step 2: Notarize
echo ""
echo "[2/8] Notarizing app..."
STAGING="/tmp/reattend-deploy-staging"
rm -rf "$STAGING"
mkdir -p "$STAGING"
cp -R "$APP_PATH" "$STAGING/"
ditto -c -k --sequesterRsrc "$STAGING/Reattend.app" /tmp/Reattend-notarize.zip
xcrun notarytool submit /tmp/Reattend-notarize.zip --keychain-profile "$NOTARY_PROFILE" --wait
echo "  Notarization accepted"

# Step 3: Staple
echo ""
echo "[3/8] Stapling notarization ticket..."
xcrun stapler staple "$STAGING/Reattend.app"
echo "  Stapled"

# Step 4: Create DMG
echo ""
echo "[4/8] Creating DMG..."
ln -sf /Applications "$STAGING/Applications"
rm -f /tmp/Reattend-deploy.dmg
# Use unique volume name to avoid hdiutil conflicts with mounted volumes
VOLNAME="Reattend-$(date +%s)"
hdiutil create -volname "$VOLNAME" -srcfolder "$STAGING" -ov -format UDZO /tmp/Reattend-deploy.dmg
echo "  DMG created"

# Step 5: Notarize DMG
echo ""
echo "[5/8] Notarizing DMG..."
xcrun notarytool submit /tmp/Reattend-deploy.dmg --keychain-profile "$NOTARY_PROFILE" --wait
xcrun stapler staple /tmp/Reattend-deploy.dmg
echo "  DMG notarized and stapled"

# Step 6: Create updater tar.gz and sign
echo ""
echo "[6/8] Creating and signing updater package..."
cd "$STAGING"
tar czf /tmp/Reattend-updater.app.tar.gz Reattend.app
cd - > /dev/null

TAURI_SIGNING_PRIVATE_KEY="$(cat "$SIGNING_KEY_PATH")" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$SIGNING_KEY_PASSWORD" \
npx tauri signer sign /tmp/Reattend-updater.app.tar.gz 2>&1 | tail -3

MAC_SIG=$(cat /tmp/Reattend-updater.app.tar.gz.sig)
echo "  Signed"

# Step 7: Upload to server
echo ""
echo "[7/8] Uploading to server..."
scp /tmp/Reattend-deploy.dmg "$SERVER:$DOWNLOAD_DIR/Reattend.dmg"
scp /tmp/Reattend-updater.app.tar.gz "$SERVER:$UPDATER_DIR/Reattend.app.tar.gz"
echo "  macOS files uploaded"

# Step 8: Wait for Windows CI and update latest.json
echo ""
echo "[8/8] Checking Windows CI..."

# Get latest CI run
LATEST_RUN=$(gh api repos/parthajy/reattend-desktop/actions/runs --jq '.workflow_runs[0] | "\(.id) \(.status) \(.conclusion)"')
RUN_ID=$(echo "$LATEST_RUN" | awk '{print $1}')
RUN_STATUS=$(echo "$LATEST_RUN" | awk '{print $2}')

if [ "$RUN_STATUS" = "completed" ]; then
  RUN_CONCLUSION=$(echo "$LATEST_RUN" | awk '{print $3}')
  if [ "$RUN_CONCLUSION" = "success" ]; then
    echo "  Windows CI passed (run $RUN_ID)"

    # Download and sign Windows artifact
    rm -rf /tmp/reattend-win-deploy
    gh run download "$RUN_ID" --repo parthajy/reattend-desktop -D /tmp/reattend-win-deploy

    WIN_EXE=$(find /tmp/reattend-win-deploy -name "*.exe" | head -1)
    if [ -n "$WIN_EXE" ]; then
      TAURI_SIGNING_PRIVATE_KEY="$(cat "$SIGNING_KEY_PATH")" \
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$SIGNING_KEY_PASSWORD" \
      npx tauri signer sign "$WIN_EXE" 2>&1 | tail -3

      WIN_SIG=$(cat "${WIN_EXE}.sig")

      scp "$WIN_EXE" "$SERVER:$DOWNLOAD_DIR/Reattend_x64-setup.exe"
      scp "$WIN_EXE" "$SERVER:$UPDATER_DIR/Reattend_x64-setup.exe"
      echo "  Windows files uploaded"
    fi
  else
    echo "  WARNING: Windows CI failed. Skipping Windows upload."
    WIN_SIG=""
  fi
else
  echo "  Windows CI still running (run $RUN_ID). Skipping Windows upload."
  echo "  Re-run this script later or manually upload Windows artifacts."
  WIN_SIG=""
fi

# Update latest.json
VERSION=$(cat src-tauri/tauri.conf.json | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])")
PUB_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [ -n "$WIN_SIG" ]; then
  cat > /tmp/latest.json << EOF
{
  "version": "$VERSION",
  "notes": "Latest release",
  "pub_date": "$PUB_DATE",
  "platforms": {
    "darwin-aarch64": { "url": "https://www.reattend.com/data/updater/Reattend.app.tar.gz", "signature": "$MAC_SIG" },
    "darwin-x86_64": { "url": "https://www.reattend.com/data/updater/Reattend.app.tar.gz", "signature": "$MAC_SIG" },
    "windows-x86_64": { "url": "https://www.reattend.com/data/updater/Reattend_x64-setup.exe", "signature": "$WIN_SIG" }
  }
}
EOF
else
  # Mac only
  cat > /tmp/latest.json << EOF
{
  "version": "$VERSION",
  "notes": "Latest release",
  "pub_date": "$PUB_DATE",
  "platforms": {
    "darwin-aarch64": { "url": "https://www.reattend.com/data/updater/Reattend.app.tar.gz", "signature": "$MAC_SIG" },
    "darwin-x86_64": { "url": "https://www.reattend.com/data/updater/Reattend.app.tar.gz", "signature": "$MAC_SIG" }
  }
}
EOF
fi

scp /tmp/latest.json "$SERVER:$UPDATER_DIR/latest.json"
echo "  latest.json updated (v$VERSION)"

# Cleanup
rm -rf "$STAGING" /tmp/Reattend-notarize.zip /tmp/reattend-win-deploy

echo ""
echo "========================================="
echo "  Deploy complete! v$VERSION"
echo "========================================="
echo "  Mac DMG:     $DOWNLOAD_DIR/Reattend.dmg"
echo "  Mac updater: $UPDATER_DIR/Reattend.app.tar.gz"
if [ -n "$WIN_SIG" ]; then
  echo "  Win EXE:     $DOWNLOAD_DIR/Reattend_x64-setup.exe"
  echo "  Win updater: $UPDATER_DIR/Reattend_x64-setup.exe"
fi
echo ""
