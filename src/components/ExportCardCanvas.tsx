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
  Circle,
  Image as SkiaImage,
  Mask,
  BlurMask,
  useImage,
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
import { getMoonTextureRotation } from "@/lib/astronomy/brightLimb";
import { litMoonPath, moonDiscPath } from "@/components/moon/moonPath";

export const CARD_SIZES = {
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
} as const;

export type CardFormat = keyof typeof CARD_SIZES;

const MOON_ASSET = require("../../assets/moon_disc.png");


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
  const moonImage = useImage(MOON_ASSET);

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
  const titleY = ruleY + (isStory ? 130 : 96);
  const dateY = titleY + (isStory ? 52 : 44);

  const plateY = dateY + (isStory ? 44 : 36);
  const plateH = isStory ? 620 : 330;
  const moonR = Math.min(inner, plateH) * (isStory ? 0.32 : 0.36);
  const moonCX = w / 2;
  const moonCY = plateY + plateH / 2;

  const phaseY = plateY + plateH + (isStory ? 66 : 52);
  const phaseRuleY = phaseY + (isStory ? 34 : 26);

  const returnsLabelY = phaseRuleY + (isStory ? 56 : 42);
  const returnsStartY = returnsLabelY + (isStory ? 52 : 44);
  const returnRowH = isStory ? 58 : 48;

  const footRuleY = h - PAD - (isStory ? 54 : 44);
  const footY = h - PAD - 12;

  const shownReturns = moonReturns.slice(0, isStory ? 3 : 2);
  const isWaxing = moonPhaseIndex <= 4;
  const path = litMoonPath(moonCX, moonCY, moonR, moonPhaseFraction, isWaxing);
  const discPath = moonDiscPath(moonCX, moonCY, moonR);
  const moonRotDeg = getMoonTextureRotation(brightLimbAngleDeg, isWaxing);
  const moonRotRad = (moonRotDeg * Math.PI) / 180;

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
            { rotate: moonRotRad },
            { translateX: -moonCX },
            { translateY: -moonCY },
          ]}
        >
          {/* Soft atmospheric moonlight bloom radiating from illuminated terrain */}
          <Path
            path={path}
            color={Colors.moonlight}
            opacity={0.3}
          >
            <BlurMask blur={Math.max(4, moonR * 0.08)} style="normal" />
          </Path>

          {/* Unlit base disc (deep earthshine tone) */}
          <Circle cx={moonCX} cy={moonCY} r={moonR} color={Colors.earthshine} />

          {moonImage ? (
            <Group clip={discPath}>
              {/* Faint earthshine texture on unlit disc (6% opacity) */}
              <Group clip={path} invertClip>
                <SkiaImage
                  image={moonImage}
                  x={moonCX - moonR}
                  y={moonCY - moonR}
                  width={moonR * 2}
                  height={moonR * 2}
                  opacity={0.06}
                />
              </Group>
              {/* Lit lunar surface with softly diffused terminator transition */}
              <Mask
                mode="alpha"
                mask={
                  <Group>
                    <Path path={path} color="white">
                      <BlurMask blur={Math.max(1.5, moonR * 0.02)} style="normal" />
                    </Path>
                  </Group>
                }
              >
                <SkiaImage
                  image={moonImage}
                  x={moonCX - moonR}
                  y={moonCY - moonR}
                  width={moonR * 2}
                  height={moonR * 2}
                  opacity={1.0}
                />
              </Mask>
            </Group>
          ) : (
            <Path path={path} color={Colors.moonlight} />
          )}
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
