#!/usr/bin/env bash
set -euo pipefail

output="$RUNNER_TEMP/inkrunner-simulator"
mkdir -p "$output"
device=$(xcrun simctl list devices available --json | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
for runtime in sorted(devices, reverse=True):
    if "iOS" not in runtime:
        continue
    for device in devices[runtime]:
        if device["name"].startswith("iPhone") and device.get("isAvailable", False):
            print(device["udid"])
            sys.exit(0)
sys.exit("No available iPhone simulator runtime installed")
')
xcrun simctl boot "$device"
cleanup() {
  if [ -d "$output/NativeTests.xcresult" ]; then
    xcrun xcresulttool export attachments --path "$output/NativeTests.xcresult" --output-path "$output/screenshots" || true
  fi
  if container=$(xcrun simctl get_app_container "$device" com.millzach.inkrunner data 2>/dev/null); then
    python3 - "$container/Library/Preferences/com.millzach.inkrunner.plist" "$output/native-preferences.json" <<'PY'
import json, pathlib, plistlib, sys
path = pathlib.Path(sys.argv[1])
data = plistlib.loads(path.read_bytes()) if path.exists() else {}
values = {key: value for key, value in data.items() if key.startswith('CapacitorStorage.inkrunner:')}
pathlib.Path(sys.argv[2]).write_text(json.dumps(values, indent=2))
PY
  fi
  xcrun simctl shutdown "$device" || true
}
trap cleanup EXIT
xcrun simctl bootstatus "$device" -b
xcrun simctl ui "$device" appearance light
xcrun simctl status_bar "$device" override --time '9:41' --batteryState charged --batteryLevel 100
gem install xcodeproj --version 1.28.1 --no-document
ruby tools/ios-ui-tests.rb
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination "platform=iOS Simulator,id=$device" -derivedDataPath "$output/DerivedData" \
  -resultBundlePath "$output/NativeTests.xcresult" -parallel-testing-enabled NO \
  CODE_SIGNING_ALLOWED=NO test 2>&1 | tee "$output/build.log"

# Inspect the actual native preferences file after app termination, not just the web cache.
bundle_id=$(node -p 'JSON.parse(require("fs").readFileSync("capacitor.config.json", "utf8")).appId')
container=$(xcrun simctl get_app_container "$device" "$bundle_id" data)
python3 - "$container/Library/Preferences/$bundle_id.plist" <<'PY'
import plistlib, sys
with open(sys.argv[1], 'rb') as file:
    settings = plistlib.load(file)
assert settings['CapacitorStorage.inkrunner:level'] == 'sea', settings
assert settings['CapacitorStorage.inkrunner:ghosts'] == '0', settings
assert settings['CapacitorStorage.inkrunner:char'] == 'kohaku', settings
print('Native UserDefaults persisted the scroll, traveler, and ghost preference.')
PY
xcrun simctl launch "$device" "$bundle_id"
sleep 10
xcrun simctl io "$device" screenshot "$output/iphone-launch.png"
