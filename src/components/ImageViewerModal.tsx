import React, { useState, useCallback, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  Tracking,
  Radius,
} from "@/constants/theme";

interface ImageViewerModalProps {
  visible: boolean;
  onClose: () => void;
  imageUrl: string;
  hdUrl?: string | null;
  title: string;
  date?: string;
  copyright?: string | null;
}

const MIN_SCALE = 1.0;
const MAX_SCALE = 4.0;

/**
 * Full-screen interactive APOD image viewer (§17.2).
 *
 * Pitch black ground (#000000) for maximum astronomical contrast.
 * Gestures:
 * - Pinch to zoom (1x to 4x).
 * - Pan to move around while zoomed in.
 * - Swipe down while unzoomed (1x) to dismiss.
 * - Double-tap toggles between 1x and 2.5x zoom.
 * - Single-tap toggles overlay chrome.
 *
 * Memory safety:
 * Only ONE hdurl image is ever mounted in memory, solely while this modal is visible.
 * Closing unmounts it immediately.
 */
export function ImageViewerModal({
  visible,
  onClose,
  imageUrl,
  hdUrl,
  title,
  date,
  copyright,
}: ImageViewerModalProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [showChrome, setShowChrome] = useState(true);

  // Transformations
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetTransform = useCallback(() => {
    "worklet";
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  const handleDismiss = useCallback(() => {
    resetTransform();
    onClose();
  }, [resetTransform, onClose]);

  const toggleChrome = useCallback(() => {
    setShowChrome((v) => !v);
  }, []);

  // Pinch gesture
  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const nextScale = savedScale.value * e.scale;
      scale.value = Math.min(Math.max(nextScale, 0.8), MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value < MIN_SCALE) {
        scale.value = withSpring(MIN_SCALE);
        savedScale.value = MIN_SCALE;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  // Pan gesture
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1.05) {
        // Pan image when zoomed in
        const maxTx = (width * (scale.value - 1)) / 2;
        const maxTy = (height * (scale.value - 1)) / 2;
        const nextX = savedTranslateX.value + e.translationX;
        const nextY = savedTranslateY.value + e.translationY;
        translateX.value = Math.min(Math.max(nextX, -maxTx), maxTx);
        translateY.value = Math.min(Math.max(nextY, -maxTy), maxTy);
      } else {
        // At 1x, pull down to dismiss
        if (e.translationY > 0) {
          translateY.value = e.translationY;
        }
      }
    })
    .onEnd((e) => {
      if (scale.value <= 1.05) {
        if (e.translationY > 120 || e.velocityY > 600) {
          runOnJS(handleDismiss)();
        } else {
          translateY.value = withSpring(0);
        }
      } else {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
    });

  // Double tap to toggle 1x <-> 2.5x
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1.2) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
        // Center zoom around tap location
        const targetX = (width / 2 - e.x) * 1.5;
        const targetY = (height / 2 - e.y) * 1.5;
        translateX.value = withTiming(targetX);
        translateY.value = withTiming(targetY);
        savedTranslateX.value = targetX;
        savedTranslateY.value = targetY;
      }
    });

  // Single tap toggles chrome
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      runOnJS(toggleChrome)();
    });

  const gesture = Gesture.Exclusive(doubleTap, singleTap, Gesture.Simultaneous(pinch, pan));

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const hasHd = Boolean(hdUrl && hdUrl !== imageUrl);
  const [isHdLoaded, setIsHdLoaded] = useState(false);

  useEffect(() => {
    if (visible) {
      setIsHdLoaded(false);
    }
  }, [visible, hdUrl]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.space} />
      <View style={styles.root}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.canvas, animatedImageStyle]}>
            {/* Low-res thumbnail opens instantaneously from cache with zero blank screen */}
            <Image
              source={{ uri: imageUrl }}
              style={{ width, height, position: "absolute" }}
              contentFit="contain"
              accessibilityLabel={title}
            />

            {/* Hi-res image loaded progressively over thumbnail and faded in once decoded */}
            {hasHd && (
              <Image
                source={{ uri: hdUrl! }}
                style={{
                  width,
                  height,
                  position: "absolute",
                  opacity: isHdLoaded ? 1 : 0,
                }}
                contentFit="contain"
                transition={300}
                onLoad={() => setIsHdLoaded(true)}
                onError={() => setIsHdLoaded(false)}
                accessibilityLabel={title}
              />
            )}
          </Animated.View>
        </GestureDetector>

        {/* Loading badge while hi-res image downloads and decodes */}
        {hasHd && !isHdLoaded && (
          <View
            style={[
              styles.loaderBadge,
              { bottom: insets.bottom + (copyright ? Spacing.xl + Spacing.sm : Spacing.xl) },
            ]}
            pointerEvents="none"
          >
            <ActivityIndicator size="small" color={Colors.signalOnPlate} />
            <Text style={styles.loaderText}>Loading full size</Text>
          </View>
        )}

        {showChrome && (
          <>
            {/* Masthead overlay */}
            <View
              style={[
                styles.headerOverlay,
                { paddingTop: insets.top + Spacing.sm },
              ]}
              pointerEvents="box-none"
            >
              <View style={styles.headerRow}>
                <View style={styles.headerInfo}>
                  {date && <Text style={styles.metaDate}>{date}</Text>}
                  <Text style={styles.metaTitle}>{title}</Text>
                </View>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={handleDismiss}
                  accessibilityRole="button"
                  accessibilityLabel="Close image viewer"
                >
                  <Text style={styles.closeText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Footer overlay */}
            {copyright && (
              <View
                style={[
                  styles.footerOverlay,
                  { paddingBottom: insets.bottom + Spacing.sm },
                ]}
                pointerEvents="none"
              >
                <Text style={styles.copyrightText}>© {copyright}</Text>
              </View>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.space,
  },
  canvas: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.page,
    paddingBottom: Spacing.md,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  headerInfo: {
    flex: 1,
  },
  metaDate: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.micro,
    color: Colors.plateMuted,
    letterSpacing: Tracking.label,
    marginBottom: 4,
  },
  metaTitle: {
    fontFamily: FontFamily.serifMedium,
    fontSize: FontSize.lead,
    color: Colors.plateInk,
    lineHeight: 24,
  },
  closeButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.plateRule,
  },
  closeText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.plateInk,
  },
  footerOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.page,
    paddingTop: Spacing.sm,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    alignItems: "center",
  },
  copyrightText: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.micro,
    color: Colors.plateMuted,
    letterSpacing: 0.5,
  },
  loaderBadge: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.plate,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.plateRule,
  },
  loaderText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.plateInk,
  },
});

