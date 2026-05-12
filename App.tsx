/**
 * ScrollExport — stitches every page of the current note into a single tall PNG.
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  NativeModules,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  FileUtils,
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
} from 'sn-plugin-lib';

interface APIResponse<T> {
  success: boolean;
  result: T;
  error?: { code: number; message: string };
}

type Status =
  | { kind: 'working'; note: string }
  | { kind: 'done'; path: string }
  | { kind: 'error'; message: string };

const { ScrollStitch } = NativeModules as {
  ScrollStitch: { stitchVertically: (paths: string[], outPath: string) => Promise<string> };
};

function App(): React.JSX.Element {
  const [status, setStatus] = useState<Status>({ kind: 'working', note: 'Preparing…' });

  useEffect(() => {
    exportScroll((note) => setStatus({ kind: 'working', note })).then(
      (path) => setStatus({ kind: 'done', path }),
      (err: unknown) =>
        setStatus({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        }),
    );
  }, []);

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.closeButton}
        onPress={() => PluginManager.closePluginView()}>
        <Text style={styles.closeText}>✕</Text>
      </Pressable>

      {status.kind === 'working' && (
        <>
          <ActivityIndicator size="large" />
          <Text style={styles.message}>{status.note}</Text>
        </>
      )}

      {status.kind === 'done' && (
        <>
          <Text style={styles.title}>Exported</Text>
          <Text style={styles.path}>{status.path}</Text>
        </>
      )}

      {status.kind === 'error' && (
        <>
          <Text style={styles.title}>Export failed</Text>
          <Text style={styles.path}>{status.message}</Text>
        </>
      )}
    </View>
  );
}

function unwrap<T>(value: unknown, what: string): T {
  const res = value as APIResponse<T> | null | undefined;
  if (!res || !res.success) {
    throw new Error(res?.error?.message ?? `${what} failed`);
  }
  return res.result;
}

function deriveBaseName(notePath: string): string {
  const last = notePath.split('/').pop() ?? 'note';
  const noExt = last.replace(/\.[^.]+$/, '');
  const safe = noExt.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return safe.length > 0 ? safe : 'note';
}

async function exportScroll(onProgress: (msg: string) => void): Promise<string> {
  const exportDir = await FileUtils.getExportPath();
  if (!exportDir) throw new Error('cannot resolve EXPORT directory');
  await FileUtils.makeDir(exportDir);

  const pluginDir = await PluginManager.getPluginDirPath();
  if (!pluginDir) throw new Error('cannot resolve plugin directory');

  const notePath = unwrap<string>(
    await PluginCommAPI.getCurrentFilePath(),
    'getCurrentFilePath',
  );
  const baseName = deriveBaseName(notePath);

  const total = unwrap<number>(
    await PluginFileAPI.getNoteTotalPageNum(notePath),
    'getNoteTotalPageNum',
  );
  if (!total || total < 1) throw new Error('note has no pages');

  const stamp = Date.now();
  const trimmedExport = exportDir.replace(/\/+$/, '');
  const trimmedPlugin = pluginDir.replace(/\/+$/, '');
  const tmpDir = `${trimmedPlugin}/scroll-${stamp}`;
  await FileUtils.makeDir(tmpDir);

  const pagePaths: string[] = [];
  try {
    for (let i = 0; i < total; i++) {
      onProgress(`Rendering page ${i + 1} of ${total}…`);
      const pagePath = `${tmpDir}/page-${String(i).padStart(4, '0')}.png`;
      unwrap<boolean>(
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

    onProgress(`Stitching ${total} pages…`);
    const stagedPath = `${tmpDir}/scroll_${baseName}_${stamp}.png`;
    const outPath = `${trimmedExport}/scroll_${baseName}_${stamp}.png`;
    await ScrollStitch.stitchVertically(pagePaths, stagedPath);

    // Hand the finished PNG over to the SDK so the device's file index
    // sees it. A raw FileOutputStream write into EXPORT lands on disk
    // but doesn't register with Supernote's file browser.
    onProgress('Saving to EXPORT…');
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 24,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  closeText: { fontSize: 20, fontWeight: '600', color: '#000' },
  message: { marginTop: 16, fontSize: 16, color: '#000' },
  title: { fontSize: 22, fontWeight: '600', color: '#000', marginBottom: 8 },
  path: {
    fontSize: 13,
    color: '#444',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});

export default App;
