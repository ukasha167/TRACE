import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Canvas, Circle, Group, Path, Skia } from "@shopify/react-native-skia";
import { Colors, Spacing, FontFamily, FontSize, Tracking } from "@/constants/theme";
import { visibleStars, projectToDisc } from "@/lib/astronomy/skyTransform";
import { getSolarSystemSky } from "@/lib/astronomy/skyBodies";
import catalogJson from "@/data/bsc.json";
import type { Star, MilestoneLocation } from "@/types";

const CATALOG = catalogJson as Star[];

interface Props {
  date: Date;
  location: Pick<MilestoneLocation, "latitude" | "longitude">;
  size: number;
  /** Fainter stars make a truer sky but visual mush at small sizes. */
  magnitudeLimit?: number;
}

/**
 * THE SKY RENDER — spec §7.
 *
 * A stereographic planisphere of the whole visible hemisphere: zenith at the
 * centre, horizon on the rim, north up. This is the classic printed star-chart
 * layout, which is exactly right for a static "this was the sky" figure.
 *
 * What it is NOT: Stellarium. There is no deep-sky catalog, no atmosphere
 * model, no satellites. It shows ~2,900 real Yale BSC stars plus the naked-eye
 * planets and the moon, correctly placed for a given place and instant, with
 * positions verified against astronomy-engine to 24 arcseconds.
 *
 * Everything here is local computation from bundled data — no network, ever.
 */
export function SkyCanvas({ date, location, size, magnitudeLimit = 4.6 }: Props) {
  const { stars, solar, radius } = useMemo(() => {
    const r = size / 2;
    return {
      stars: visibleStars(
        CATALOG,
        location.latitude,
        location.longitude,
        date,
        magnitudeLimit
      ),
      solar: getSolarSystemSky(date, location),
      radius: r,
    };
  }, [date, location.latitude, location.longitude, size, magnitudeLimit]);

  // Inset so the horizon ring isn't clipped by the canvas edge.
  const R = radius - 6;
  const cx = radius;
  const cy = radius;

  const horizonRing = useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(cx, cy, R);
    return p;
  }, [cx, cy, R]);

  /** Brighter stars are drawn larger and more opaque — magnitude is a log scale. */
  const starRadius = (mag: number) => {
    const t = Math.max(0, (magnitudeLimit - mag) / (magnitudeLimit + 1.5));
    return 0.5 + t * t * 2.6;
  };
  const starOpacity = (mag: number) => {
    const t = Math.max(0, (magnitudeLimit - mag) / (magnitudeLimit + 1.5));
    return 0.35 + t * 0.65;
  };

  return (
    <View>
      <Canvas style={{ width: size, height: size, backgroundColor: Colors.plate }}>
        <Group>
          {/* Horizon */}
          <Path path={horizonRing} style="stroke" strokeWidth={1} color={Colors.plateRule} />

          {stars.map((s) => {
            const p = projectToDisc(s);
            return (
              <Circle
                key={s.id}
                cx={cx + p.x * R}
                cy={cy + p.y * R}
                r={starRadius(s.magnitude)}
                color={Colors.moonlight}
                opacity={starOpacity(s.magnitude)}
              />
            );
          })}

          {/* Planets — signal red, the one accent, so they read as different
              in kind from the stars rather than merely brighter. */}
          {solar.planets.map((p) => {
            const q = projectToDisc(p);
            return (
              <Circle
                key={p.id}
                cx={cx + q.x * R}
                cy={cy + q.y * R}
                r={2.6}
                color={Colors.signalOnPlate}
              />
            );
          })}

          {solar.moon && (
            <Circle
              cx={cx + projectToDisc(solar.moon).x * R}
              cy={cy + projectToDisc(solar.moon).y * R}
              r={5}
              color={Colors.moonlight}
            />
          )}
        </Group>
      </Canvas>

      {/* Cardinals sit outside the canvas as real text, so they scale with the
          OS type setting instead of being baked into the drawing. */}
      <Text style={[styles.cardinal, styles.n, { left: size / 2 - 6 }]}>N</Text>
      <Text style={[styles.cardinal, styles.s, { left: size / 2 - 6 }]}>S</Text>
      <Text style={[styles.cardinal, styles.w, { top: size / 2 - 8 }]}>W</Text>
      <Text style={[styles.cardinal, styles.e, { top: size / 2 - 8 }]}>E</Text>

      <View style={styles.legend}>
        <Text style={styles.legendText}>
          {stars.length} stars · {solar.planets.length}{" "}
          {solar.planets.length === 1 ? "planet" : "planets"}
          {solar.moon ? " · moon up" : " · moon below horizon"}
        </Text>
        {!solar.isNight && (
          <Text style={styles.legendText}>
            Sun was up — these stars were above the horizon but not visible
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardinal: {
    position: "absolute",
    fontFamily: FontFamily.mono,
    fontSize: FontSize.micro,
    letterSpacing: Tracking.label,
    color: Colors.plateMuted,
  },
  n: { top: -2 },
  s: { bottom: 34 },
  w: { left: -2 },
  e: { right: -2 },
  legend: { marginTop: Spacing.sm, gap: 2 },
  legendText: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.micro,
    letterSpacing: 0.6,
    color: Colors.inkMuted,
  },
});
