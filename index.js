/**
 * ScrollExport — stitches every page of the current note into a single
 * tall PNG. The export runs directly in the button listener, with
 * showType=0 so no plugin view is opened. Toast on success, dialog on
 * failure.
 *
 * @format
 */

import { AppRegistry, Image, NativeModules, ToastAndroid } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import {
  FileUtils,
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
} from 'sn-plugin-lib';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

const BUTTON_ID = 1;

// showType: 1 is required even though we never use the plugin view —
// the Supernote host only loads the plugin's native-module APK when a
// view is actually instantiated. With showType: 0 the ScrollStitch
// module never registers and stitchVertically blows up. The button
// listener still fires on every press regardless of view state, so we
// do the work there and close the view immediately.
PluginManager.registerButton(1, ['NOTE'], {
  id: BUTTON_ID,
  name: 'Export Scroll PNG',
  icon: Image.resolveAssetSource(require('./assets/icon.png')).uri,
  showType: 1,
});

PluginManager.registerButtonListener({
  onButtonPress: (msg) => {
    if (!msg || msg.id !== BUTTON_ID) return;
    runExport()
      .then(
        (outPath) => {
          ToastAndroid.showWithGravity(
            `Exported ${outPath}`,
            ToastAndroid.LONG,
            ToastAndroid.BOTTOM,
          );
        },
        (err) => {
          const message = err instanceof Error ? err.message : String(err);
          ToastAndroid.showWithGravity(
            `Scroll export failed: ${message}`,
            ToastAndroid.LONG,
            ToastAndroid.BOTTOM,
          );
        },
      )
      .finally(() => {
        // The view exists only to keep the host loading our native module.
        // Close it as soon as the work is done.
        PluginManager.closePluginView().catch(() => {});
      });
  },
});

function unwrap(value, what) {
  if (!value || !value.success) {
    throw new Error((value && value.error && value.error.message) || `${what} failed`);
  }
  return value.result;
}

function deriveBaseName(notePath) {
  const last = notePath.split('/').pop() || 'note';
  const noExt = last.replace(/\.[^.]+$/, '');
  const safe = noExt.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return safe.length > 0 ? safe : 'note';
}

async function runExport() {
  const exportDir = await FileUtils.getExportPath();
  if (!exportDir) throw new Error('cannot resolve EXPORT directory');
  await FileUtils.makeDir(exportDir);

  const pluginDir = await PluginManager.getPluginDirPath();
  if (!pluginDir) throw new Error('cannot resolve plugin directory');

  const notePath = unwrap(
    await PluginCommAPI.getCurrentFilePath(),
    'getCurrentFilePath',
  );
  const baseName = deriveBaseName(notePath);

  const total = unwrap(
    await PluginFileAPI.getNoteTotalPageNum(notePath),
    'getNoteTotalPageNum',
  );
  if (!total || total < 1) throw new Error('note has no pages');

  const stamp = Date.now();
  const trimmedExport = exportDir.replace(/\/+$/, '');
  const trimmedPlugin = pluginDir.replace(/\/+$/, '');
  const tmpDir = `${trimmedPlugin}/scroll-${stamp}`;
  await FileUtils.makeDir(tmpDir);

  const pagePaths = [];
  try {
    for (let i = 0; i < total; i++) {
      const pagePath = `${tmpDir}/page-${String(i).padStart(4, '0')}.png`;
      unwrap(
        await PluginFileAPI.generateNotePng({
          notePath,
          page: i,
          times: 1,
          pngPath: pagePath,
          type: 1,
        }),
        `generateNotePng(page ${i})`,
      );
      pagePaths.push(pagePath);
    }

    const stagedPath = `${tmpDir}/scroll_${baseName}_${stamp}.png`;
    const outPath = `${trimmedExport}/scroll_${baseName}_${stamp}.png`;
    const stitcher = NativeModules.ScrollStitch;
    if (!stitcher || typeof stitcher.stitchVertically !== 'function') {
      throw new Error('ScrollStitch native module is not registered');
    }
    await stitcher.stitchVertically(pagePaths, stagedPath);

    // Hand the finished PNG over to the SDK so the device's file index
    // sees it. A raw FileOutputStream write into EXPORT lands on disk
    // but doesn't register with Supernote's file browser.
    const moved = await FileUtils.renameToFile(stagedPath, outPath);
    if (!moved) {
      const copied = await FileUtils.copyFile(stagedPath, outPath);
      if (!copied) throw new Error('could not move stitched PNG into EXPORT');
      try {
        await FileUtils.deleteFile(stagedPath);
      } catch {
        // best-effort cleanup
      }
    }
    return outPath;
  } finally {
    for (const p of pagePaths) {
      try {
        await FileUtils.deleteFile(p);
      } catch {
        // best-effort cleanup
      }
    }
    try {
      await FileUtils.deleteDir(tmpDir);
    } catch {
      // best-effort cleanup
    }
  }
}
