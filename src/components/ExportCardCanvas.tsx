import React from "react";
import {
  Canvas,
  useCanvasRef,
  useFont,
  Rect,
  Fill,
  Group,
  Text as SkiaText,
  Path,
  Skia,
  Circle,
} from "@shopify/react-native-skia";
import {
  Archivo_900Black,
  Archivo_600SemiBold,
  Archivo_400Regular,
} from "@expo-google-fonts/archivo";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from "@expo-google-fonts/jetbrains-mono";
import type { Milestone, MoonReturn } from "@/types";
import { Colors } from "@/constants/theme";

export const CARD_SIZES = {
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
} as const;

export type CardFormat = keyof typeof CARD_SIZES;

/**
 * Builds the lit region of the moon as a closed path.
 *
 * The boundary is two arcs: the illuminated limb (a semicircle of radius r) and
 * the terminator (a semi-ellipse with horizontal semi-axis b = r|2f-1| and
 * vertical semi-axis r). At the quarters b = 0 and the terminator is a straight
 * line; at new/full b = r and it coincides with the limb.
 *
 * Constructed for a WAXING moon (lit on the right). Waning is the same shape
 * mirrored about the vertical centre line, which the caller applies as a
 * transform rather than duplicating the angle arithmetic.
 */
function litMoonPath(cx: number, cy: number, r: number, phaseFraction: number) {
  const b = r * Math.abs(2 * phaseFraction - 1);
  const isGibbous = phaseFraction > 0.5;
  const path = Skia.Path.Make();

  // Limb: top -> right -> bottom.
  path.arcToOval(
    { x: cx - r, y: cy - r, width: r * 2, height: r * 2 },
    -90,
    180,
    true
  );
  // Terminator: bottom -> top. Through the LEFT extreme when gibbous (lit
  // region is more than half), through the RIGHT extreme when crescent.
  path.arcToOval(
    { x: cx - b, y: cy - r, width: b * 2, height: r * 2 },
    90,
    isGibbous ? 180 : -180,
    false
  );
  path.close();
  return path;
}

interface ExportCardCanvasProps {
  milestone: Milestone;
  moonPhaseFraction: number;
  moonPhaseIndex: number;
  /** Honest label from describePhase(), never the raw 8-way bucket name. */
  moonPhaseName: string;
  moonPhaseIllumination: string;
  brightLimbAngleDeg: number | null;
  moonReturns: MoonReturn[];
  format: CardFormat;
  /** Card renders at CARD_SIZES then scales down for on-screen preview. */
  previewWidth: number;
}

/**
 * THE EXPORT CARD — spec §12.
 *
 * Swiss poster on bone paper: wordmark and heavy rule, the title set very
 * large, the moon on a dark plate tipped into the page, then the recurrence
 * table. Deliberately NOT a dark card — a paper card is the unexpected thing in
 * a feed of dark space imagery, and it matches the app it came from.
 *
 * The moon is drawn at its real phase and real tilt. That, and the return
 * table, are the whole point of the card; everything else stays quiet.
 */
const ExportCardCanvas = React.forwardRef<
  ReturnType<typeof useCanvasRef>["current"],
  ExportCardCanvasProps
>(function ExportCardCanvas(
  {
    milestone,
    moonPhaseFraction,
    moonPhaseIndex,
    moonPhaseName,
    moonPhaseIllumination,
    brightLimbAngleDeg,
    moonReturns,
    format,
    previewWidth,
  },
  ref
) {
  const { w, h } = CARD_SIZES[format];
  const scale = previewWidth / w;
  const isStory = format === "story";

  const titleFont = useFont(Archivo_900Black, isStory ? 104 : 82);
  const headFont = useFont(Archivo_600SemiBold, 42);
  const bodyFont = useFont(Archivo_400Regular, 32);
  const monoFont = useFont(JetBrainsMono_500Medium, 34);
  const monoSmall = useFont(JetBrainsMono_400Regular, 26);

  if (!titleFont || !monoFont || !bodyFont || !headFont || !monoSmall) {
    return (
      <Canvas ref={ref as any} style={{ width: w * scale, height: h * scale }}>
        <Fill color={Colors.paper} />
      </Canvas>
    );
  }

  const PAD = 72;
  const inner = w - PAD * 2;
  const [year, month, day] = milestone.date.split("-");

  // ---- Vertical rhythm ----
  const wordmarkY = PAD + 30;
  const ruleY = wordmarkY + 26;
  const titleY = ruleY + (isStory ? 130 : 108);
  const dateY = titleY + 52;

  const plateY = dateY + 44;
  const plateH = isStory ? 620 : 380;
  const moonR = Math.min(inner, plateH) * 0.32;
  const moonCX = w / 2;
  const moonCY = plateY + plateH / 2;

  const phaseY = plateY + plateH + 66;
  const phaseRuleY = phaseY + 34;

  const returnsLabelY = phaseRuleY + 56;
  const returnsStartY = returnsLabelY + 52;
  const returnRowH = 58;

  const footRuleY = h - PAD - 54;
  const footY = h - PAD - 12;

  const shownReturns = moonReturns.slice(0, isStory ? 3 : 2);
  const isWaxing = moonPhaseIndex <= 4;

  return (
    <Canvas ref={ref as any} style={{ width: w * scale, height: h * scale }}>
      <Group transform={[{ scale }]}>
        <Fill color={Colors.paper} />

        {/* ---- Masthead ---- */}
        <SkiaText x={PAD} y={wordmarkY} text="TRACE" font={monoSmall} color={Colors.ink} />
        <SkiaText
          x={w - PAD - 120}
          y={wordmarkY}
          text={`${day}.${month}`}
          font={monoSmall}
          color={Colors.inkMuted}
        />
        <Rect x={PAD} y={ruleY} width={inner} height={6} color={Colors.ink} />

        {/* ---- Title ---- */}
        <SkiaText
          x={PAD}
          y={titleY}
          text={milestone.title}
          font={titleFont}
          color={Colors.ink}
        />
        <SkiaText
          x={PAD}
          y={dateY}
          text={`${day}.${month}.${year}`}
          font={monoFont}
          color={Colors.signal}
        />

        {/* ---- Moon plate ---- */}
        <Rect x={PAD} y={plateY} width={inner} height={plateH} color={Colors.plate} />

        <Group
          transform={[
            { translateX: moonCX },
            { translateY: moonCY },
            { rotate: ((brightLimbAngleDeg ?? 0) * Math.PI) / 180 },
            { translateX: -moonCX },
            { translateY: -moonCY },
          ]}
        >
          {/* Unlit disc, a shade above the plate so the whole moon reads. */}
          <Circle cx={moonCX} cy={moonCY} r={moonR} color="#24241C" />
          <Group
            transform={
              isWaxing
                ? []
                : [
                    { translateX: moonCX },
                    { scaleX: -1 },
                    { translateX: -moonCX },
                  ]
            }
          >
            <Path
              path={litMoonPath(moonCX, moonCY, moonR, moonPhaseFraction)}
              color={Colors.moonlight}
            />
          </Group>
        </Group>

        {/* ---- Phase readout ---- */}
        <SkiaText x={PAD} y={phaseY} text={moonPhaseName} font={headFont} color={Colors.ink} />
        <SkiaText
          x={w - PAD - monoFont.measureText(moonPhaseIllumination).width}
          y={phaseY}
          text={moonPhaseIllumination}
          font={monoFont}
          color={Colors.signal}
        />
        <Rect x={PAD} y={phaseRuleY} width={inner} height={1} color={Colors.rule} />

        {/* ---- Recurrence table ---- */}
        {shownReturns.length > 0 && (
          <Group>
            <SkiaText
              x={PAD}
              y={returnsLabelY}
              text="WHEN THIS SKY COMES BACK"
              font={monoSmall}
              color={Colors.inkMuted}
            />
            {shownReturns.map((r, i) => {
              const y = returnsStartY + i * returnRowH;
              return (
                <Group key={r.year}>
                  <SkiaText
                    x={PAD}
                    y={y}
                    text={String(r.year)}
                    font={monoFont}
                    color={Colors.signal}
                  />
                  <SkiaText
                    x={PAD + 150}
                    y={y}
                    text={r.cycleLabel}
                    font={bodyFont}
                    color={Colors.ink}
                  />
                  <Rect
                    x={PAD}
                    y={y + 18}
                    width={inner}
                    height={1}
                    color={Colors.rule}
                  />
                </Group>
              );
            })}
          </Group>
        )}

        {/* ---- Foot ---- */}
        <Rect x={PAD} y={footRuleY} width={inner} height={1} color={Colors.ink} />
        <SkiaText
          x={PAD}
          y={footY}
          text="TRACE"
          font={monoSmall}
          color={Colors.inkMuted}
        />
      </Group>
    </Canvas>
  );
});

export { ExportCardCanvas };
export default ExportCardCanvas;
