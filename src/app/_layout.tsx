import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
} from "@expo-google-fonts/figtree";
import {
  Newsreader_400Regular,
  Newsreader_500Medium,
} from "@expo-google-fonts/newsreader";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from "@expo-google-fonts/jetbrains-mono";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { useReducedMotion } from "react-native-reanimated";
import { useEffect, useState } from "react";
import { Platform, type StatusBarStyle } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Colors, FontFamily, FontSize } from "@/constants/theme";
import { preloadMoonTextures } from "@/components/moon/moonTextures";
import { useReminderSync, useReminderTaps } from "@/hooks/useReminders";
import { RevealHost } from "@/components/Reveal";
import { setScreenBarStyle } from "@/hooks/statusBar";

SplashScreen.preventAutoHideAsync();

// Decode the moon's maps while the fonts load, so the hero has them waiting.
const moonTexturesLoaded = preloadMoonTextures();
/** The splash waits this long for the moon's maps at most, then shows Home anyway. */
const TEXTURE_WAIT_MS = 1000;

/**
 * Headers stay near-silent: paper ground, the screen's name set small in the
 * serif, no rule beneath. The page's own type carries the title, so the chrome
 * should not compete with it.
 *
 * Titles are sentence case. The old build set them as MONO CAPS, which is
 * exactly the voice this direction moves away from.
 */
const HEADER_TITLE = {
  fontFamily: FontFamily.serifMedium,
  fontSize: FontSize.lead,
  color: Colors.ink,
} as const;

/** The routes the stack presents as sheets. */
const SHEETS = new Set(["settings", "milestone/new", "milestone/edit/[id]", "export/[id]"]);

/**
 * The glyphs each screen wants, set as it gains focus (hooks/statusBar.ts).
 * Home is left out: it changes them as its black plate scrolls away, so it
 * sets its own. On iOS a sheet sits on black with the page behind it shrunk
 * below the bar, so a sheet takes light glyphs there; on Android a sheet is a
 * full paper screen.
 */
function barStyleFor(route: string): StatusBarStyle | null {
  if (route === "index") return null;
  if (route === "sky/[id]") return "light-content";
  if (Platform.OS === "ios" && SHEETS.has(route)) return "light-content";
  return "dark-content";
}

export default function RootLayout() {
  const reduced = useReducedMotion();
  // Keeps each record's anniversary notifications in step with the records.
  useReminderSync();

  // Only the seven weights the screens set. The splash waits on every file in
  // this list, and five more used to sit in it that no screen drew with.
  const [fontsLoaded, fontError] = useFonts({
    [FontFamily.serif]: Newsreader_400Regular,
    [FontFamily.serifMedium]: Newsreader_500Medium,
    [FontFamily.regular]: Figtree_400Regular,
    [FontFamily.medium]: Figtree_500Medium,
    [FontFamily.semibold]: Figtree_600SemiBold,
    [FontFamily.mono]: JetBrainsMono_400Regular,
    [FontFamily.monoMedium]: JetBrainsMono_500Medium,
  });

  // The hero's moon showed a frame or two without its maps, so the splash holds
  // for them too.
  const [texturesReady, setTexturesReady] = useState(false);
  useEffect(() => {
    const done = () => setTexturesReady(true);
    moonTexturesLoaded.then(done);
    const cap = setTimeout(done, TEXTURE_WAIT_MS);
    return () => clearTimeout(cap);
  }, []);

  const ready = (fontsLoaded || !!fontError) && texturesReady;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Nothing renders in a fallback face and then pops.
  if (!ready) return null;

  return (
    // GestureHandlerRootView must wrap the whole app, or any GestureDetector
    // below it throws at render time (the immersive sky view uses one).
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.paper }}>
      <Stack
        screenListeners={({ route }) => ({
          focus: () => {
            const style = barStyleFor(route.name);
            if (style) setScreenBarStyle(style);
          },
        })}
        screenOptions={{
          headerStyle: { backgroundColor: Colors.paper },
          headerTintColor: Colors.ink,
          headerTitleStyle: HEADER_TITLE,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: Colors.paper },
          animation: reduced ? "fade" : "slide_from_right",
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="settings"
          options={{ title: "Settings", presentation: "modal" }}
        />
        <Stack.Screen
          name="milestone/new"
          options={{ title: "Add a date", presentation: "modal" }}
        />
        <Stack.Screen
          name="milestone/edit/[id]"
          options={{ title: "Edit date", presentation: "modal" }}
        />
        <Stack.Screen name="milestone/[id]" options={{ title: "" }} />
        <Stack.Screen name="ledger/[id]" options={{ title: "" }} />
        <Stack.Screen
          name="sky/[id]"
          // A moon carried in from the page draws its own entrance, so the
          // stack must not fade over it. Set here because options the screen
          // sets on itself land after the push has already started.
          options={({ route }) => ({
            headerShown: false,
            animation:
              !reduced && (route.params as { focus?: string } | undefined)?.focus === "moon"
                ? "none"
                : "fade",
            contentStyle: { backgroundColor: Colors.space },
          })}
        />
        <Stack.Screen
          name="export/[id]"
          options={{ title: "Share", presentation: "modal" }}
        />
      </Stack>
      {/* After the stack, so the reveal paints over every screen and header. */}
      <RevealHost />
      <ReminderTaps />
    </GestureHandlerRootView>
  );
}

/** Rendered after the stack, so a reminder tap has a navigator to push onto. */
function ReminderTaps() {
  useReminderTaps();
  return null;
}
