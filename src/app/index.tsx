import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
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
import {
  useMilestonesStore,
  useMilestonesHydrated,
} from "@/store/useMilestonesStore";
import { MilestoneListRow } from "@/components/MilestoneListRow";
import { TonightHero } from "@/components/TonightHero";
import { Arrive } from "@/components/Arrive";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import { setScreenBarStyle } from "@/hooks/statusBar";
import { anniversaryDate, countdownLabel } from "@/lib/astronomy/anniversary";
import { clampMoonDay } from "@/lib/astronomy/moonCarousel";
import { todayDateString } from "@/lib/astronomy/dateUtils";

const route = (path: string) => path as Href;

/** The first-run starts. Each opens the form with its type chosen. */
const STARTS = [
  { type: "birthday", title: "A birthday", body: "Yours, or someone else's." },
  { type: "anniversary", title: "An anniversary", body: "The night two lives joined up." },
  { type: "custom", title: "A day to remember", body: "A first night somewhere, a last one, anything." },
] as const;

/**
 * HOME. Two things: the moon, then your dates on paper.
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
  const hydrated = useMilestonesHydrated();
  const { location, isDefault, permission, locating, request: requestLocation } = useCurrentLocation();
  const insets = useSafeAreaInsets();
  const isEmpty = milestones.length === 0;
  const [offsetDays, setOffsetDays] = useState(0);
  const today = todayDateString();

  // Soonest first. The list used to be in the order records were added, which
  // is a fact about the app, not about anybody's year. Sorting needs only the
  // dates; the moon is worked out for the one record the card shows.
  const upcoming = useMemo(
    () =>
      milestones
        .map((m) => ({ milestone: m, next: anniversaryDate(m, today) }))
        .sort((a, b) => a.next.daysLeft - b.next.daysLeft),
    [milestones, today]
  );

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

  /**
   * Whether the hero is still under the status bar, mirrored on the JS side.
   *
   * The focus effect below used to ask the shared value directly
   * (`scrollY.value < crossover - 12`). That is a shared value read on the JS
   * thread, and with the React Compiler enabled it lands inside a render pass:
   * two Reanimated strict-mode warnings on every launch, bisected to that one
   * line and confirmed by putting it back. The reaction underneath already
   * evaluates the same predicate on the UI thread, so the answer is recorded
   * here as it goes past rather than asked for after the fact.
   *
   * It starts true because the page starts at the top, which is over the plate.
   */
  const overPlate = useRef(true);

  // Whether Home is the focused screen. Momentum can carry the page across
  // the plate after a screen has been pushed over it, and that screen's glyphs
  // are its own.
  const focused = useRef(false);
  const setBarLight = useCallback((light: boolean) => {
    overPlate.current = light;
    if (focused.current) setScreenBarStyle(light ? "light-content" : "dark-content");
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

  // Home is the only screen whose top is a dark plate, so it sets its own
  // glyphs on focus. It writes nothing on blur: the screen gaining focus sets
  // its own, and a blur that landed after that focus is what turned the sky's
  // clock black (hooks/statusBar.ts).
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setBarLight(overPlate.current);
      return () => {
        focused.current = false;
      };
    }, [setBarLight])
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
            offsetDays={offsetDays}
            onChangeOffset={(days) => setOffsetDays(clampMoonDay(days))}
            onSaveDate={(date) => router.push(route(`/milestone/new?date=${date}`))}
            milestones={milestones}
            location={location}
            placeIsDefault={isDefault}
            locationDenied={permission === "denied"}
            locating={locating}
            onRequestLocation={requestLocation}
            topInset={insets.top}
          />
        </View>

        <View style={styles.page}>
          {/* Nothing until storage answers. Branching on an empty array before
              then told people with records that they had none. */}
          {!hydrated ? null : isEmpty ? (
            <Arrive delay={200}>
              <Text style={styles.emptyHeadline}>Whose night should we find first?</Text>
              <Text style={styles.emptyBody}>
                Pick a date to see its moon and when that moon returns.
              </Text>
              <View style={styles.starts}>
                {STARTS.map((s) => (
                  <Pressable
                    key={s.type}
                    onPress={() => router.push(route(`/milestone/new?type=${s.type}`))}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.start, pressed && styles.addPressed]}
                  >
                    <Text style={styles.startTitle}>{s.title}</Text>
                    <Text style={styles.startBody}>{s.body}</Text>
                  </Pressable>
                ))}
              </View>
            </Arrive>
          ) : (
            <>
              <Arrive delay={160}>
                <View style={styles.listHead}>
                  <Text style={styles.listLabel}>Your dates</Text>
                  <Text style={styles.listCount}>{milestones.length}</Text>
                </View>
              </Arrive>

              {upcoming.map(({ milestone, next }, index) => (
                <Arrive key={milestone.id} index={index} delay={220}>
                  <MilestoneListRow
                    milestone={milestone}
                    isLast={index === upcoming.length - 1}
                    countdown={countdownLabel(next.daysLeft)}
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
          accessibilityLabel="Add a new date"
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
  scrimPlate: { backgroundColor: Colors.space },

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
  starts: { gap: Spacing.sm + 2, marginTop: Spacing.lg },
  start: {
    backgroundColor: Colors.paperDim,
    borderRadius: Radius.plate,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md + 2,
    gap: 2,
  },
  startTitle: { ...Type.heading },
  startBody: { ...Type.small },

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
