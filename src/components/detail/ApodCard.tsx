import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import {
  Colors,
  Spacing,
  Type,
  FontFamily,
  FontSize,
  Radius,
} from "@/constants/theme";
import { SectionHeader } from "./SectionHeader";
import { ImageViewerModal } from "@/components/ImageViewerModal";
import type { ApodCacheEntry } from "@/types";
import type { ApodFetchError } from "@/lib/apod/apodClient";

/**
 * APOD, DEMOTED (spec §8.3).
 *
 * No longer the hero — the sky over the user's own place and date is, because
 * that is the one thing a global feed can never be. This sits below as "what
 * the world was looking at", which is also the only honest description of APOD:
 * it publishes a FEATURED image, not one captured that day.
 *
 * Because the hero above is local computation, every failure state here still
 * leaves a complete screen.
 *
 * Explanation text is never truncated. It runs as long as it runs.
 */

interface Props {
  status: "idle" | "loading" | "success" | "video" | "error";
  data: ApodCacheEntry | null;
  error: ApodFetchError | null;
  onRetry: () => void;
}

const ERROR_COPY: Record<
  ApodFetchError["kind"],
  { title: string; body: string }
> = {
  not_found: {
    title: "No image for this date",
    body: "NASA's archive begins 16 June 1995 and has occasional gaps.",
  },
  rate_limit: {
    title: "Rate limit reached",
    body: "DEMO_KEY allows 30 requests an hour. Add your own key in Settings.",
  },
  network: {
    title: "No connection",
    body: "This loads next time you're online. Nothing else on this page needs it.",
  },
  server_error: {
    title: "NASA API error",
    body: "Something went wrong on NASA's end. Try again in a moment.",
  },
};

export function ApodCard({ status, data, error, onRetry }: Props) {
  // Non-photographic days are collapsed by default — see renderBody().
  const [revealed, setRevealed] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);

  return (
    <View style={styles.section}>
      <SectionHeader label="What the world was looking at" />
      <Text style={styles.explainer}>
        NASA's Astronomy Picture of the Day. This is the image NASA featured
        on this date, not one taken on it.
      </Text>
      {renderBody()}
    </View>
  );

  function renderBody() {
    if (status === "idle" || status === "loading") {
      return (
        <View style={styles.notice}>
          <ActivityIndicator size="small" color={Colors.inkMuted} />
          <Text style={styles.noticeBody}>Loading</Text>
        </View>
      );
    }

    if (status === "error" && error) {
      const copy = ERROR_COPY[error.kind];
      return (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{copy.title}</Text>
          <Text style={styles.noticeBody}>{copy.body}</Text>
          {error.kind !== "not_found" && (
            <TouchableOpacity
              style={styles.retry}
              onPress={onRetry}
              accessibilityRole="button"
              accessibilityLabel="Retry loading the NASA image"
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (!data) return null;

    // Video and diagram days get labelled, never stretched into an image frame.
    const nonPhoto =
      status === "video" || data.kind === "video" || data.kind === "illustrative";

    if (nonPhoto) {
      const isDiagram = data.kind === "illustrative";
      const tag = isDiagram ? "A diagram, not a photograph" : "A video";

      // Collapsed by default. On these days NASA did not publish a picture of
      // the sky, so there is nothing to look at — the entry is a note, and a
      // note belongs behind a tap rather than dumped into the page.
      //
      // This is NOT truncation: opening it shows the title and the complete
      // explanation, uncut. Nothing is hidden from a reader who wants it.
      return (
        <View style={styles.notice}>
          <Text style={styles.kindTag}>{tag}</Text>
          {revealed ? (
            <>
              <Text style={styles.title}>{data.title}</Text>
              <Text style={styles.explanation}>{data.explanation}</Text>
            </>
          ) : (
            <>
              <Text style={styles.noticeBody}>
                {isDiagram
                  ? "NASA featured a diagram on this date rather than a photograph of the sky."
                  : "NASA featured a video on this date."}
              </Text>
              <TouchableOpacity
                style={styles.reveal}
                onPress={() => setRevealed(true)}
                accessibilityRole="button"
                accessibilityLabel="Show NASA's note for this date"
              >
                <Text style={styles.revealText}>Show NASA&apos;s note</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      );
    }

    return (
      <View>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setViewerVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={`Open full screen image: ${data.title}`}
        >
          <Image
            source={{ uri: data.url }}
            style={styles.image}
            contentFit="cover"
            transition={300}
            accessibilityLabel={data.title}
          />
        </TouchableOpacity>
        <View style={styles.credit}>
          <Text style={styles.title}>{data.title}</Text>
          {data.copyright && (
            <Text style={styles.copyright}>© {data.copyright}</Text>
          )}
        </View>
        <Text style={styles.explanation}>{data.explanation}</Text>

        <ImageViewerModal
          visible={viewerVisible}
          onClose={() => setViewerVisible(false)}
          imageUrl={data.url}
          hdUrl={data.hdurl}
          title={data.title}
          date={data.date}
          copyright={data.copyright}
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  section: { marginBottom: Spacing.xl },
  explainer: { ...Type.small, marginBottom: Spacing.md },
  image: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: Colors.plate,
    borderRadius: Radius.plate,
  },
  credit: {
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
    marginTop: Spacing.sm,
  },
  title: {
    fontFamily: FontFamily.serifMedium,
    fontSize: FontSize.lead,
    lineHeight: 26,
    color: Colors.ink,
  },
  copyright: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    color: Colors.inkMuted,
    marginTop: 2,
  },
  explanation: { ...Type.bodyMuted, marginTop: Spacing.md },
  notice: {
    backgroundColor: Colors.paperDim,
    borderRadius: Radius.plate,
    padding: Spacing.md,
    gap: Spacing.sm,
    alignItems: "flex-start",
  },
  kindTag: { ...Type.label, color: Colors.signal },
  noticeTitle: {
    fontFamily: FontFamily.serifMedium,
    fontSize: FontSize.lead,
    color: Colors.ink,
  },
  noticeBody: { ...Type.small },
  reveal: {
    marginTop: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  revealText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.ink,
  },
  retry: {
    marginTop: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    backgroundColor: Colors.ink,
  },
  retryText: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.small,
    color: Colors.paper,
  },
});
