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
import { useEffect } from "react";
import { StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Colors, FontFamily, FontSize } from "@/constants/theme";
import { preloadMoonTextures } from "@/components/moon/moonTextures";
import { useReminderSync, useReminderTaps } from "@/hooks/useReminders";
import { RevealHost } from "@/components/Reveal";

SplashScreen.preventAutoHideAsync();

// Decode the moon's maps while the fonts load, so the hero has them waiting.
preloadMoonTextures();

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

export default function RootLayout() {
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

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // Nothing renders in a fallback face and then pops.
  if (!fontsLoaded && !fontError) return null;

  return (
    // GestureHandlerRootView must wrap the whole app, or any GestureDetector
    // below it throws at render time (the immersive sky view uses one).
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.paper }}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.paper} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.paper },
          headerTintColor: Colors.ink,
          headerTitleStyle: HEADER_TITLE,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: Colors.paper },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="settings"
          options={{ title: "Settings", presentation: "modal" }}
        />
        <Stack.Screen
          name="milestone/new"
          options={{ title: "New record", presentation: "modal" }}
        />
        <Stack.Screen
          name="milestone/edit/[id]"
          options={{ title: "Edit record", presentation: "modal" }}
        />
        <Stack.Screen name="milestone/[id]" options={{ title: "" }} />
        <Stack.Screen name="ledger/[id]" options={{ title: "" }} />
        <Stack.Screen
          name="sky/[id]"
          options={{ headerShown: false, animation: "fade" }}
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
