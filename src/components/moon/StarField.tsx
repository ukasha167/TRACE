import React, { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, type LayoutChangeEvent } from "react-native";
import { BlurMask, Canvas, Circle, Group } from "@shopify/react-native-skia";
import {
  CORE_BLUR,
  GLOW_ALPHA,
  GLOW_BLUR,
  GLOW_RADIUS,
  generateStarField,
} from "./starGrain";

/**
 * The star field as a layer: absolutely filling its parent, behind everything
 * else in it, and inert to touch.
 *
 * SIZED FROM LAYOUT rather than from props, because the two plates that use it
 * know their size in different ways — the record's plate computes its height
 * from the moon, and the home hero's height falls out of the text under it.
 * Passing dimensions down would mean the hero measuring itself and re-rendering
 * the whole plate; measuring here keeps the extra render inside this component,
 * where it costs one canvas.
 *
 * It must be the FIRST child of the plate. Absolute siblings paint in order, so
 * a later one would put the stars over the moon.
 *
 * TWO PASSES, ONE BLUR EACH. The halo goes down first and the core sits on it,
 * and both take the mask filter from their group rather than carrying one
 * apiece, so the whole field is four draw calls' worth of state rather than two
 * per star. See `starGrain.ts` for why the spread is the same for every star,
 * and for why the field itself never changes.
 *
 * MEMOISED, and it takes no props so that is absolute. Blurred draws are the one
 * genuinely non-trivial thing on this canvas, and there is no reason to repeat
 * them because the plate above re-rendered for a scroll or a store write. The
 * field only changes when the plate resizes.
 */
export const StarField = React.memo(function StarField() {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) =>
      // Sub-point layout jitter would otherwise regenerate the field and repaint
      // the canvas for a change nobody can see.
      prev && Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1
        ? prev
        : { w: width, h: height }
    );
  }, []);

  const stars = useMemo(
    () => (size ? generateStarField({ width: size.w, height: size.h }) : []),
    [size]
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {size && (
        <Canvas style={{ width: size.w, height: size.h }}>
          <Group>
            <BlurMask blur={GLOW_BLUR} style="normal" />
            {stars.map((s, i) => (
              <Circle
                key={i}
                cx={s.x}
                cy={s.y}
                r={s.r * GLOW_RADIUS}
                color={s.color}
                opacity={s.a * GLOW_ALPHA}
              />
            ))}
          </Group>
          <Group>
            <BlurMask blur={CORE_BLUR} style="normal" />
            {stars.map((s, i) => (
              <Circle
                key={i}
                cx={s.x}
                cy={s.y}
                r={s.r}
                color={s.color}
                opacity={s.a}
              />
            ))}
          </Group>
        </Canvas>
      )}
    </View>
  );
});
