import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  Platform,
  type LayoutChangeEvent,
} from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useAnimatedReaction,
  useSharedValue,
  interpolate,
  runOnJS,
  Extrapolation,
} from "react-native-reanimated";
import { Colors, Spacing, Type, FontFamily, FontSize, Radius } from "@/constants/theme";
import { useMilestonesStore } from "@/store/useMilestonesStore";
import { MilestoneListRow } from "@/components/MilestoneListRow";
import { TonightHero } from "@/components/TonightHero";
import { Arrive } from "@/components/Arrive";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";

const route = (path: string) => path as Href;

/**
 * HOME. The dark hero, then the record ledger on paper.
 *
 * The page opens on tonight's sky because the app is about now as much as then;
 * the records underneath are what makes now mean something. The hero bleeds to
 * both screen edges and runs under the status bar, so the paper below reads as
 * a page tucked beneath a plate rather than as a second card.
 *
 * THE SCRIM. Because the hero scrolls, its kicker line would otherwise slide up
 * behind the clock and collide with it. A fixed strip the height of the top
 * inset sits above everything: plate-coloured while any part of the hero is
 * behind it, fading to paper once the list has taken over. The status bar
 * glyphs flip with it, so the clock stays legible against whatever it sits on.
 * This is the one piece of scroll-linked motion in the app.
 *
 * Rows arrive staggered down the page. Nothing else on this screen moves.
 */
export default function HomeScreen() {
  const milestones = useMilestonesStore((s) => s.milestones);
  const { location } = useCurrentLocation();
  const insets = useSafeAreaInsets();
  const isEmpty = milestones.length === 0;

  const scrollY = useSharedValue(0);
  const [heroHeight, setHeroHeight] = useState(0);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const onHeroLayout = useCallback((e: LayoutChangeEvent) => {
    setHeroHeight(e.nativeEvent.layout.height);
  }, []);

  // The hero's bottom edge reaches the scrim once everything but the inset
  // itself has scrolled past.
  const crossover = Math.max(1, heroHeight - insets.top);

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [crossover - 24, crossover],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  const setBarLight = useCallback((light: boolean) => {
    StatusBar.setBarStyle(light ? "light-content" : "dark-content", true);
    if (Platform.OS === "android") {
      StatusBar.setBackgroundColor(light ? Colors.plate : Colors.paper, true);
    }
  }, []);

  useAnimatedReaction(
    () => scrollY.value < crossover - 12,
    (overPlate, previous) => {
      if (previous !== null && overPlate !== previous) {
        runOnJS(setBarLight)(overPlate);
      }
    },
    [crossover]
  );

  // Home is the only screen whose top is a dark plate. Setting the bar style on
  // focus rather than at mount matters: Home stays mounted underneath every
  // pushed screen, so a plain <StatusBar> here would leave white glyphs sitting
  // on the paper screens above it.
  useFocusEffect(
    useCallback(() => {
      setBarLight(scrollY.value < crossover - 12);
      return () => {
        StatusBar.setBarStyle("dark-content", true);
        if (Platform.OS === "android") {
          StatusBar.setBackgroundColor(Colors.paper, true);
        }
      };
    }, [setBarLight, crossover, scrollY])
  );

  return (
    <View style={styles.root}>
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View onLayout={onHeroLayout}>
          <TonightHero
            milestones={milestones}
            location={location}
            topInset={insets.top}
          />
        </View>

        <View style={styles.page}>
          {isEmpty ? (
            <Arrive delay={200}>
              <Text style={styles.emptyHeadline}>Nothing recorded yet.</Text>
              <Text style={styles.emptyBody}>
                Add a date that matters and TRACE works out the moon that hung
                over it, how uncommon that sky was, and the years it comes back.
              </Text>
            </Arrive>
          ) : (
            <>
              <Arrive delay={160}>
                <View style={styles.listHead}>
                  <Text style={styles.listLabel}>Your skies</Text>
                  <Text style={styles.listCount}>{milestones.length}</Text>
                </View>
              </Arrive>

              {milestones.map((milestone, index) => (
                <Arrive key={milestone.id} index={index} delay={220}>
                  <MilestoneListRow
                    milestone={milestone}
                    isLast={index === milestones.length - 1}
                  />
                </Arrive>
              ))}
            </>
          )}

          <Pressable
            style={styles.settingsLink}
            accessibilityRole="button"
            onPress={() => router.push(route("/settings"))}
          >
            <Text style={styles.settingsText}>Settings</Text>
          </Pressable>
        </View>
      </Animated.ScrollView>

      {/* Status-bar scrim: paper underneath, plate on top while the hero sits
          behind it. Never intercepts touches. */}
      <View
        style={[styles.scrim, { height: insets.top }]}
        pointerEvents="none"
        accessibilityElementsHidden
      >
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.scrimPlate, scrimStyle]}
        />
      </View>

      <View style={[styles.addWrap, { paddingBottom: insets.bottom || Spacing.md }]}>
        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && styles.addPressed]}
          accessibilityRole="button"
          accessibilityLabel="Add a new record"
          onPress={() => router.push(route("/milestone/new"))}
        >
          <Text style={styles.addText}>Add a date</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.paper },
  // The hero is flush to the top and sides; only the paper below gets margins.
  content: { paddingBottom: Spacing.xxl + Spacing.xl },
  page: { paddingHorizontal: Spacing.page },

  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.paper,
  },
  scrimPlate: { backgroundColor: Colors.plate },

  listHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  listLabel: { ...Type.label },
  listCount: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    color: Colors.inkMuted,
  },

  emptyHeadline: { ...Type.title, marginTop: Spacing.xl },
  emptyBody: { ...Type.bodyMuted, marginTop: Spacing.md, maxWidth: 380 },

  settingsLink: { alignSelf: "flex-start", paddingVertical: Spacing.lg },
  settingsText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.inkMuted,
  },

  // A pill floating over the page rather than an ink bar welded to the bottom.
  // The bar read as a toolbar; the record list is not a tool.
  addWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.page,
    paddingTop: Spacing.sm,
    backgroundColor: Colors.paper,
  },
  addButton: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  addPressed: { opacity: 0.8 },
  addText: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.body,
    color: Colors.paper,
  },
});
