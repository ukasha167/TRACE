import { useEffect } from "react";
import { StatusBar, type StatusBarStyle } from "react-native";

/**
 * ONE OWNER FOR THE STATUS BAR'S GLYPHS. DECISIONS 68.
 *
 * Two mechanisms used to share them and the later write won. The root layout
 * mounted a <StatusBar barStyle="dark-content">, and React Native re-applies the
 * merged <StatusBar> props a frame after ANY <StatusBar> mounts or unmounts
 * (StatusBar.js, _updatePropsStack). Home set light glyphs over its black plate
 * by calling StatusBar.setBarStyle directly. Closing the sky unmounted the
 * sky's <StatusBar>, the stack re-applied the root's dark glyphs after Home had
 * set light ones, and the clock went black on black. Opening the sky raced the
 * same way against Home's blur, which set dark glyphs.
 *
 * Now nothing mounts a <StatusBar>. A screen states its style when it gains
 * focus, nothing writes on blur, and an overlay over everything (the reveal,
 * the picture viewer) holds light glyphs while it is up, whatever screen
 * gains focus underneath it.
 *
 * Android ignores the bar's colour while the app is edge-to-edge (RN's
 * StatusBarModule.kt), so the glyphs are the only thing to choose.
 */

let screenStyle: StatusBarStyle = "dark-content";
let overlays = 0;

function apply() {
  StatusBar.setBarStyle(overlays > 0 ? "light-content" : screenStyle, true);
}

/** The focused screen's glyphs. Call it on focus, never on blur. */
export function setScreenBarStyle(style: StatusBarStyle) {
  screenStyle = style;
  apply();
}

/** Light glyphs for as long as a dark overlay is shown. */
export function useLightBarWhile(shown: boolean) {
  useEffect(() => {
    if (!shown) return;
    overlays += 1;
    apply();
    return () => {
      overlays -= 1;
      apply();
    };
  }, [shown]);
}
