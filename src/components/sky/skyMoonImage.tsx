import React from "react";
import { Fill, Group, ImageShader, Shader, drawAsImage, type SkImage } from "@shopify/react-native-skia";
import { moonEffect } from "@/components/moon/moonShader";
import { moonUniforms, type MoonLight } from "@/components/moon/moonUniforms";
import type { MoonTextures } from "@/components/moon/moonTextures";
import { lru } from "@/lib/memo";
import type { MilestoneLocation } from "@/types";

/**
 * The moon's offscreen image: its size in pixels, and the disc's radius within it.
 *
 * 2048 so a moon zoomed to fill the screen still has a pixel of shading per
 * device pixel; it samples the full 1024px maps. It was 768 drawn from the 256px thumbnail
 * pair, which put a 256px texture across a 550px disc: the relief that makes a
 * moon read as a sphere was blurred out before the disc was even shrunk onto
 * the sky. It is drawn down through mipmaps, so the large image costs nothing
 * in sharpness at the small sizes the sky usually shows it at.
 */
export const MOON_IMG = 2048;
export const MOON_IMG_DISC = 0.33;

/**
 * THE SKY'S MOON, DRAWN ONCE PER PLACE AND INSTANT.
 *
 * Each draw shades 2048 px on the JS thread and reads 16 MB back off the GPU,
 * and the sky's entrance cannot start until it lands. It used to be drawn on
 * every open. Now the last four are kept, and Home and the record screen draw
 * the one their sky would open on while nothing else is happening, so a tap
 * opens a sky whose moon is already here.
 *
 * Four, because the image is 16 MB: the hero's sky, a record's, and the two
 * either side of a scrub.
 */
const images = lru<SkImage>(4);
const inFlight = new Map<string, Promise<SkImage | null>>();

export function skyMoonKey(place: Pick<MilestoneLocation, "latitude" | "longitude">, atMs: number): string {
  return `${place.latitude.toFixed(4)},${place.longitude.toFixed(4)},${atMs}`;
}

/** The image for `key` if it has been drawn, without drawing it. */
export function cachedSkyMoonImage(key: string): SkImage | null {
  return images.get(key) ?? null;
}

/** Draws the image for `key` once; later calls get the same promise or image. */
export function drawSkyMoonImage(key: string, light: MoonLight, textures: MoonTextures): Promise<SkImage | null> {
  const hit = images.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const effect = moonEffect;
  if (!effect) return Promise.resolve(null);
  const c = MOON_IMG / 2;
  const r = MOON_IMG * MOON_IMG_DISC;
  const rect = { x: c - r, y: c - r, width: r * 2, height: r * 2 };
  const promise = drawAsImage(
    <Group>
      <Fill>
        <Shader source={effect} uniforms={moonUniforms(light, c, c, r, "hero", 1 / r)}>
          <ImageShader image={textures.albedo} fit="fill" rect={rect} tx="clamp" ty="clamp" />
          <ImageShader image={textures.normal} fit="fill" rect={rect} tx="clamp" ty="clamp" />
        </Shader>
      </Fill>
    </Group>,
    { width: MOON_IMG, height: MOON_IMG }
  )
    .then((img) => {
      if (img) images.set(key, img);
      return img ?? null;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
