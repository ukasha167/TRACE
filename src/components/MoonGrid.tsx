import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from "react-native";
import {
  Canvas,
  Circle,
  Fill,
  Group,
  ImageShader,
  Rect,
  Shader,
} from "@shopify/react-native-skia";
import { Colors, FontFamily, FontSize } from "@/constants/theme";
import { useMoonTextures } from "@/components/moon/moonTextures";
import { moonEffect } from "@/components/moon/moonShader";
import { moonUniforms, type MoonLight } from "@/components/moon/moonUniforms";

export interface MoonGridCell extends MoonLight {
  key: string;
  /** Printed under the moon: a year, usually. */
  label: string;
  /** Full, 99% or more: drawn with the wide hero bloom. */
  full?: boolean;
  /** A return year, ringed. */
  ring?: boolean;
  /** Still to come, drawn faded. */
  future?: boolean;
  accessibilityLabel?: string;
}

interface Props {
  cells: MoonGridCell[];
  columns: number;
  width: number;
  /** Disc diameter as a share of the cell width. */
  moonScale?: number;
  selectedKey?: string | null;
  onPressCell?: (key: string) => void;
}

const LABEL_H = 16;

/**
 * MANY MOONS, ONE CANVAS.
 *
 * A life-in-moons grid is thirty discs or more. As MoonPhaseGlyphs that is
 * thirty canvases and thirty surfaces, which is the cost the texture cache in
 * moonTextures exists to avoid in a different form. Here every disc is one
 * clipped fill of the same shader, with its own uniforms from moonUniforms, so
 * a cell and the glyph it opens into are lit by the same numbers.
 *
 * Labels are real text under the canvas rather than drawn into it, so they
 * follow the OS type size and read to a screen reader.
 */
export function MoonGrid({
  cells,
  columns,
  width,
  moonScale = 0.72,
  selectedKey = null,
  onPressCell,
}: Props) {
  const { fontScale } = useWindowDimensions();
  const cellW = width / columns;
  const moonSize = cellW * moonScale;
  const rows = Math.ceil(cells.length / columns);
  const cellH = cellW + LABEL_H * fontScale * Math.max(1, Math.ceil(FontSize.micro * fontScale * 2.5 / cellW));
  const textures = useMoonTextures(moonSize);

  const laid = useMemo(
    () =>
      cells.map((c, i) => {
        const col = i % columns;
        const row = Math.floor(i / columns);
        const x = col * cellW;
        const y = row * cellH;
        const cx = x + cellW / 2;
        const cy = y + cellW / 2;
        const r = moonSize / 2;
        return {
          cell: c,
          x,
          y,
          cx,
          cy,
          r,
          uniforms: moonUniforms(c, cx, cy, r, c.full ? "hero" : "tight"),
        };
      }),
    [cells, columns, cellW, cellH, moonSize]
  );

  return (
    <View style={{ width, height: rows * cellH }}>
      <Canvas style={{ width, height: rows * cellH }}>
        <Fill color={Colors.space} />
        {laid.map(({ cell, x, y, cx, cy, r, uniforms }) => (
          <Group key={cell.key} clip={{ x, y, width: cellW, height: cellW }}>
            {moonEffect && textures ? (
              <Fill>
                <Shader source={moonEffect} uniforms={uniforms}>
                  <ImageShader image={textures.albedo} fit="fill" rect={{ x: cx - r, y: cy - r, width: r * 2, height: r * 2 }} tx="clamp" ty="clamp" />
                  <ImageShader image={textures.normal} fit="fill" rect={{ x: cx - r, y: cy - r, width: r * 2, height: r * 2 }} tx="clamp" ty="clamp" />
                </Shader>
              </Fill>
            ) : (
              <Circle cx={cx} cy={cy} r={r} color={Colors.earthshine} />
            )}
            {cell.ring && (
              <Circle cx={cx} cy={cy} r={r + 4} style="stroke" strokeWidth={1.25} color={Colors.signalOnPlate} />
            )}
            {cell.future && <Rect x={x} y={y} width={cellW} height={cellW} color={Colors.space} opacity={0.5} />}
          </Group>
        ))}
        {/* Outside the cells' clips, which stop at the disc and would cut the
            outline's bottom edge off where it runs round the label. */}
        {laid
          .filter(({ cell }) => cell.key === selectedKey)
          .map(({ cell, x, y }) => (
            <Rect key={`sel-${cell.key}`} x={x + 1} y={y + 1} width={cellW - 2} height={cellH - 2} style="stroke" strokeWidth={1} color={Colors.signalOnPlate} />
          ))}
      </Canvas>

      {laid.map(({ cell, x, y }) => (
        <Pressable
          key={cell.key}
          disabled={!onPressCell}
          onPress={() => onPressCell?.(cell.key)}
          accessibilityRole={onPressCell ? "button" : "image"}
          accessibilityLabel={cell.accessibilityLabel ?? cell.label}
          style={[styles.hit, { left: x, top: y, width: cellW, height: cellH }]}
        >
          <Text style={[styles.label, { top: cellW - 2 }]}>
            {cell.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { position: "absolute" },
  label: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: FontFamily.mono,
    fontSize: FontSize.micro,
    color: Colors.plateMuted,
  },
});
