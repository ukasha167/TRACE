import React, { useRef, useCallback, useMemo } from "react";
import {
  Canvas,
  useCanvasRef,
  useFont,
  useImage,
  Image as SkiaImage,
  Rect,
  RoundedRect,
  Fill,
  Group,
  Text as SkiaText,
  LinearGradient,
  vec,
  Path,
  Skia,
  Circle,
  Paint,
} from "@shopify/react-native-skia";
import {
  Fraunces_700Bold,
  Fraunces_400Regular_Italic,
  Fraunces_400Regular,
} from "@expo-google-fonts/fraunces";
import {
  Manrope_600SemiBold,
  Manrope_400Regular,
} from "@expo-google-fonts/manrope";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import type { Milestone, ApodCacheEntry } from "@/types";
import { Colors } from "@/constants/theme";

// ---- Card dimensions ----
export const CARD_SIZES = {
  story:  { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
} as const;

export type CardFormat = keyof typeof CARD_SIZES;

// ---- Moon phase glyph via Skia Path ----
function moonPhasePath(
  cx: number,
  cy: number,
  r: number,
  phaseFraction: number,
  phaseIndex: number
): ReturnType<typeof Skia.Path.Make> {
  const isWaxing = phaseIndex <= 4;
  const b = r * Math.abs(2 * phaseFraction - 1);
  const isGibbous = phaseFraction > 0.5;

  const path = Skia.Path.Make();

  // Full circle clip (used as base; lit portions drawn within)
  // The caller will clip children to this
  path.addCircle(cx, cy, r);
  return path;
}

/**
 * Moon Phase Glyph — Skia implementation for the export card.
 * Renders the accurate crescent/gibbous shape using Skia primitives.
 * Uses save/restore for circular clipping.
 */
function SkiaMoonGlyph({
  cx,
  cy,
  r,
  phaseFraction,
  phaseIndex,
  accentColor = Colors.ember,
}: {
  cx: number;
  cy: number;
  r: number;
  phaseFraction: number;
  phaseIndex: number;
  accentColor?: string;
}) {
  const isWaxing = phaseIndex <= 4;
  const isGibbous = phaseFraction > 0.5;
  const b = r * Math.abs(2 * phaseFraction - 1);

  // Clip path = full circle
  const clipPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(cx, cy, r - 0.5);
    return p;
  }, [cx, cy, r]);

  // Lit half rect
  const litPath = useMemo(() => {
    const p = Skia.Path.Make();
    if (isWaxing) {
      p.addRect(Skia.XYWHRect(cx, cy - r, r, r * 2));
    } else {
      p.addRect(Skia.XYWHRect(cx - r, cy - r, r, r * 2));
    }
    return p;
  }, [cx, cy, r, isWaxing]);

  // Terminator oval
  const termPath = useMemo(() => {
    const p = Skia.Path.Make();
    if (b > 0.5) {
      p.addOval(Skia.XYWHRect(cx - b, cy - r, b * 2, r * 2));
    }
    return p;
  }, [cx, cy, r, b]);

  // Outline path
  const outlinePath = useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(cx, cy, r - 1);
    return p;
  }, [cx, cy, r]);

  return (
    <Group>
      {/* Dark base */}
      <Circle cx={cx} cy={cy} r={r} color={Colors.blueprint} />

      {/* Lit portion — clipped to circle */}
      <Group clip={clipPath}>
        <Path path={litPath} color={Colors.starlight} />
        {b > 0.5 && (
          <Path
            path={termPath}
            color={isGibbous ? Colors.starlight : Colors.blueprint}
          />
        )}
      </Group>

      {/* Outline ring */}
      <Path path={outlinePath} color={accentColor} style="stroke" strokeWidth={2.5} />
    </Group>
  );
}

// ---- Props ----
interface ExportCardCanvasProps {
  milestone: Milestone;
  apod: ApodCacheEntry | null;
  moonPhaseFraction: number;
  moonPhaseIndex: number;
  moonPhaseName: string;
  moonPhaseIllumination: string;
  lightSentence: string;
  format: CardFormat;
  /** Preview scale — card is rendered at CARD_SIZES then scaled down for display */
  previewWidth: number;
}

/**
 * ExportCardCanvas — the Section 12 Skia canvas implementation.
 *
 * Renders the full export card at 1080×1920 (story) or 1080×1080 (square).
 * makeImageSnapshotAsync() called via the ref converts it to PNG bytes.
 *
 * Layout (story, top → bottom):
 *   0%–55%    APOD image with LinearGradient scrim
 *   55%–65%   Title block (milestone title + date)
 *   65%–75%   Moon phase strip (glyph + name + illumination)
 *   75%–88%   Light-travel sentence
 *   88%–100%  Watermark
 */
const ExportCardCanvas = React.forwardRef<
  ReturnType<typeof useCanvasRef>["current"],
  ExportCardCanvasProps
>(function ExportCardCanvas(
  {
    milestone,
    apod,
    moonPhaseFraction,
    moonPhaseIndex,
    moonPhaseName,
    moonPhaseIllumination,
    lightSentence,
    format,
    previewWidth,
  },
  ref
) {
  const { w, h } = CARD_SIZES[format];
  const scale = previewWidth / w;

  // ---- Fonts (loaded by Skia, not expo-font) ----
  const titleFont    = useFont(Fraunces_700Bold, 72);
  const italicFont   = useFont(Fraunces_400Regular_Italic, 44);
  const serifFont    = useFont(Fraunces_400Regular, 36);
  const sansFont     = useFont(Manrope_400Regular, 34);
  const sansSemiBold = useFont(Manrope_600SemiBold, 30);
  const monoFont     = useFont(JetBrainsMono_400Regular, 28);
  const monoSmall    = useFont(JetBrainsMono_400Regular, 22);

  // ---- APOD image ----
  const apodImageUri = apod?.mediaType === "image"
    ? (apod.hdurl ?? apod.url)
    : null;
  const apodImage = useImage(apodImageUri ?? undefined);

  // ---- Layout constants ----
  const PAD = 64;
  const imageBottom = format === "story" ? h * 0.52 : h * 0.48;
  const titleY      = imageBottom + 56;
  const dateY       = titleY + 86;
  const moonY       = dateY + 60;
  const moonGlyphR  = 44;
  const moonCX      = PAD + moonGlyphR;
  const moonCY      = moonY + moonGlyphR;
  const moonTextX   = PAD + moonGlyphR * 2 + 20;
  const sentenceY   = moonCY + moonGlyphR + 52;
  const watermarkY  = h - 52;

  if (!titleFont || !monoFont || !sansFont) {
    // Fonts not ready yet — render a blank dark canvas
    return (
      <Canvas
        ref={ref as any}
        style={{ width: w * scale, height: h * scale }}
      >
        <Fill color={Colors.blueprint} />
      </Canvas>
    );
  }

  // Formatted date
  const [year, month, day] = milestone.date.split("-").map(Number);
  const formattedDate = new Date(year, month - 1, day).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Canvas
      ref={ref as any}
      style={{ width: w * scale, height: h * scale }}
    >
      <Group transform={[{ scale }]}>
        {/* ---- Background ---- */}
        <Fill color={Colors.blueprint} />

        {/* ---- APOD image region ---- */}
        {apodImage && (
          <Group>
            <SkiaImage
              image={apodImage}
              x={0}
              y={0}
              width={w}
              height={imageBottom}
              fit="cover"
            />
            {/* Gradient scrim — only the bottom third of the image */}
            <Rect x={0} y={imageBottom * 0.5} width={w} height={imageBottom * 0.5}>
              <LinearGradient
                start={vec(0, imageBottom * 0.5)}
                end={vec(0, imageBottom)}
                colors={["transparent", Colors.blueprint]}
              />
            </Rect>
          </Group>
        )}

        {/* No APOD fallback — subtle top strip */}
        {!apodImage && (
          <Rect x={0} y={0} width={w} height={imageBottom}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, imageBottom)}
              colors={[Colors.blueprintLight, Colors.blueprint]}
            />
          </Rect>
        )}

        {/* ---- App label (top-left, always above image) ---- */}
        {monoSmall && (
          <SkiaText
            x={PAD}
            y={72}
            text="TRACE"
            font={monoSmall}
            color={Colors.starlight + "88"}
          />
        )}

        {/* ---- Title block ---- */}
        {titleFont && (
          <SkiaText
            x={PAD}
            y={titleY}
            text={milestone.title}
            font={titleFont}
            color={Colors.starlight}
          />
        )}
        {monoFont && (
          <SkiaText
            x={PAD}
            y={dateY}
            text={formattedDate}
            font={monoFont}
            color={Colors.cyanotype}
          />
        )}

        {/* ---- Divider ---- */}
        <Rect
          x={PAD}
          y={dateY + 32}
          width={w - PAD * 2}
          height={1}
          color={Colors.cyanotype + "44"}
        />

        {/* ---- Moon phase strip ---- */}
        <SkiaMoonGlyph
          cx={moonCX}
          cy={moonCY}
          r={moonGlyphR}
          phaseFraction={moonPhaseFraction}
          phaseIndex={moonPhaseIndex}
        />
        {sansSemiBold && (
          <SkiaText
            x={moonTextX}
            y={moonCY - 8}
            text={moonPhaseName}
            font={sansSemiBold}
            color={Colors.starlight}
          />
        )}
        {monoSmall && (
          <SkiaText
            x={moonTextX}
            y={moonCY + 26}
            text={`${moonPhaseIllumination} illuminated`}
            font={monoSmall}
            color={Colors.cyanotype}
          />
        )}

        {/* ---- Divider ---- */}
        <Rect
          x={PAD}
          y={moonCY + moonGlyphR + 20}
          width={w - PAD * 2}
          height={1}
          color={Colors.cyanotype + "33"}
        />

        {/* ---- Light-travel sentence ---- */}
        {italicFont && (
          <SkiaText
            x={PAD}
            y={sentenceY}
            text={lightSentence}
            font={italicFont}
            color={Colors.starlight + "CC"}
          />
        )}

        {/* ---- Watermark ---- */}
        {monoSmall && (
          <SkiaText
            x={PAD}
            y={watermarkY}
            text="apod.nasa.gov · trace app"
            font={monoSmall}
            color={Colors.cyanotype + "66"}
          />
        )}
        {apod?.copyright && monoSmall && (
          <SkiaText
            x={PAD}
            y={watermarkY + 32}
            text={`© ${apod.copyright}`}
            font={monoSmall}
            color={Colors.cyanotype + "55"}
          />
        )}
      </Group>
    </Canvas>
  );
});

export { ExportCardCanvas };
