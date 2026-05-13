# Compass

> Vibe-coded with [Claude](https://claude.com/claude-code). No human wrote
> a line of this — review accordingly before relying on it.

A Supernote plugin that drops a **shortcut link** on the current page
pointing to a brand-new page appended to the end of the same note, and
puts a matching **return link** on the opposite edge of that new page.

Pick the edge of the current page where you want the outbound link —
right / up / left / down — and Compass:

1. Appends a new page (same template as the current page) to the note.
2. Inserts an arrow-glyph text link on the chosen edge of the current
   page that jumps to the new page.
3. Inserts a return link on the opposite edge of the new page that
   jumps back. (Top → bottom, right → left, and vice versa.)

The chooser view also has an **Export Map PNG** button. It treats the
compass links as a 2D map: starting from the currently-open page (at
the origin), BFS follows every "→/↑/←/↓" link in the note to assign
each reachable page a grid coordinate. The pages are then rendered and
stitched into one PNG laid out as the map, written to **EXPORT** as
`map_<note name>_<timestamp>.png`. Empty cells stay white. Conflicting
links (two paths trying to land a page at different cells, or two
pages trying to claim the same cell) use first-write-wins and the
toast reports the conflict count.

## How it works

1. The plugin registers a Type-1 (sidebar) button via
   `PluginManager.registerButton` with `showType: 1`. Tapping it opens
   a small chooser view (a compass rose of four arrow buttons).
2. Picking a direction calls `compass.createLinkedPage(direction)`:
   - `PluginCommAPI.getCurrentFilePath` + `getCurrentPageNum` →
     source page.
   - `PluginFileAPI.getNoteTotalPageNum` → where to append.
   - `PluginFileAPI.getNotePageTemplate` → keep the new page looking
     like the source page.
   - `PluginFileAPI.insertNotePage` → create the new page at the end.
   - `PluginFileAPI.getPageSize` → page pixel dimensions for placement.
   - `PluginNoteAPI.insertTextLink` → outbound link on the current
     page (`insertTextLink` always targets the current page).
   - `PluginCommAPI.createElement(TYPE_LINK)` + `PluginFileAPI.insertElements`
     → return link on the new page. The SDK has no page-navigation API,
     so the return link can't go through `insertTextLink`; we build a
     link element directly and insert it on the target page.
3. The view closes itself with `PluginManager.closePluginView()` and a
   bottom toast reports success or failure.

## Project layout

```
.
├── App.tsx                                  # chooser-rose view + export button
├── compass.js                               # createLinkedPage + exportMap
├── index.js                                 # registers the sidebar button
├── app.json                                 # RN AppRegistry name (= pluginKey)
├── PluginConfig.json                        # plugin manifest
├── package.json
├── tsconfig.json / babel.config.js / metro.config.js
├── buildPlugin.sh                           # Supernote-supplied packager → .snplg
├── buildPlugin.ps1                          # Windows variant
├── assets/                                  # compass SVG source + rasterized icon.png
└── android/                                 # RN Android scaffold;
                                             #   ScrollStitchModule.kt holds the
                                             #   vertical and grid bitmap stitchers
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

Output: `build/outputs/compass.snplg`.

## Install on device

1. Connect the Supernote in USB transfer mode.
2. Copy `compass.snplg` to the `MyStyle` folder.
3. On the device: **Settings → Apps → Plugins → Add Plugin →
   `compass.snplg`**.

## Use

1. Open any NOTE.
2. Open the side menu, expand the **Plugins** submenu, and tap
   **Compass**.
3. In the chooser, tap the arrow for the edge you want the outbound
   link on. The new page is appended to the note; the outbound and
   return links appear automatically.

## Caveats

- The link box dimensions and edge insets (see `compass.js`) are tuned
  by eye on a Supernote A5X. If the arrow looks too small/large or
  sits awkwardly, tweak `LINK_BOX_LONG` / `LINK_BOX_SHORT` /
  `EDGE_INSETS` / `FONT_SIZE`. The top edge gets a larger inset by
  default so links don't hide under the device's toolbar.
- New pages are always appended at the end of the note (not inserted
  right after the current page). The map export reconstructs the
  spatial layout from the compass-link arrows regardless.
- The map export identifies compass links by their arrow glyph
  (`→ ↑ ← ↓`) in the link's text — hand-placed page links that use
  other text are ignored.

## Compatibility

Built against:

- React Native 0.79.2
- `sn-plugin-lib` 0.1.x
- Supernote firmware exposing the official Plugin SDK

Lightly tested on-device — please verify the behavior on your own
note files before relying on the output.

## License

MIT.
