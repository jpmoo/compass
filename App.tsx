/**
 * Compass — direction chooser. Four buttons arranged like a compass
 * rose. Tapping one drops a shortcut link on the corresponding edge of
 * the current page, creates a new page at the end of the note, and
 * places a return link on the opposite edge of that new page.
 *
 * @format
 */

import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import { PluginManager } from 'sn-plugin-lib';
// @ts-ignore — plain JS module
import { createLinkedPage, exportMap } from './compass';

type Direction = 'up' | 'right' | 'down' | 'left';

const LABELS: Record<Direction, string> = {
  up: '↑',
  right: '→',
  down: '↓',
  left: '←',
};

function App(): React.JSX.Element {
  const [busy, setBusy] = useState(false);

  const onPick = (dir: Direction) => {
    if (busy) return;
    setBusy(true);
    createLinkedPage(dir)
      .then(
        (info: { newPage: number }) => {
          ToastAndroid.showWithGravity(
            `Compass: linked to new page ${info.newPage + 1}`,
            ToastAndroid.SHORT,
            ToastAndroid.BOTTOM,
          );
        },
        (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          ToastAndroid.showWithGravity(
            `Compass failed: ${message}`,
            ToastAndroid.LONG,
            ToastAndroid.BOTTOM,
          );
        },
      )
      .finally(() => {
        setBusy(false);
        PluginManager.closePluginView().catch(() => {});
      });
  };

  const button = (dir: Direction) => (
    <Pressable
      onPress={() => onPick(dir)}
      disabled={busy}
      style={({ pressed }) => [
        styles.btn,
        pressed && styles.btnPressed,
        busy && styles.btnDisabled,
      ]}>
      <Text style={styles.btnText}>{LABELS[dir]}</Text>
    </Pressable>
  );

  const onExport = () => {
    if (busy) return;
    setBusy(true);
    exportMap()
      .then(
        (info: { outPath: string; conflicts: number; pageCount: number }) => {
          const conflictNote =
            info.conflicts > 0 ? ` (${info.conflicts} conflict${info.conflicts === 1 ? '' : 's'})` : '';
          ToastAndroid.showWithGravity(
            `Compass map: ${info.pageCount} page${info.pageCount === 1 ? '' : 's'} → ${info.outPath}${conflictNote}`,
            ToastAndroid.LONG,
            ToastAndroid.BOTTOM,
          );
        },
        (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          ToastAndroid.showWithGravity(
            `Compass map failed: ${message}`,
            ToastAndroid.LONG,
            ToastAndroid.BOTTOM,
          );
        },
      )
      .finally(() => {
        setBusy(false);
        PluginManager.closePluginView().catch(() => {});
      });
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Add shortcut link on…</Text>
      <View style={styles.rose}>
        <View style={styles.row}>{button('up')}</View>
        <View style={styles.row}>
          {button('left')}
          <View style={styles.spacer} />
          {button('right')}
        </View>
        <View style={styles.row}>{button('down')}</View>
      </View>
      <Pressable
        onPress={onExport}
        disabled={busy}
        style={({ pressed }) => [
          styles.export,
          pressed && styles.btnPressed,
          busy && styles.btnDisabled,
        ]}>
        <Text style={styles.exportText}>Export Map PNG</Text>
      </Pressable>
      <Pressable
        onPress={() => PluginManager.closePluginView().catch(() => {})}
        style={styles.cancel}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const BTN = 96;
const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#ffffff',
  },
  title: { fontSize: 22, marginBottom: 24, color: '#000' },
  rose: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  spacer: { width: BTN },
  btn: {
    width: BTN,
    height: BTN,
    margin: 8,
    borderWidth: 2,
    borderColor: '#000',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  btnPressed: { backgroundColor: '#eee' },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: 44, color: '#000' },
  export: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderWidth: 2,
    borderColor: '#000',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  exportText: { fontSize: 20, color: '#000' },
  cancel: { marginTop: 16, padding: 12 },
  cancelText: { fontSize: 18, color: '#000' },
});

export default App;
