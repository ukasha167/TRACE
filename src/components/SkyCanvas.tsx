import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import {
  Canvas,
  Fill,
  Group,
  ImageShader,
  Picture,
  Shader,
  Skia,
  createPicture,
  PaintStyle,
} from "@shopify/react-native-skia";
import { Colors, SkyColors, Spacing, FontFamily, FontSize, Type } from "@/constants/theme";
import { equatorialToHorizontal, projectToDisc } from "@/lib/astronomy/skyTransform";
import { getSolarSystemSky } from "@/lib/astronomy/skyBodies";
import { useMoonTextures } from "@/components/moon/moonTextures";
import { moonEffect } from "@/components/moon/moonShader";
import { moonUniforms, type MoonLight } from "@/components/moon/moonUniforms";
import catalogJson from "@/data/bsc.json";
import figuresJson from "@/data/constellations.json";
import type { Star, MilestoneLocation } from "@/types";

const CATALOG = catalogJson as Star[];
const FIGURES = figuresJson as { id: string; lines: number[][] }[];

interface Props {
  date: Date;
  location: Pick<MilestoneLocation, "latitude" | "longitude">;
  size: number;
  /** The moon that night, so the map draws it at its phase rather than as a dot. */
  moon: MoonLight;
  onPress?: () => void;
  magnitudeLimit?: number;
}

/** The moon is drawn at this radius in points, far larger than its half degree. */
const MOON_R = 7;
/** Space outside the horizon ring for N, E, S and W. */
const RIM = 18;

/**
 * THE WHOLE SKY FROM ONE PLACE AT ONE INSTANT, looking straight up.
 *
 * Zenith at the centre, horizon on the rim, north at the top, and EAST ON THE
 * LEFT, because that is how the sky looks from underneath (projectToDisc).
 *
 * ONE PICTURE. This used to be a React element per star, about 2,900 <Circle>s
 * reconciled on every render for a figure that never moves. Stars, figures,
 * grid and horizon are recorded once into an SkPicture when the date or place
 * changes, and a re-render of the screen around it replays that recording.
 *
 * The moon is the one thing drawn live, with the same shader and uniforms as
 * every other moon in the app, so its phase and tilt on the map match the
 * plate above it. It is drawn many times its real size, and the caption says
 * so. Names are real text laid over the canvas, so they follow the OS type size.
 */
export function SkyCanvas({ date, location, size, moon, onPress, magnitudeLimit = 5 }: Props) {
  const R = size / 2 - RIM;
  const cx = size / 2;
  const cy = size / 2;
  const textures = useMoonTextures(MOON_R * 2);
  const solar = useMemo(
    () => getSolarSystemSky(date, location),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date, location.latitude, location.longitude]
  );

  const scene = useMemo(() => {
    const at = (alt: number, az: number) => {
      const p = projectToDisc({ altitudeDeg: alt, azimuthDeg: az });
      return { x: cx + p.x * R, y: cy + p.y * R };
    };
    const horizontal = (ra: number, dec: number) =>
      equatorialToHorizontal(ra, dec, location.latitude, location.longitude, date);

    const labels: { key: string; text: string; x: number; y: number; kind: "star" | "planet" | "moon" }[] = [];

    const picture = createPicture((canvas) => {
      const paint = Skia.Paint();
      paint.setAntiAlias(true);

      // The chart face, then the altitude rings at 30 and 60 degrees and the
      // two meridians, faint enough to read as scaffolding.
      paint.setColor(Skia.Color(Colors.space));
      canvas.drawCircle(cx, cy, R, paint);
      const grid = Skia.Paint();
      grid.setAntiAlias(true);
      grid.setStyle(PaintStyle.Stroke);
      grid.setStrokeWidth(1);
      grid.setColor(Skia.Color(SkyColors.grid));
      grid.setAlphaf(0.14);
      canvas.drawCircle(cx, cy, (R * 60) / 90, grid);
      canvas.drawCircle(cx, cy, (R * 30) / 90, grid);
      canvas.drawLine(cx - R, cy, cx + R, cy, grid);
      canvas.drawLine(cx, cy - R, cx, cy + R, grid);

      // Figures. A segment is drawn only when both ends are up.
      const lines = Skia.Paint();
      lines.setAntiAlias(true);
      lines.setStyle(PaintStyle.Stroke);
      lines.setStrokeWidth(0.9);
      lines.setColor(Skia.Color(SkyColors.figure));
      lines.setAlphaf(0.42);
      const path = Skia.PathBuilder.Make();
      for (const fig of FIGURES) {
        for (const line of fig.lines) {
          let prev: { x: number; y: number } | null = null;
          for (let i = 0; i < line.length; i += 2) {
            const h = horizontal(line[i], line[i + 1]);
            const p = h.altitudeDeg > -1 ? at(Math.max(h.altitudeDeg, 0), h.azimuthDeg) : null;
            if (p && prev) {
              path.moveTo(prev.x, prev.y);
              path.lineTo(p.x, p.y);
            }
            prev = p;
          }
        }
      }
      canvas.drawPath(path.detach(), lines);

      // Stars, sized and faded by magnitude, which is a log scale.
      const star = Skia.Paint();
      star.setAntiAlias(true);
      star.setColor(Skia.Color(Colors.moonlight));
      for (const s of CATALOG) {
        if (s.mag > magnitudeLimit) continue;
        const h = horizontal(s.ra, s.dec);
        if (h.altitudeDeg <= 0) continue;
        const p = at(h.altitudeDeg, h.azimuthDeg);
        star.setAlphaf(Math.min(1, Math.max(0.3, 0.35 + (5.5 - s.mag) * 0.16)));
        canvas.drawCircle(p.x, p.y, Math.max(0.45, (5.3 - s.mag) * 0.42), star);
        if (s.proper && s.mag <= 1.3 && h.altitudeDeg >= 8) {
          labels.push({ key: `hr${s.hr}`, text: s.proper, x: p.x, y: p.y, kind: "star" });
        }
      }

      // Planets take SkyColors.planet so they read as different in kind.
      const planetPaint = Skia.Paint();
      planetPaint.setAntiAlias(true);
      planetPaint.setColor(Skia.Color(SkyColors.planet));
      for (const pl of solar.planets) {
        if (pl.altitudeDeg <= 0) continue;
        const p = at(pl.altitudeDeg, pl.azimuthDeg);
        canvas.drawCircle(p.x, p.y, 2.4, planetPaint);
        labels.push({ key: pl.id, text: pl.label, x: p.x, y: p.y, kind: "planet" });
      }

      const rim = Skia.Paint();
      rim.setAntiAlias(true);
      rim.setStyle(PaintStyle.Stroke);
      rim.setStrokeWidth(1);
      rim.setColor(Skia.Color(SkyColors.horizon));
      rim.setAlphaf(0.55);
      canvas.drawCircle(cx, cy, R, rim);
    }, { width: size, height: size });

    const solarMoon = solar.moon && solar.moon.altitudeDeg > -1 ? at(Math.max(solar.moon.altitudeDeg, 0), solar.moon.azimuthDeg) : null;
    if (solarMoon) labels.push({ key: "moon", text: "Moon", x: solarMoon.x, y: solarMoon.y, kind: "moon" });
    return { picture, labels, moonAt: solarMoon, isNight: solar.isNight };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solar, date, location.latitude, location.longitude, size, magnitudeLimit, R, cx, cy]);

  const moonU = scene.moonAt ? moonUniforms(moon, scene.moonAt.x, scene.moonAt.y, MOON_R, "tight") : null;

  const map = (
    <View style={{ width: size, height: size }}>
      <Canvas style={{ width: size, height: size }}>
        <Fill color={Colors.space} />
        <Picture picture={scene.picture} />
        {moonU && scene.moonAt && moonEffect && textures && (
          <Group clip={{ x: scene.moonAt.x - MOON_R * 2, y: scene.moonAt.y - MOON_R * 2, width: MOON_R * 4, height: MOON_R * 4 }}>
            <Fill>
              <Shader source={moonEffect} uniforms={moonU}>
                <ImageShader image={textures.albedo} fit="fill" rect={{ x: scene.moonAt.x - MOON_R, y: scene.moonAt.y - MOON_R, width: MOON_R * 2, height: MOON_R * 2 }} tx="clamp" ty="clamp" />
                <ImageShader image={textures.normal} fit="fill" rect={{ x: scene.moonAt.x - MOON_R, y: scene.moonAt.y - MOON_R, width: MOON_R * 2, height: MOON_R * 2 }} tx="clamp" ty="clamp" />
              </Shader>
            </Fill>
          </Group>
        )}
      </Canvas>

      {scene.labels.map((l) => {
        // Names sit on the side toward the centre, so none runs off the rim.
        const right = l.x > cx;
        const gap = l.kind === "moon" ? MOON_R + 4 : 5;
        return (
          <Text
            key={l.key}
            style={[
              styles.name,
              l.kind === "planet" && styles.planet,
              l.kind === "moon" && styles.moonName,
              right
                ? { right: size - l.x + gap, top: l.y - 8, textAlign: "right" }
                : { left: l.x + gap, top: l.y - 8 },
            ]}
          >
            {l.text}
          </Text>
        );
      })}

      <Text style={[styles.cardinal, { top: 1, left: 0, right: 0 }]}>N</Text>
      <Text style={[styles.cardinal, { bottom: 1, left: 0, right: 0 }]}>S</Text>
      <Text style={[styles.cardinal, { left: 3, top: cy - 8 }]}>E</Text>
      <Text style={[styles.cardinal, { right: 3, top: cy - 8 }]}>W</Text>
    </View>
  );

  return (
    <View>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="The sky that night. Opens the full sky view."
          style={({ pressed }) => pressed && { opacity: 0.85 }}
        >
          {map}
        </Pressable>
      ) : (
        map
      )}
      {!scene.isNight && (
        <Text style={styles.legend}>
          The sun was up at this moment, so these stars were above the horizon but not visible.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  name: {
    position: "absolute",
    fontFamily: FontFamily.regular,
    fontSize: FontSize.micro,
    color: SkyColors.label,
  },
  planet: { color: SkyColors.planet },
  moonName: { color: Colors.plateInk, fontFamily: FontFamily.medium },
  cardinal: {
    position: "absolute",
    textAlign: "center",
    fontFamily: FontFamily.medium,
    fontSize: FontSize.label,
    color: Colors.plateMuted,
  },
  legend: { ...Type.small, marginTop: Spacing.sm },
});
