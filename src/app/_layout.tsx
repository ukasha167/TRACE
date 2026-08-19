import {
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from "@expo-google-fonts/fraunces";
import {
  Manrope_300Light,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from "@expo-google-fonts/manrope";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from "@expo-google-fonts/jetbrains-mono";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { useEffect } from "react";
import { StatusBar, View } from "react-native";
import { Colors, FontFamily } from "@/constants/theme";

// Prevent auto-hide until fonts are loaded
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [FontFamily.display]: Fraunces_400Regular,
    [FontFamily.displayItalic]: Fraunces_400Regular_Italic,
    [FontFamily.displaySemiBold]: Fraunces_600SemiBold,
    [FontFamily.displayBold]: Fraunces_700Bold,
    [FontFamily.sansLight]: Manrope_300Light,
    [FontFamily.sans]: Manrope_400Regular,
    [FontFamily.sansMedium]: Manrope_500Medium,
    [FontFamily.sansSemiBold]: Manrope_600SemiBold,
    [FontFamily.sansBold]: Manrope_700Bold,
    [FontFamily.mono]: JetBrainsMono_400Regular,
    [FontFamily.monoMedium]: JetBrainsMono_500Medium,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Don't render anything until fonts are ready — prevents flash of system font
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.blueprint }}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.blueprint} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.blueprint },
          headerTintColor: Colors.starlight,
          headerTitleStyle: {
            fontFamily: FontFamily.displaySemiBold,
            fontSize: 18,
            color: Colors.starlight,
          },
          headerShadowVisible: false,
          // Show only the chevron — no "Back" / screen name text anywhere in the app
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: Colors.blueprint },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: "Cosmic Milestones",
            headerTitleStyle: {
              fontFamily: FontFamily.displaySemiBold,
              fontSize: 20,
              color: Colors.starlight,
            },
          }}
        />
        <Stack.Screen
          name="age-converter"
          options={{
            title: "Planetary Ages",
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            title: "Settings",
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="milestone/new"
          options={{
            title: "New Milestone",
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="milestone/[id]"
          options={{
            title: "",
            headerStyle: { backgroundColor: Colors.blueprint },
            headerShadowVisible: false,
            headerTintColor: Colors.starlight,
          }}
        />
        <Stack.Screen
          name="export/[id]"
          options={{
            title: "Export Card",
            presentation: "modal",
          }}
        />
      </Stack>
    </View>
  );
}
