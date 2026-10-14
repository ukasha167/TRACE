import React from "react";
import {
  Canvas,
  useCanvasRef,
  useFont,
  useFonts,
  BlurMask,
  Circle,
  Rect,
  RoundedRect,
  Fill,
  Group,
  Paragraph,
  Skia,
  FontWeight,
  Text as SkiaText,
  Shader,
  ImageShader,
  rect,
  rrect,
  type SkParagraph,
  type SkTypefaceFontProvider,
} from "@shopify/react-native-skia";
import {
  Newsreader_500Medium,
  Newsreader_600SemiBold,
} from "@expo-google-fonts/newsreader";
import { Figtree_400Regular } from "@expo-google-fonts/figtree";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from "@expo-google-fonts/jetbrains-mono";
import type { Milestone, MoonReturn } from "@/types";
import { Colors } from "@/constants/theme";
import {
  CORE_BLUR,
  GLOW_ALPHA,
  GLOW_BLUR,
  GLOW_RADIUS,
  NOMINAL_WIDTH,
  generateStarField,
} from "@/components/moon/starGrain";
import { moonEffect } from "@/components/moon/moonShader";
import { moonUniforms as moonUniformsFor } from "@/components/moon/moonUniforms";
import { useMoonTextures } from "@/components/moon/moonTextures";

export const CARD_SIZES = {
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
} as const;

export type CardFormat = keyof typeof CARD_SIZES;

/**
 * Title sizes to try, largest first. The first that sets the name in two lines
 * wins; a name too long even for the last size takes as many lines as it needs.
 */
const TITLE_SIZES: Record<CardFormat, number[]> = {
  story: [104, 92, 80, 70],
  square: [84, 74, 64, 56],
};

/** A paragraph laid out at `width`, with the baselines the layout needs. */
interface SetText {
  paragraph: SkParagraph;
  firstBaseline: number;
  lastBaseline: number;
}

function setText(
  text: string,
  fonts: SkTypefaceFontProvider,
  family: string,
  size: number,
  color: string,
  width: number,
  weight: FontWeight = FontWeight.Normal
): SetText {
  const paragraph = Skia.ParagraphBuilder.Make({}, fonts)
    .pushStyle({
      color: Skia.Color(color),
      fontFamilies: [family],
      fontSize: size,
      fontStyle: { weight },
      heightMultiplier: 1.08,
    })
    .addText(text)
    .pop()
    .build();
  paragraph.layout(width);
  const lines = paragraph.getLineMetrics();
  return {
    paragraph,
    firstBaseline: lines[0]?.baseline ?? size,
    lastBaseline: lines[lines.length - 1]?.baseline ?? size,
  };
}

/**
 * The name, set to wrap. It used to be one SkiaText line, so a long name ran
 * off the right edge of the card and was cut by the canvas: truncation, on the
 * one screen people send to someone else.
 */
function setTitle(
  title: string,
  fonts: SkTypefaceFontProvider,
  format: CardFormat,
  width: number
): SetText {
  let set: SetText | null = null;
  for (const size of TITLE_SIZES[format]) {
    set = setText(title, fonts, "Newsreader", size, Colors.ink, width, FontWeight.SemiBold);
    if (set.paragraph.getLineMetrics().length <= 2) break;
  }
  return set!;
}

interface ExportCardCanvasProps {
  milestone: Milestone;
  moonPhaseFraction: number;
  /** From MoonSnapshot.waxing. Never from phaseIndex — see MoonPhaseGlyph. */
  moonWaxing: boolean;
  /** Honest label from describePhase(), never the raw 8-way bucket name. */
  moonPhaseName: string;
  moonPhaseIllumination: string;
  brightLimbAngleDeg: number | null;
  /**
   * Screen rotation of the Moon's north pole (getLunarNorthRotation). Orients
   * the photograph independently of the terminator — see getLunarNorthRotation.
   * Null on records with no coordinates, where neither rotation applies.
   */
  northAngleDeg: number | null;
  moonReturns: MoonReturn[];
  /** Place label, when the record has one. Printed under the phase readout. */
  placeLabel: string | null;
  format: CardFormat;
  /** Card renders at CARD_SIZES then scales down for on-screen preview. */
  previewWidth: number;
}

/**
 * THE EXPORT CARD. Spec §12.
 *
 * A printed page on bone stock: a small wordmark, the name set large in the
 * serif, the moon on a rounded dark plate tipped into the page, then the
 * recurrence table. Deliberately NOT a dark card, because a paper card is the
 * unexpected thing in a feed of dark space imagery, and it matches the app it
 * came from.
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
    moonWaxing,
    moonPhaseName,
    moonPhaseIllumination,
    brightLimbAngleDeg,
    northAngleDeg,
    moonReturns,
    placeLabel,
    format,
    previewWidth,
  },
  ref
) {
  const { w, h } = CARD_SIZES[format];
  const scale = previewWidth / w;
  const isStory = format === "story";

  // The name and the place wrap, so they are set as paragraphs, which need the
  // typefaces registered with a provider rather than loaded as single fonts.
  const paragraphFonts = useFonts({
    Newsreader: [Newsreader_600SemiBold],
    Figtree: [Figtree_400Regular],
  });
  // The phase name is a name, so it takes the serif like every other name in
  // the app. Cycle labels below stay in Figtree, since those are interface text.
  const headFont = useFont(Newsreader_500Medium, 46);
  const bodyFont = useFont(Figtree_400Regular, 32);
  const monoFont = useFont(JetBrainsMono_500Medium, 34);
  const monoSmall = useFont(JetBrainsMono_400Regular, 26);
  // The card is drawn at its full output width whatever the preview shows, so it
  // always samples the full-size maps.
  const textures = useMoonTextures(w);
  const moonImage = textures?.albedo ?? null;
  const moonNormal = textures?.normal ?? null;

  if (!paragraphFonts || !monoFont || !bodyFont || !headFont || !monoSmall) {
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

  // The title's first baseline sits where the single line always did. Any line
  // past the first is paid for by the moon plate, so the phase, the place and
  // the returns keep their positions and nothing is pushed into the foot.
  const title = setTitle(milestone.title, paragraphFonts, format, inner);
  const titleBaseline = ruleY + (isStory ? 136 : 100);
  const titleTop = titleBaseline - title.firstBaseline;
  const extraTitle = title.lastBaseline - title.firstBaseline;
  // The gap clears a descender at the largest title size. At 52 a two-line name
  // left its last line's "p" and "y" nearly touching the date.
  const dateY = titleBaseline + extraTitle + (isStory ? 64 : 52);

  const plateY = dateY + (isStory ? 44 : 36);
  const plateH = (isStory ? 760 : 330) - extraTitle;
  const plateR = 36;
  const moonR = Math.min(inner, plateH) * (isStory ? 0.32 : 0.36);
  const moonCX = w / 2;
  const moonCY = plateY + plateH / 2;

  const phaseY = plateY + plateH + (isStory ? 66 : 52);
  const phaseRuleY = phaseY + (isStory ? 34 : 26);

  // The place wraps too. A long place name used to run off the card as well.
  const place = placeLabel
    ? setText(`Seen from ${placeLabel}`, paragraphFonts, "Figtree", 32, Colors.inkMuted, inner)
    : null;
  const placeY = phaseRuleY + (isStory ? 50 : 40);
  const extraPlace = place ? place.lastBaseline - place.firstBaseline : 0;
  const returnsLabelY = placeY + extraPlace + (isStory ? 84 : 58);
  const returnsStartY = returnsLabelY + (isStory ? 52 : 44);
  const returnRowH = isStory ? 72 : 48;

  const footRuleY = h - PAD - (isStory ? 54 : 44);
  const footY = h - PAD - 12;

  // The last return before today, then the ones still to come. Taking the first
  // few in date order showed an old record nothing but returns long gone.
  const thisYear = new Date().getFullYear();
  const pastReturns = moonReturns.filter((r) => r.year <= thisYear);
  const shownReturns = [
    ...pastReturns.slice(-1),
    ...moonReturns.filter((r) => r.year > thisYear),
  ]
    .slice(0, isStory ? 4 : 2)
    // Rows only go down while they clear the foot rule.
    .filter((_, i) => returnsStartY + i * returnRowH + 18 < footRuleY - 24);

  // Decorative, and the same on every card ever exported — see moon/starGrain.ts
  // for why a field that varied by record would be an astronomical claim.
  //
  // The blur scales with the field for the same reason the radii do: the card is
  // authored at output pixels, so a sigma in points would be a third of the
  // spread the screen shows. respectCTM then handles the preview transform on
  // top of that, which is why it is left at its default.
  const starScale = w / NOMINAL_WIDTH;
  const stars = generateStarField({
    width: inner,
    height: plateH,
    scale: starScale,
  });

  // The exported moon is shaded by the same fragment shader the app draws, from
  // the same uniforms. It used to be a second implementation of the two-arc
  // cutout, and a card that does not match the screen it was exported from is
  // the whole failure mode decision 13 is about.
  //
  // TWO INDEPENDENT ROTATIONS, as everywhere: the light follows the Sun, the
  // photograph follows the Moon's north pole.
  const moonUniforms = moonUniformsFor(
    {
      phaseFraction: moonPhaseFraction,
      waxing: moonWaxing,
      brightLimbAngleDeg,
      northAngleDeg,
    },
    moonCX,
    moonCY,
    moonR,
    "hero",
    // The card is authored at its output width, so one card unit is one pixel.
    1 / moonR
  );

  return (
    <Canvas ref={ref as any} style={{ width: w * scale, height: h * scale }}>
      <Group transform={[{ scale }]}>
        <Fill color={Colors.paper} />

        {/* ---- Masthead ---- */}
        <SkiaText x={PAD} y={wordmarkY} text="TRACE" font={monoSmall} color={Colors.ink} />
        <SkiaText
          x={w - PAD - monoSmall.measureText(`${day}.${month}`).width}
          y={wordmarkY}
          text={`${day}.${month}`}
          font={monoSmall}
          color={Colors.inkMuted}
        />
        {/* A hairline, not the old 6px ink bar. The name below carries the page. */}
        <Rect x={PAD} y={ruleY} width={inner} height={2} color={Colors.rule} />

        {/* ---- Title ---- */}
        <Paragraph paragraph={title.paragraph} x={PAD} y={titleTop} width={inner} />
        <SkiaText
          x={PAD}
          y={dateY}
          text={`${day}.${month}.${year}`}
          font={monoFont}
          color={Colors.signal}
        />

        {/* ---- Moon plate ---- */}
        <RoundedRect
          x={PAD}
          y={plateY}
          width={inner}
          height={plateH}
          r={plateR}
          color={Colors.space}
        />

        {/* The same field the app's own plates draw, generated at the card's
            scale so the density and the star sizes relative to the moon come
            out identical. A card that does not match the screen it came from is
            the failure decision 13 is about, and that applies to the ground the
            moon sits on as much as to the moon. Clipped to the plate, because
            the field is square and the plate's corners are not. */}
        <Group clip={rrect(rect(PAD, plateY, inner, plateH), plateR, plateR)}>
          <Group>
            <BlurMask blur={GLOW_BLUR * starScale} style="normal" />
            {stars.map((s, i) => (
              <Circle
                key={i}
                cx={PAD + s.x}
                cy={plateY + s.y}
                r={s.r * GLOW_RADIUS}
                color={s.color}
                opacity={s.a * GLOW_ALPHA}
              />
            ))}
          </Group>
          <Group>
            <BlurMask blur={CORE_BLUR * starScale} style="normal" />
            {stars.map((s, i) => (
              <Circle
                key={i}
                cx={PAD + s.x}
                cy={plateY + s.y}
                r={s.r}
                color={s.color}
                opacity={s.a}
              />
            ))}
          </Group>
        </Group>

        {/* The moon, lit as a sphere. The shader paints the disc and its halo
            in one pass over the plate, so the glow is a function of the same
            sun direction that lights the surface and can only fall on the
            illuminated limb. */}
        {moonEffect && moonImage && moonNormal && (
          <Rect x={PAD} y={plateY} width={inner} height={plateH}>
            <Shader source={moonEffect} uniforms={moonUniforms}>
              <ImageShader
                image={moonImage}
                fit="fill"
                rect={{
                  x: moonCX - moonR,
                  y: moonCY - moonR,
                  width: moonR * 2,
                  height: moonR * 2,
                }}
                tx="clamp"
                ty="clamp"
              />
              <ImageShader
                image={moonNormal}
                fit="fill"
                rect={{
                  x: moonCX - moonR,
                  y: moonCY - moonR,
                  width: moonR * 2,
                  height: moonR * 2,
                }}
                tx="clamp"
                ty="clamp"
              />
            </Shader>
          </Rect>
        )}

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

        {/* Where it was seen from. Absent records simply skip the line. */}
        {place && (
          <Paragraph
            paragraph={place.paragraph}
            x={PAD}
            y={placeY - place.firstBaseline}
            width={inner}
          />
        )}

        {/* ---- Recurrence table ---- */}
        {shownReturns.length > 0 && (
          <Group>
            <SkiaText
              x={PAD}
              y={returnsLabelY}
              text="When this sky comes back"
              font={bodyFont}
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
