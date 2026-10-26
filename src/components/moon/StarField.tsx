import React, { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, type LayoutChangeEvent } from "react-native";
import { BlurStyle, Canvas, Picture, Skia, type SkPicture } from "@shopify/react-native-skia";
import { lru } from "@/lib/memo";
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
 * each pass with one mask filter for every star. See `starGrain.ts` for why the
 * spread is the same for every star, and for why the field itself never changes.
 *
 * RECORDED ONCE PER SIZE. The field was about 290 `<Circle>` elements, and the
 * reveal, the record plate and the hero each reconciled all of them on mount.
 * Now the circles go into one SkPicture, kept per size for the run, and the
 * canvas draws that. The mask filter is the one the declarative `<BlurMask>`
 * makes (`MaskFilter.MakeBlur(style, blur, respectCTM = true)`, see
 * sksg/Recorder/commands/ImageFilters.ts), so the pixels are the same.
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

  const picture = useMemo(() => (size ? starFieldPicture(size.w, size.h) : null), [size]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {size && picture && (
        <Canvas style={{ width: size.w, height: size.h }}>
          <Picture picture={picture} />
        </Canvas>
      )}
    </View>
  );
});

const pictures = lru<SkPicture>(6);

function starFieldPicture(width: number, height: number): SkPicture {
  return pictures.through(`${width.toFixed(1)}x${height.toFixed(1)}`, () => {
    const stars = generateStarField({ width, height });
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    const pass = (blur: number, radius: number, alpha: number) => {
      paint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, blur, true));
      for (const s of stars) {
        paint.setColor(Skia.Color(s.color));
        paint.setAlphaf(paint.getAlphaf() * s.a * alpha);
        canvas.drawCircle(s.x, s.y, s.r * radius, paint);
      }
    };
    pass(GLOW_BLUR, GLOW_RADIUS, GLOW_ALPHA);
    pass(CORE_BLUR, 1, 1);
    return recorder.finishRecordingAsPicture();
  });
}
