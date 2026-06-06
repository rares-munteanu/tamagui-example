import '@tamagui/native/setup-gesture-handler';
import '@tamagui/native/setup-teleport';

import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { TamaguiProvider } from 'tamagui';
import { tamaguiConfig } from '../tamagui.config';

import { getGestureHandlerConfig, setupGestureHandler } from '@tamagui/native/setup-gesture-handler';
// isGestureHandlerEnabled is on the '@tamagui/sheet/setup-gesture-handler' subpath, NOT '@tamagui/sheet'.
// It returns the same flag the Sheet checks before it decides to use RNGH.
import { isGestureHandlerEnabled } from '@tamagui/sheet/setup-gesture-handler';

// Proof that the `sheet` option does nothing: only `pressEvents` is read.
// This must run before TamaguiProvider mounts, or the change is ignored.

// Ask for: presses off, sheet on.
setupGestureHandler({ pressEvents: false, sheet: true });

// The config kept sheet: true, so the option was accepted.
console.log('config stored        =', getGestureHandlerConfig());
// But the flag the Sheet reads is false, so the Sheet drops RNGH.
console.log('Sheet RNGH gate sees =', isGestureHandlerEnabled());
// sheet: true was saved here instead, into a global that nothing reads.
console.log('dead global          =', (globalThis as any).__tamagui_sheet_gesture_state__?.enabled);

// Opposite case: presses on, sheet off. The Sheet still uses RNGH, so sheet: false is ignored too.
setupGestureHandler({ pressEvents: true, sheet: false });
console.log('reverse: gate sees   =', isGestureHandlerEnabled());

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TamaguiProvider config={tamaguiConfig} defaultTheme='light'>
        <Stack />
      </TamaguiProvider>
    </GestureHandlerRootView>
  );
}
