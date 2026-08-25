# Halcyon Video for Android TV / Fire TV

A launcher tile that opens your store. That is the whole app: an Activity, a
fullscreen WebView, and one screen where you type the address of the machine
running Halcyon Video.

It exists because of one key. The Remote Play viewer (`/remote.html`) already
works on a television — a device test on 2026-08-20 drove it from a Google TV
Streamer and the store browsed fine — but getting there meant sideloading a
third-party browser, and in every TV browser the remote's **BACK** belongs to
the browser: TV Bro spends it leaving d-pad mode, Silk spends it on history.
Backing out of an aisle either did nothing or navigated away from the store,
so the viewer had to paint an on-screen BACK pill and ask you to click it with
the browser's virtual cursor. Owning the Activity means BACK arrives here
first and gets handed to the page, and the store appears on the home screen
like any other app.

## Using it

1. Sideload the APK (below).
2. Open **Halcyon Video** from the launcher.
3. Type your store's address — the one shown in the store's Connection
   settings, e.g. `192.168.1.20:1420`. It is remembered; you do this once.

Then:

| Remote | Does |
| --- | --- |
| D-pad | browse the aisles |
| OK | select / pause / resume |
| BACK | back out of wherever you are |
| Play/Pause | select, or pause the film |
| Rewind / Fast-forward | seek during playback |
| MENU | show the controls legend again |
| **hold BACK** | back to the address screen |
| HOME | leave the app (the system's key, always works) |

The address box is generous about what you type: `192.168.1.20`,
`192.168.1.20:1420`, `http://halcyon.lan:1420/`, or the whole
`http://192.168.1.20:1420/remote.html` pasted out of a browser all reach the
same place. With no port, it assumes the store's own `1420`. An `https://`
address is left on 443, on the assumption you put a reverse proxy in front.

## Building

Needs a JDK (17 or 21) and the Android SDK — Android Studio supplies both;
`android-tv/` opens directly as a project.

```sh
cd android-tv
gradle assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
gradle test                 # address parsing, on a plain JVM — no device
```

No `gradle-wrapper.jar` is committed. A binary blob nobody can review in a
diff is precisely the supply-chain artifact a public repo should not carry, so
bring your own Gradle (8.7+) or let Android Studio provide it. CI does the
same — see `.github/workflows/build-tv-apk.yml`, which builds on every change
here and uploads the APK as a workflow artifact. **Downloading that artifact
is the easiest way to get an installable APK without a build environment.**

## Sideloading

Fire TV and Google TV both need developer mode turned on first: Settings →
System → About → click the build number seven times, then Settings → System →
Developer options → *ADB debugging* on. (On Fire TV it is Settings → My Fire
TV → Developer options, and *Apps from Unknown Sources* as well.)

```sh
adb connect 192.168.1.55:5555      # the TV box's address, from its network settings
adb install -r app-debug.apk
```

`-r` reinstalls over an existing copy. The tile appears in the launcher's apps
row; on Google TV it may take a minute, or need *Apps → See all*.

## Signing

Sideloading needs *a* signature, not a trusted one, so the release build falls
back to the debug key when no keystore is configured and
`gradle assembleRelease` works out of the box. That is fine until you want to
upgrade: Android refuses to install an APK over one signed with a different
key, and the debug key differs from machine to machine and from CI. If you
expect to update this app in place, make one keystore and keep using it:

```sh
keytool -genkey -v -keystore halcyon-tv.jks -alias halcyon \
        -keyalg RSA -keysize 2048 -validity 10000
```

Point the build at it with `android-tv/keystore.properties` (git-ignored):

```properties
storeFile=halcyon-tv.jks
storePassword=…
keyAlias=halcyon
keyPassword=…
```

or with the `HALCYON_TV_KEYSTORE`, `HALCYON_TV_KEYSTORE_PASSWORD`,
`HALCYON_TV_KEY_ALIAS` and `HALCYON_TV_KEY_PASSWORD` environment variables.
**Never commit the keystore or its passwords.**

## What's in here

| | |
| --- | --- |
| `MainActivity.kt` | the WebView, and the BACK key that is the reason this app exists |
| `SetupActivity.kt` | the address screen |
| `StoreAddress.kt` | typed text → viewer URL. Pure, no Android imports, unit-tested |
| `StorePrefs.kt` | the one thing the app remembers |
| `AndroidManifest.xml` | the leanback launcher entry and the two `uses-feature` lines that make a TV app a TV app |
| `art/banner.svg` | the launcher banner, re-laid from `src-tauri/icons/app-icon.svg` — regenerate with `art/make-banner.sh` |

### Notes for whoever touches this next

- **`android:required="false"` on `android.hardware.touchscreen` is load-bearing.**
  A TV box has no touchscreen, and an app that does not say it can live
  without one is filtered out of the Android TV launcher entirely. The tile
  silently never appears; nothing errors.
- **The page is loaded with `?tv=1&tvapp=1`.** `tv=1` skips the viewer's
  user-agent sniff — inside our own APK a UA string should decide nothing.
  `tvapp=1` tells `src/remote-tv.ts` a native shell owns the remote, so it
  drops the on-screen BACK pill and the history-sentinel trap it installs for
  TV *browsers*. Both would be wrong here.
- **BACK is intercepted in `dispatchKeyEvent`**, ahead of the view hierarchy,
  and forwarded as a synthetic `Escape` on `window`. The viewer binds ordinary
  `window` keydown/keyup listeners and reads `key`/`code` off the event, so
  there is no bridge object and no page-side API to keep in step. That
  contract is checked by `tools/verify_remote_tv.mjs`, not just asserted here.
- **The d-pad has to be forwarded the same way, and this is the surprise.**
  A WebView does *not* hand DPAD_LEFT/RIGHT/UP/DOWN or DPAD_CENTER to the
  page: Chromium treats them as focus traversal, looks for the next focusable
  element, finds none — the viewer is a `<video>` and a few overlays, with a
  measured focusable count of zero — and drops the event without ever firing
  a keydown. Measured on a Google TV system image on 2026-08-25: the media
  keys arrived, the entire d-pad did not. Hence `FORWARDED_KEYS` in
  `MainActivity`. The media keys are deliberately *not* in that table,
  because they do arrive on their own and would otherwise be delivered twice.
- **`mediaPlaybackRequiresUserGesture = false` is load-bearing too.** There is
  no "tap to play" gesture on a television, and the stream is the whole app.
- The `<video>` in `remote.html` carries a 1x1 transparent `poster` for this
  app's sake: with no source and no poster, an Android WebView paints a
  full-size play triangle, so "looking for the store" came up as a giant play
  button underneath the message. Do not remove it.
- New viewer features belong in the page, where every other client gets them
  too — this module should stay small. Its whole job is the keys a WebView
  will not pass on.
