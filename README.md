# ScrollExport

> Vibe-coded with [Claude](https://claude.com/claude-code). No human wrote
> a line of this — review accordingly before relying on it.

A Supernote plugin that adds an **Export Scroll PNG** button to the note
sidebar menu. Tap it on any NOTE and every page is stitched, top to
bottom, into a single tall PNG dropped in the device's **EXPORT** folder
as `scroll_<note name>_<timestamp>.png`.

## How it works

1. The plugin registers a Type-1 (sidebar) button via
   `PluginManager.registerButton` with `showType: 1`. The export runs
   in the `PluginManager.registerButtonListener` callback (which fires
   fresh on every press) and closes the view via
   `PluginManager.closePluginView()` as soon as the work is done.
   `showType: 1` is required even though we never use the view —
   Supernote only loads the plugin's native-module APK when a view is
   instantiated, so `showType: 0` would leave `ScrollStitch`
   unregistered. Running the work in `useEffect` inside the view (an
   earlier attempt) doesn't work either: `closePluginView` hides the
   view without unmounting the component, so the next press just
   reuses the stale instance and the effect never re-runs.
2. The listener reads `getNoteTotalPageNum` and loops
   `PluginFileAPI.generateNotePng` to render each page to a temp PNG in
   the plugin directory.
3. A small native Android module (`ScrollStitch`) decodes each page,
   draws them centered onto one tall `ARGB_8888` bitmap with a white
   background, and writes the result as a PNG into the plugin's temp
   dir.
4. `FileUtils.renameToFile` (fallback: `copyFile` + `deleteFile`) moves
   the stitched PNG into EXPORT — going through the SDK so Supernote's
   file index sees it.
5. The per-page temp files are deleted.
6. Success and failure both surface as a bottom-of-screen
   `ToastAndroid` flash — no confirmation required.

## Project layout

```
.
├── App.tsx                                  # plugin UI + export logic
├── index.js                                 # registers the sidebar button
├── app.json                                 # RN AppRegistry name (must equal pluginKey)
├── PluginConfig.json                        # plugin manifest (name, desc, icon, id)
├── package.json
├── tsconfig.json / babel.config.js / metro.config.js
├── buildPlugin.sh                           # Supernote-supplied packager → .snplg
├── buildPlugin.ps1                          # Windows variant
├── assets/icon.png                          # plugin icon shown in the sidebar
└── android/                                 # RN Android scaffold + ScrollStitch native module
    └── app/src/main/java/com/scrollexport_scaffold/
        ├── MainActivity.kt
        ├── MainApplication.kt
        ├── ScrollStitchModule.kt            # Bitmap-based vertical stitcher
        └── ScrollStitchPackage.kt
```

## Build

### Prerequisites

- Node.js 18+
- JDK 17 (e.g. `brew install openjdk@17`)
- Android command-line tools with `platforms;android-35`,
  `build-tools;35.0.0`, `ndk;27.1.12297006`

### Build the plugin

```bash
export JAVA_HOME=$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=$(brew --prefix android-commandlinetools)/share/android-commandlinetools
export PATH="$JAVA_HOME/bin:$PATH"

npm install
./buildPlugin.sh
```

Output: `build/outputs/scrollexport.snplg` (~7 MB).

## Install on device

1. Connect the Supernote in USB transfer mode.
2. Copy `scrollexport.snplg` to the `MyStyle` folder.
3. On the device: **Settings → Apps → Plugins → Add Plugin →
   `scrollexport.snplg`**.

## Use

1. Open any NOTE.
2. Open the side menu, expand the **Plugins** submenu, and tap
   **Export Scroll PNG**. (The Supernote firmware groups all plugin
   sidebar buttons under Plugins; there's no SDK option to surface
   them at the top level.)
3. A single tall PNG of all pages stitched top-to-bottom appears in the
   **EXPORT** folder, named `scroll_<note name>_<timestamp>.png`.

## Caveats

- The stitcher holds the full output bitmap in memory. Very long notes
  may OOM — tune `Bitmap.Config.ARGB_8888` to `RGB_565` in
  `ScrollStitchModule.kt` if you need to push further.
- Pages of differing widths are centered on the widest page; the rest
  of the row is filled white.

## Compatibility

Built against:

- React Native 0.79.2
- `sn-plugin-lib` 0.1.x
- Supernote firmware exposing the official Plugin SDK

Tested on the build host only; please verify on-device behavior before
relying on the output.

## License

MIT.
