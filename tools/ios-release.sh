#!/usr/bin/env bash
set -euo pipefail

signing="$RUNNER_TEMP/inkrunner-signing"
output="$RUNNER_TEMP/inkrunner-release"
mkdir -p "$output"
python3 tools/ios-credentials.py install-ci

keychain="$signing/inkrunner.keychain-db"
keychain_password=$(openssl rand -hex 32)
printf '%s' "$keychain" > "$signing/keychain-path"
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security import "$signing/distribution.p12" -P "$IOS_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$keychain"
security set-key-partition-list -S apple-tool:,apple: -k "$keychain_password" "$keychain" > /dev/null
security list-keychains -d user -s "$keychain" "$HOME/Library/Keychains/login.keychain-db"

# Apple's build version format allows four digits, then two, then two.
test "$GITHUB_RUN_NUMBER" -le 9999
test "$GITHUB_RUN_ATTEMPT" -le 99
build_number="$GITHUB_RUN_NUMBER.$GITHUB_RUN_ATTEMPT.0"
xcodebuild -version
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$output/INKRUNNER.xcarchive" \
  -derivedDataPath "$output/DerivedData" CURRENT_PROJECT_VERSION="$build_number" \
  archive 2>&1 | tee "$output/archive.log"
# Export straight to App Store Connect; Xcode 26's altool --upload-app path is deprecated and unreliable.
xcodebuild -exportArchive -archivePath "$output/INKRUNNER.xcarchive" \
  -exportPath "$output/export" -exportOptionsPlist "$signing/ExportOptions.plist" \
  -authenticationKeyPath "$signing/AuthKey_$ASC_KEY_ID.p8" -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" 2>&1 | tee "$output/upload.log"
printf 'App Store Connect accepted the upload. Build %s still needs Apple processing and a TestFlight group.\n' "$build_number" >> "$GITHUB_STEP_SUMMARY"
