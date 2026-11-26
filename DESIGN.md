# INKRUNNER 墨

> The world is ink. Your brush is the only color.

A side-scrolling runner across a long Japanese handscroll (emakimono). The whole world is black sumi-e
ink on washi paper. You paint your way past impossible obstacles, and only your paint is in color.

## Pillars
1. **Unique.** Painting is the main verb. Every obstacle can be solved several ways, so no two scrolls look alike.
2. **Fun.** Holding the brush slows time to a crawl, so each obstacle plays as run, paint, then snap back to full speed.
3. **Beautiful.** Monochrome ink-wash world, watercolor strokes that visibly dry and bleed into the paper, procedural koto music.

## Travelers
| | Look | Ability |
|---|---|---|
| **Ren 蓮** | Wandering painter in a straw kasa hat. Scarf and obi take the current ink's color. | *Deep inkwell*: 40% more ink |
| **Kohaku 琥珀** | Fox spirit who paints with its tail tip. | *Fox leap*: one double jump |

## Inks
| Key | Ink | Behavior |
|-----|-----|----------|
| 1 | 朱 Vermilion | Becomes solid ground: bridges, ramps, stairs. |
| 2 | 藍 Indigo | A current. It carries you along the direction you drew and launches you off the end. Puts out fire. |
| 3 | 金 Gold | Light. Dissolves yokai and thorn thickets, and keeps working as a ward after it's painted. |

Ink is a meter. Painting costs ink by length, slow motion drains a little, and ink refills while you run.
While you paint, every ~46 units of brush travel plays a koto note pitched by how high the brush is on screen,
so painting is also music.

## Scrolls
- **一 The First Scroll** (spring): the tutorial.
- **雪 The Snow Pass** (snow): snowfall, snow-capped ground, trees and peaks.
- **波 The Wave Road** (sea): islands over Hokusai-style waves that drown you; Fuji on the horizon.
- **今 Today's Scroll**: generated from the date, so everyone gets the same scroll each day, with a random theme.

## Obstacles
Chasms, cliffs (walls), ink fire (indigo), shadow yokai (gold; they watch you, lean toward you and flinch from a gold brush),
thorn thickets (gold), and the sea on wave scrolls.

## Rank and records
Each scroll has a par time and a par ink. **松 Pine**: within 15% of par time, no falls, efficient ink.
**竹 Bamboo**: within 50% of par, at most 2 falls. **梅 Plum**: everything else. Best grade and time per scroll are kept locally.

## Sharing (the viral loop)
- **Highlight clip**: every run is recorded as a lightweight timeline. At the end, the game re-renders the best
  moments (biggest strokes, effects, the gate) as a ~15 s MP4/WebM with sound and a seal watermark.
- **Share card**: a 1600×900 image of your best stroke, with title, stats and the rank hanko.
- **Full scroll**: the whole level as one long handscroll PNG.
- **Ghost ink**: finished runs are posted to a small server. The next traveler sees faint strokes from recent runs and
  the fastest run's ghost racing alongside them (toggle with `G`).

## Controls
Desktop: `Space`/`W`/`↑` jump · hold mouse to paint · `1 2 3`, `Q`/`E` or the wheel switch ink · right-click undo ·
`R` back to lantern · `G` ghosts · `M` mute · `Esc` menu.
Touch: paint with one finger, jump with the 跳 button, tap the ink stones.

## Tech
Vite + TypeScript + Canvas 2D, with all art procedural. Terrain is pre-rendered into chunks, strokes are baked into
watercolor, wet-bleed and glow sprites, and audio is Web Audio. The ghost-ink API has two interchangeable backends
that share `server/validate.mjs` (payload validation; both also rate-limit per IP):
- `server/server.mjs`: Node with built-in `node:sqlite`, no dependencies. It also serves `dist/` in production.
- `api/`: Vercel functions backed by Upstash Redis (`KV_REST_API_URL` / `KV_REST_API_TOKEN`).

Without either backend the game still plays fully; ghost ink just stays empty.

```
npm run dev       # Vite dev server (proxies /api to :8787)
npm run server    # ghost-ink API on 127.0.0.1:8787
npm start         # build + serve everything from the Node server
```

**Deploying on Vercel:** import the GitHub repo (the Vite preset and `vercel.json` handle the build), then add
Upstash Redis under Storage and connect it to the project. Every push to `main` redeploys.

**Trailer:** `node tools/trailer.mjs` plays scripted scenes on the GPU, records them and cuts
`shots/inkrunner-trailer.mp4` (≤30 s). `edit` re-cuts the existing footage, `card` also redraws the end card,
and `PROFILE=1` replays the scenes without recording and reports slow frames.

## iOS application

The native project is in `ios/App/App.xcodeproj`. Capacitor runs the same game in an iOS WKWebView;
the existing ink artwork, travelers, scrolls, physics, painting, music, and ranking are preserved.
The game and its original fonts are bundled for offline play. The app targets iOS 16 or later because
the original renderer uses Canvas `roundRect` and the ghost client uses `AbortSignal.timeout`.

The iOS additions are landscape orientation, safe areas around the notch and home indicator, the
existing seal as the app icon, native sharing for exported files, and native preferences for records
and settings. A small pause button gives touch players Continue, Undo last stroke, Back to lantern,
Ghost ink, and Choose scroll. Moving the app to the background pauses a run and its audio; Continue
resumes it, including audio that iOS reports as `interrupted` after calls or Siri. Video recording
interrupted by a background switch is stopped and can be retried. `GameViewController` defers iOS
edge swipes, so painting near an edge needs a second swipe to
leave the app. `ITSAppUsesNonExemptEncryption` is false because the app only uses standard HTTPS.

### Build and run on a Mac

Install Node.js 24 or later and Xcode 26 or later with an iOS simulator runtime, then open this
repository on the Mac. [Capacitor requirements](https://capacitorjs.com/docs/getting-started/environment-setup)
and [Apple simulator setup](https://developer.apple.com/documentation/safari-developer-tools/installing-xcode-and-simulators)
describe the required tools.

```sh
npm ci
npm run ios:sync
npm run ios:open
```

In Xcode, select the App scheme and an iPhone simulator, then press Run. Swift Package Manager
resolves Capacitor and the four native plugins; CocoaPods is not needed for this project. For a
physical iPhone, select your Apple team under Signing and Capabilities, connect the phone, enable
Developer Mode, and choose it as the run destination. The provisional bundle ID is
`com.millzach.inkrunner`; change it in `capacitor.config.json` and the Xcode target if needed before
distribution. Simulator builds do not require device signing. See
[Apple device testing](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices).

After game changes, run `npm run ios:sync` again. This builds and copies the latest game into the
native project and normalizes Swift package paths generated on Windows. `npm run ios:run` syncs and
launches a selected simulator or device from a Mac. Apple compilation, signing, TestFlight, and App
Store distribution remain separate from the web build; this Windows checkout contains source and
the copied game assets, not a compiled or signed iOS application.

### Online ghost ink

The native game works offline. To connect the existing online ghosts, set `VITE_GHOST_API_URL` to
your deployed HTTPS backend origin before `npm run ios:sync`, for example in `.env.local`. It must
serve `/api/ghosts` and `/api/runs`. No working production backend URL was verified, so the native
app skips ghost network requests by default. The repository's declared homepage is
`https://inkrunner-kappa.vercel.app`, which Vercel reported as `DEPLOYMENT_NOT_FOUND` on October 3,
2026; the latest production deployment requires Vercel login, so it cannot serve the app either.
Capacitor's native HTTP bridge is enabled for these requests.
The web game retains its existing same-origin API behavior. A production ghost service has not
been tested as part of this port.

### Verification and remaining work

- [x] Clone GitHub revision `8beca34` into this folder and verify the original build.
- [x] Preserve the original game while generating an iOS project and syncing its bundled assets.
- [x] Build and type-check the port; verify iOS plist syntax, privacy resource references, and Swift package paths.
- [x] Run 19 browser checks against `ios/App/App/public` with external network requests blocked.
- [x] Visually inspect menu, gameplay, pause, results, portrait fallback, desktop, icon, and launch assets.
- [x] Compile and launch the native app with Xcode 26.6 in GitHub's iPhone simulator.
- [x] Exercise WKWebView painting, jump, pause/undo, background recovery, and saved preferences in an iPhone simulator.
- [ ] Test simultaneous finger controls, audio, native sharing, and persistent records on a physical iPhone.
- [ ] Verify highlight capture and performance on an iPhone; browser video encoding does not prove iOS support.

Run `npm run test:ios` after syncing. It uses Chrome or Chromium, with `BROWSER_PATH` available for
a custom executable. It checks three landscape sizes with synthetic safe-area insets, all four
scroll selections, two-finger painting and jumping, ink selection, pause, undo, manual respawn,
saved preferences, records, image exports, browser video encoding, unsupported recording feedback,
and the desktop keyboard controls. Completion is tested by seeding the gate scenario and letting
the game execute its finish flow; this is not a full-level speedrun. Screenshots and the report are
saved in the ignored `shots/` folder. Browser touch emulation is not Apple's iOS Simulator.

The throwaway UI prototype is preserved on local branch `prototype/ios-controls`, commit `f719139`,
at `tools/ios-prototype.html`. It compared a corner pause button, bottom action strip, and side
drawer against the original game. The corner button was selected to preserve space for painting.
Run `npm run dev` on that branch and visit `/tools/ios-prototype.html?variant=A`, `B`, or `C`.

### TestFlight through GitHub Actions

The `iOS build and TestFlight` workflow runs on GitHub's `macos-26` runners with Xcode 26.
Pushing `ios/testflight` builds the app and runs a native XCTest journey in an iPhone simulator,
saving menu, gameplay, pause, background-return, and relaunch screenshots plus the test log and
native preferences. This job does not need Apple credentials. GitHub Actions minutes apply to this
private repository. Signed distribution requires the Apple setup below.

The configured developer team is `6B7FL8Z7PX`. The app version is `1.0.0` and the bundle ID is
`com.millzach.inkrunner`. Use these exact identifiers throughout Apple's setup.

**Guided setup:** from Git Bash, run `bash tools/ios-testflight-wizard.sh`. It walks through every
step below and the TestFlight install one stage at a time. It opens each Apple page, picks up the
files you download, validates them, saves the GitHub secrets, pushes the next `ios-testflight-N`
tag, and watches the upload. Progress is remembered in the Git-ignored `.apple/testflight.env`, so
later runs skip straight to uploading a new build.

1. **Register the bundle ID and app record.** Open
   [Apple Identifiers](https://developer.apple.com/account/resources/identifiers/list), select +,
   App IDs, then App. Use description `INKRUNNER` and explicit bundle ID `com.millzach.inkrunner`.
   Keep the default capabilities. Then open [App Store Connect Apps](https://appstoreconnect.apple.com/apps),
   select + > New App, and use platform iOS, name `INKRUNNER`, primary language English (U.S.),
   the registered bundle ID, and SKU `inkrunner-ios`. If Apple reports the name or identifier is
   unavailable, resolve that before signing. The app record must exist before a build is uploaded.
   See [Apple app records](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app).
2. **Download a distribution certificate and profile.** The local certificate request has been
   generated at `.apple/inkrunner.csr`. In
   [Apple Certificates](https://developer.apple.com/account/resources/certificates/list), select +,
   Apple Distribution, and upload that CSR. Download the issued certificate as `.apple/signing.cer`.
   In [Apple Profiles](https://developer.apple.com/account/resources/profiles/list), select +,
   Distribution > App Store Connect, choose the INKRUNNER App ID and that certificate, and name the
   profile `INKRUNNER TestFlight`. Download it as `.apple/profile.mobileprovision`. This approach
   uses OpenSSL on Windows and does not require a Mac to generate signing credentials. Keep the
   `.apple` folder: its private key must match the CSR and downloaded certificate. Do not revoke
   other certificates if Apple reports a certificate limit; existing signing files may need to be
   recovered instead. See [Apple distribution profiles](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile).
3. **Download a team API key for upload.** In
   [App Store Connect Users and Access](https://appstoreconnect.apple.com/access/integrations/api),
   open Integrations > App Store Connect API > Team Keys. Request API access first if necessary,
   then create a key named `INKRUNNER GitHub` with App Manager access. Save its one-time `.p8`
   download to `.apple/AuthKey_KEYID.p8`, retaining Apple's actual filename. Record the Key ID and
   Issuer ID shown on that page. Use a team key; this setup expects an Issuer ID. Keep private key
   contents out of chat and Git. See [Apple API keys](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api).
4. **Store the credentials in GitHub.** Once the files are saved, the assistant can run this from
   the authenticated checkout. It validates the certificate/key match, profile team, bundle ID,
   distribution type, certificate membership, and expiry before configuring GitHub.

   ```sh
   python tools/ios-credentials.py configure --team-id 6B7FL8Z7PX --key-id KEYID --issuer-id ISSUERID
   ```

   The helper uses stdin to save `IOS_CERTIFICATE_BASE64`, `IOS_CERTIFICATE_PASSWORD`,
   `IOS_PROFILE_BASE64`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, and `ASC_PRIVATE_KEY` as repository Actions
   secrets, and `IOS_TEAM_ID` as a repository Actions variable. It generates the encrypted PKCS#12
   file and password locally. The `.apple` folder and downloaded private-key files are Git ignored.
   OpenSSL (included with Git for Windows), Python 3, and authenticated `gh` are required. On a new
   checkout, run `python tools/ios-credentials.py prepare` to create a CSR, then obtain its matching
   certificate. Do not regenerate a signing key for a certificate created from another CSR.

After the simulator check passes and the app record and secrets are ready, push a new
`ios-testflight-*` tag pointing to the reviewed commit. That triggers a simulator check followed
by a signed archive that `xcodebuild -exportArchive` uploads directly with the API key (Xcode 26's
`altool --upload-app` path is deprecated). The signed job uses the `testflight` GitHub
environment and removes its temporary signing keychain/profile after use. It does not run on a
normal branch push. Once this workflow is on the default branch, Actions > iOS build and TestFlight
> Run workflow also supports an explicit upload checkbox; it defaults off. Each workflow run and
rerun receives a separate build version (`run_number.run_attempt.0`), within Apple's numeric limits.

An accepted upload still needs Apple processing. In App Store Connect > INKRUNNER > TestFlight,
create an internal testing group, add the processed
build, and select yourself as a tester. Invitation delivery is managed in App Store Connect;
the workflow does not invite people or publish the app on the App Store. External testing may
require Apple's beta review. See [Apple TestFlight workflow](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).

Suggested beta description: “Paint bridges, currents, and wards across a Japanese ink handscroll.
Run as Ren or Kohaku through three scrolls and a daily challenge.” What to test: painting and
jumping together, all ink types and travelers, pause/background recovery, saved records, image
sharing, and highlight recording. Use your own feedback email. The default build plays offline;
online ghost ink still requires a deployed `VITE_GHOST_API_URL`.

Release state:
- [x] Prepare the shared Xcode scheme, CI scripts, signing helper, and certificate request.
- [x] Verify a GitHub-hosted Xcode build and visually inspect its iPhone simulator screenshot.
- [x] Pass the native painting/pause/background/relaunch journey and inspect its captured screens.
- [ ] Create the Apple app record and obtain signing/upload files.
- [ ] Validate credentials, save GitHub secrets, archive, and upload the signed app.
- [ ] Confirm Apple processing and make the build available to the selected TestFlight tester.

The native build and interaction journey passed in
[GitHub Actions run 37047823490](https://github.com/millZach/inkrunner/actions/runs/37047823490)
on an iPhone 17 Pro simulator with Xcode 26.6. XCTest selected The Wave Road and Kohaku, tapped
jump, painted a committed stroke, opened pause, changed the ghost preference, undid the stroke,
returned from the home screen into a paused run, chose the menu, and terminated/relaunched the app.
The ghost preference remained off after relaunch. A separate check read the actual native
UserDefaults file and confirmed the selected scroll (`sea`), traveler (`kohaku`), and ghost setting
(`0`). Logs, preference evidence, and screen captures are saved locally at
`shots/native-simulator-37047823490/`. The captured menu, painted run, pause sheet, background
return, and restored preference were visually inspected against the original game.

This native journey is not a full-level playthrough or a simultaneous two-finger test. Audio,
native sharing, highlight capture, saved run records, and physical-device performance remain
unverified on iOS and belong in the first TestFlight session. The browser checks above provide
separate coverage of completion, records, exports, and simultaneous controls.
