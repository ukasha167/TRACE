import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Colors, Spacing, Type, FontFamily, FontSize } from "@/constants/theme";
import { MoonPhaseGlyph } from "./MoonPhaseGlyph";
import { formatIllumination, describePhase } from "@/lib/astronomy/moonPhase";
import type { LedgerYear } from "@/lib/astronomy/lifeLedger";
import type { ApodCacheEntry } from "@/types";

interface LedgerRowProps {
  row: LedgerYear;
  apod: ApodCacheEntry | null;
  isLast: boolean;
}

/**
 * One year of a life, set as a timetable row rather than a card.
 *
 * The moon is drawn at its real phase and, where a location is known, its real
 * tilt — so the column reads as a record of actual skies, not a strip of icons.
 * Return years carry a signal-red rule down their left edge, which is the only
 * place colour appears in the list.
 *
 * Thumbnails are allowed to be absent: rows come from local computation and
 * paint instantly, while APOD images land later and must never hold a row back.
 * No text is truncated.
 */
export function LedgerRow({ row, apod, isLast }: LedgerRowProps) {
  const showThumb = apod?.kind === "photograph";

  return (
    <View style={[styles.row, !isLast && styles.rowRule]}>
      <View style={[styles.marker, row.isReturn && styles.markerReturn]} />

      <View style={styles.ageBlock}>
        <Text style={[styles.age, row.isReturn && styles.ageReturn]}>
          {row.age}
        </Text>
        <Text style={styles.year}>{row.year}</Text>
      </View>

      <MoonPhaseGlyph
        phaseFraction={row.phaseFraction}
        phaseIndex={row.phaseIndex}
        size={30}
        brightLimbAngleDeg={row.brightLimbAngleDeg}
        platePadding={7}
      />

      <View style={styles.info}>
        <Text style={styles.phase}>{describePhase(row)}</Text>
        <Text style={styles.illum}>
          {formatIllumination(row.phaseFraction)}
        </Text>
        {row.isReturn && row.cycleLabel && (
          <Text style={styles.returnTag}>{row.cycleLabel}</Text>
        )}
      </View>

      {showThumb ? (
        <Image
          source={{ uri: apod!.url }}
          style={styles.thumb}
          contentFit="cover"
          transition={250}
          accessibilityLabel={apod!.title}
        />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Text style={styles.thumbMark}>
            {apod ? (apod.kind === "video" ? "VID" : "DIA") : ""}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  rowRule: { borderBottomWidth: 1, borderBottomColor: Colors.rule },
  marker: { width: 3, alignSelf: "stretch", backgroundColor: "transparent" },
  markerReturn: { backgroundColor: Colors.signal },

  ageBlock: { width: 40 },
  age: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.lead,
    color: Colors.ink,
  },
  ageReturn: { color: Colors.signal },
  year: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    color: Colors.inkMuted,
    marginTop: 1,
  },

  info: { flex: 1 },
  phase: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    lineHeight: 19,
    color: Colors.ink,
  },
  illum: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.label,
    color: Colors.inkMuted,
    marginTop: 2,
  },
  returnTag: { ...Type.label, color: Colors.signal, marginTop: Spacing.xs },

  thumb: { width: 44, height: 44, backgroundColor: Colors.plate },
  thumbEmpty: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.paperDim,
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  thumbMark: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.micro,
    color: Colors.inkMuted,
  },
});
