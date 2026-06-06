# Tamagui Sheet: `setupGestureHandler({ sheet })` is a no-op

This repo reproduces a bug in `tamagui@2.1.0`: the `sheet` option of `setupGestureHandler` has no effect. Whether the Sheet uses react-native-gesture-handler (RNGH) is decided only by `pressEvents`. The `sheet` value is written to a global that nothing reads.

The proof runs at startup in [`src/app/_layout.tsx`](src/app/_layout.tsx) and logs to the console.

## Reproduction

```ts
import { getGestureHandlerConfig, setupGestureHandler } from '@tamagui/native/setup-gesture-handler';
// isGestureHandlerEnabled is exported from this subpath, not from '@tamagui/sheet'.
// It returns the same flag the Sheet checks before it decides to use RNGH.
import { isGestureHandlerEnabled } from '@tamagui/sheet/setup-gesture-handler';

// Ask for: presses off, sheet on.
setupGestureHandler({ pressEvents: false, sheet: true });
console.log('config stored        =', getGestureHandlerConfig());
console.log('Sheet RNGH gate sees =', isGestureHandlerEnabled());
console.log('dead global          =', (globalThis as any).__tamagui_sheet_gesture_state__?.enabled);

// Opposite case: presses on, sheet off.
setupGestureHandler({ pressEvents: true, sheet: false });
console.log('reverse: gate sees   =', isGestureHandlerEnabled());
```

## Actual output

```
config stored        = {"pressEvents": false, "sheet": true}
Sheet RNGH gate sees = false
dead global          = true
reverse: gate sees   = true
```

## How to read this

- `config stored` keeps `sheet: true`, so the option was accepted (not a typo or a dropped input).
- `Sheet RNGH gate sees` is `false`. This is the value every Sheet RNGH gate reads, so the Sheet uses `PanResponder`, even though `sheet: true` was requested.
- `dead global` is `true`, so `sheet: true` was written into `__tamagui_sheet_gesture_state__`, a key nothing reads.
- `reverse: gate sees` is `true` with `sheet: false`, so the Sheet keeps RNGH even when `sheet: false` was requested.

## Placement note

The setup call must run before the first render. If it runs after `<TamaguiProvider>` mounts, Tamagui freezes the `pressEvents` value and prints `[Tamagui] Ignored setupGestureHandler() because gesture handler press events were already enabled when TamaguiProvider mounted. Configure gesture handler mode before the first render.` Running it in the root layout module (as above) avoids this. The `sheet` value is never frozen, because nothing consumes it.

`isGestureHandlerEnabled` from `@tamagui/sheet/setup-gesture-handler` is the sheet package's own exported function. Its body is the same one line the Sheet's internal gates use, so its return value is exactly what those gates evaluate.

## Root cause (from the published 2.1.0 source)

1. The main gesture state `enabled` is set only from `pressEvents` - `@tamagui/native/src/setup-gesture-handler.ts:70-76`:

```ts
getGestureHandler().set({
  enabled: currentConfig.pressEvents !== false,
  Gesture,
  GestureDetector,
  ScrollView: ScrollView || null,
  RootView: GestureHandlerRootView || null,
});
```

2. The `sheet` flag is written into a separate global - `@tamagui/native/src/setup-gesture-handler.ts:78-85`. This is the only place `currentConfig.sheet` is read:

```ts
// sheet state - only enable if sheet is true
g.__tamagui_sheet_gesture_state__ = {
  enabled: currentConfig.sheet !== false,
  Gesture,
  GestureDetector,
  ScrollView: ScrollView || null,
  RootView: GestureHandlerRootView || null,
};
```

3. `__tamagui_sheet_gesture_state__` is never read. A search across the whole installed `@tamagui` tree (all packages, all build outputs) finds 5 references, and all 5 are the same write (the `src` file plus its 4 compiled bundles). There are 0 reads:

```
@tamagui/native/src/setup-gesture-handler.ts:79              g.__tamagui_sheet_gesture_state__ = {
@tamagui/native/dist/esm/setup-gesture-handler.mjs:38        g.__tamagui_sheet_gesture_state__ = {
@tamagui/native/dist/esm/setup-gesture-handler.native.js:38  g.__tamagui_sheet_gesture_state__ = {
@tamagui/native/dist/cjs/setup-gesture-handler.cjs:66        g.__tamagui_sheet_gesture_state__ = {
@tamagui/native/dist/cjs/setup-gesture-handler.native.js:68  g.__tamagui_sheet_gesture_state__ = {
```

4. The Sheet reads the main state, not the sheet global - `@tamagui/sheet/src/gestureState.ts:11-12`:

```ts
export function isGestureHandlerEnabled(): boolean {
  return getGestureHandler().isEnabled; // main state, set from pressEvents
}
```

`getGestureHandler().isEnabled` returns the main `enabled` - `@tamagui/native/src/gestureState.ts:196-198`.

5. All three Sheet RNGH gates call `isGestureHandlerEnabled()`, so they all follow `pressEvents`:

- `@tamagui/sheet/src/useGestureHandlerPan.tsx:70` - `const gestureHandlerEnabled = isGestureHandlerEnabled()` (returns no pan when false, so the Sheet uses the `PanResponder` fallback)
- `@tamagui/sheet/src/SheetScrollView.tsx:95` - `const useRNGHScrollView = isGestureHandlerEnabled() && ...`
- `@tamagui/sheet/src/GestureDetectorWrapper.tsx:21` - `const enabled = isGestureHandlerEnabled()`

`@tamagui/sheet/src/gestureState.ts` is a backward-compat re-export of `@tamagui/native`'s state (per its own header comment), and its `isGestureHandlerEnabled()` reads `getGestureHandler().isEnabled`, not the `__tamagui_sheet_gesture_state__` global. So the `sheet` value that `setupGestureHandler` writes to that global is never read.

## Suggested fix (direction only)

Make the Sheet's gate use the `sheet` value instead of the press value. The main `set()` already registers `Gesture`, `GestureDetector` and `RootView` even when `enabled` is `false` (lines 70-76), so the Sheet can use RNGH on its own. Two options:

- Have the Sheet's `isGestureHandlerEnabled()` (and the three gates) read `getGestureHandlerConfig().sheet` from `@tamagui/native/setup-gesture-handler`, instead of `getGestureHandler().isEnabled`; or
- Add a separate `sheetEnabled` value on `getGestureHandler()` from the `sheet` flag, and point the three gates at it.

Either one keeps presses controlled by `pressEvents` and lets `sheet` control the Sheet on its own, which is the documented behavior. The dead `__tamagui_sheet_gesture_state__` write can then be removed or wired up.
