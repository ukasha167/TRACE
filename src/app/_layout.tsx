import {
  Archivo_300Light,
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_900Black,
} from "@expo-google-fonts/archivo";
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
import { Colors, FontFamily, FontSize, Tracking } from "@/constants/theme";

SplashScreen.preventAutoHideAsync();

/**
 * Headers are near-silent: paper ground, a small uppercase mono label, a
 * hairline rule underneath. The page's own display type carries the title, so
 * the chrome shouldn't compete with it.
 */
const HEADER_TITLE = {
  fontFamily: FontFamily.monoMedium,
  fontSize: FontSize.label,
  letterSpacing: Tracking.label,
  color: Colors.ink,
} as const;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [FontFamily.thin]: Archivo_300Light,
    [FontFamily.regular]: Archivo_400Regular,
    [FontFamily.medium]: Archivo_500Medium,
    [FontFamily.semibold]: Archivo_600SemiBold,
    [FontFamily.bold]: Archivo_700Bold,
    [FontFamily.black]: Archivo_900Black,
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
          options={{ title: "SETTINGS", presentation: "modal" }}
        />
        <Stack.Screen
          name="milestone/new"
          options={{ title: "NEW RECORD", presentation: "modal" }}
        />
        <Stack.Screen
          name="milestone/edit/[id]"
          options={{ title: "EDIT RECORD", presentation: "modal" }}
        />
        <Stack.Screen name="milestone/[id]" options={{ title: "" }} />
        <Stack.Screen name="ledger/[id]" options={{ title: "" }} />
        <Stack.Screen
          name="sky/[id]"
          options={{ headerShown: false, animation: "fade" }}
        />
        <Stack.Screen
          name="export/[id]"
          options={{ title: "EXPORT", presentation: "modal" }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
