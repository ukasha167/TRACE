import React from "react";
import {
  Canvas,
  useCanvasRef,
  useFonts,
  BlurMask,
  Circle,
  Fill,
  Group,
  Paragraph,
  Rect,
  Skia,
  FontWeight,
  FontSlant,
  TextAlign,
  Shader,
  ImageShader,
  type SkParagraph,
  type SkTypefaceFontProvider,
} from "@shopify/react-native-skia";
import {
  Newsreader_400Regular,
  Newsreader_400Regular_Italic,
  Newsreader_600SemiBold,
} from "@expo-google-fonts/newsreader";
import { Figtree_400Regular } from "@expo-google-fonts/figtree";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
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
import { moonUniforms, type MoonLight } from "@/components/moon/moonUniforms";
import { useMoonTextures } from "@/components/moon/moonTextures";
import { CARD_SIZES, type CardFormat } from "./ExportCardCanvas";

interface Props {
  title: string;
  /** "20 January 2000 · Lisbon" */
  whenWhere: string;
  /** "Full Moon, 99.9% lit" */
  phaseLine: string;
  /** One fact about that night, when the record has a place. */
  fact: string | null;
  /** "The moon comes back in 2038 and 2057." */
  returns: string | null;
  /** The sender's own line, if they wrote one. */
  dedication: string | null;
  /** "38.72° N, 9.14° W", when known. */
  coords: string | null;
  moon: MoonLight;
  format: CardFormat;
  previewWidth: number;
}

const TITLE_SIZES: Record<CardFormat, number[]> = {
  story: [100, 88, 76, 66],
  square: [80, 70, 60, 52],
};

function set(
  text: string,
  fonts: SkTypefaceFontProvider,
  family: string,
  size: number,
  color: string,
  width: number,
  opts: { weight?: FontWeight; italic?: boolean; spacing?: number } = {}
): SkParagraph {
  const p = Skia.ParagraphBuilder.Make({ textAlign: TextAlign.Center }, fonts)
    .pushStyle({
      color: Skia.Color(color),
      fontFamilies: [family],
      fontSize: size,
      fontStyle: {
        weight: opts.weight ?? FontWeight.Normal,
        slant: opts.italic ? FontSlant.Italic : FontSlant.Upright,
      },
      letterSpacing: opts.spacing ?? 0,
      heightMultiplier: 1.18,
    })
    .addText(text)
    .pop()
    .build();
  p.layout(width);
  return p;
}

/**
 * THE NIGHT CARD, picked in the prototype over paper, star map and life in moons.
 *
 * The whole card is the night: black to the edges, the same star grain every
 * plate in the app draws, the moon large at its real phase and tilt, and the
 * words set under it in the plate's own inks. It reads as a photograph of that
 * sky with a caption, where the paper card reads as a page.
 *
 * Every line is a paragraph and wraps; a name, a place or a dedication of any
 * length grows the text block rather than running off the card. The square
 * format drops the fact and the returns before it would crowd the moon, and a
 * dropped line is dropped whole.
 */
export const NightCardCanvas = React.forwardRef<
  ReturnType<typeof useCanvasRef>["current"],
  Props
>(function NightCardCanvas(
  { title, whenWhere, phaseLine, fact, returns, dedication, coords, moon, format, previewWidth },
  ref
) {
  const { w, h } = CARD_SIZES[format];
  const scale = previewWidth / w;
  const isStory = format === "story";

  const fonts = useFonts({
    Newsreader: [Newsreader_400Regular, Newsreader_600SemiBold, Newsreader_400Regular_Italic],
    Figtree: [Figtree_400Regular],
    JetBrainsMono: [JetBrainsMono_400Regular],
  });
  const textures = useMoonTextures(w);

  if (!fonts) {
    return (
      <Canvas ref={ref as any} style={{ width: w * scale, height: h * scale }}>
        <Fill color={Colors.space} />
      </Canvas>
    );
  }

  const PAD = 80;
  const inner = w - PAD * 2;

  const moonR = isStory ? w * 0.29 : w * 0.17;
  const moonCX = w / 2;
  const moonCY = isStory ? h * 0.3 : h * 0.26;

  // ---- The text block, top down from under the moon's glow ----
  let titleP: SkParagraph | null = null;
  for (const size of TITLE_SIZES[format]) {
    titleP = set(title, fonts, "Newsreader", size, Colors.plateInk, inner, { weight: FontWeight.SemiBold });
    if (titleP.getLineMetrics().length <= 2) break;
  }
  const blocks: { p: SkParagraph; gap: number }[] = [
    { p: titleP!, gap: 0 },
    { p: set(whenWhere.toUpperCase(), fonts, "JetBrainsMono", isStory ? 30 : 24, Colors.signalOnPlate, inner, { spacing: 2 }), gap: isStory ? 28 : 18 },
    { p: set(phaseLine, fonts, "Figtree", isStory ? 36 : 30, Colors.plateInk, inner), gap: isStory ? 22 : 14 },
  ];
  const optional = [
    fact ? { p: set(fact, fonts, "Newsreader", isStory ? 40 : 32, Colors.plateMuted, inner), gap: isStory ? 44 : 26 } : null,
    returns ? { p: set(returns, fonts, "Figtree", isStory ? 32 : 26, Colors.signalOnPlate, inner), gap: isStory ? 30 : 18 } : null,
    dedication ? { p: set(dedication, fonts, "Newsreader", isStory ? 44 : 36, Colors.plateInk, inner, { italic: true }), gap: isStory ? 56 : 30 } : null,
  ];

  const top = moonCY + moonR * 1.32 + (isStory ? 60 : 36);
  const footY = h - PAD;
  const limit = footY - (isStory ? 70 : 54);
  let y = top;
  const placed: { p: SkParagraph; y: number }[] = [];
  for (const b of blocks) {
    y += b.gap;
    placed.push({ p: b.p, y });
    y += b.p.getHeight();
  }
  // Optional lines go down only while they fit above the foot; the dedication
  // outranks the fact and the returns, since the sender wrote it.
  const order = [optional[2], optional[0], optional[1]];
  const fits = new Set<number>();
  let used = y;
  for (const o of order) {
    if (!o) continue;
    if (used + o.gap + o.p.getHeight() <= limit) {
      fits.add(optional.indexOf(o));
      used += o.gap + o.p.getHeight();
    }
  }
  for (let i = 0; i < optional.length; i++) {
    const o = optional[i];
    if (!o || !fits.has(i)) continue;
    y += o.gap;
    placed.push({ p: o.p, y });
    y += o.p.getHeight();
  }

  const foot = set("TRACE", fonts, "JetBrainsMono", isStory ? 24 : 20, Colors.plateMuted, inner, { spacing: 4 });
  const footCoords = coords ? set(coords, fonts, "JetBrainsMono", isStory ? 22 : 18, Colors.plateMuted, inner) : null;

  // The grain every plate draws, at the card's own scale.
  const starScale = w / NOMINAL_WIDTH;
  const stars = generateStarField({ width: w, height: h, scale: starScale });
  const uniforms = moonUniforms(moon, moonCX, moonCY, moonR, "hero", 1 / moonR);
  const halo = moonR * 2;

  return (
    <Canvas ref={ref as any} style={{ width: w * scale, height: h * scale }}>
      <Group transform={[{ scale }]}>
        <Fill color={Colors.space} />
        <Group>
          <BlurMask blur={GLOW_BLUR * starScale} style="normal" />
          {stars.map((s, i) => (
            <Circle key={i} cx={s.x} cy={s.y} r={s.r * GLOW_RADIUS} color={s.color} opacity={s.a * GLOW_ALPHA} />
          ))}
        </Group>
        <Group>
          <BlurMask blur={CORE_BLUR * starScale} style="normal" />
          {stars.map((s, i) => (
            <Circle key={i} cx={s.x} cy={s.y} r={s.r} color={s.color} opacity={s.a} />
          ))}
        </Group>

        {/* The moon, from the same shader and uniforms as every moon in the app. */}
        {moonEffect && textures && (
          <Rect x={moonCX - halo} y={moonCY - halo} width={halo * 2} height={halo * 2}>
            <Shader source={moonEffect} uniforms={uniforms}>
              <ImageShader image={textures.albedo} fit="fill" rect={{ x: moonCX - moonR, y: moonCY - moonR, width: moonR * 2, height: moonR * 2 }} tx="clamp" ty="clamp" />
              <ImageShader image={textures.normal} fit="fill" rect={{ x: moonCX - moonR, y: moonCY - moonR, width: moonR * 2, height: moonR * 2 }} tx="clamp" ty="clamp" />
            </Shader>
          </Rect>
        )}

        {placed.map((b, i) => (
          <Paragraph key={i} paragraph={b.p} x={PAD} y={b.y} width={inner} />
        ))}

        <Paragraph paragraph={foot} x={PAD} y={footY - foot.getHeight() - (footCoords ? footCoords.getHeight() + 6 : 0)} width={inner} />
        {footCoords && <Paragraph paragraph={footCoords} x={PAD} y={footY - footCoords.getHeight()} width={inner} />}
      </Group>
    </Canvas>
  );
});
