/**
 * Compass — registers a single sidebar button on NOTE files. Tapping it
 * opens the direction-chooser view (App.tsx); the view does the work
 * and closes itself.
 *
 * @format
 */

import { AppRegistry, Image } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { PluginManager } from 'sn-plugin-lib';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

const BUTTON_ID = 1;

// showType: 1 — the host opens the plugin view on tap. The view drives
// the actual work; the listener is a no-op here.
PluginManager.registerButton(1, ['NOTE'], {
  id: BUTTON_ID,
  name: 'Compass',
  icon: Image.resolveAssetSource(require('./assets/icon.png')).uri,
  showType: 1,
});

PluginManager.registerButtonListener({
  onButtonPress: () => {},
});
