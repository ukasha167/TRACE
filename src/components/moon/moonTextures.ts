import { useEffect, useState } from "react";
import { PixelRatio } from "react-native";
import { Skia, loadData, type SkData, type SkImage } from "@shopify/react-native-skia";

/**
 * THE MOON'S TWO MAPS, DECODED ONCE PER RUN.
 *
 * Every MoonPhaseGlyph used to call `useImage` twice, and Skia's `useImage`
 * keeps no cache: each call fetches the file and decodes it again. Home with ten
 * records decoded 22 maps at 1024px, about 8 MB of pixels per moon, and the
 * ledger decoded them again whenever a row scrolled back into its window. That
 * is why moons popped in after the rows around them. The maps never change, so
 * they are decoded once and every glyph draws from the same SkImage.
 *
 * TWO SIZES. A moon drawn at SMALL_MAX_PX device pixels or less uses the 256px
 * pair from scripts/build-moon-thumbs.mjs. A 1024px map squeezed into a 36pt
 * thumbnail through a filter with no mipmaps reads one texel in ten and shimmers,
 * so the small pair is sharper there as well as cheaper.
 */
const SOURCES = {
  full: {
    albedo: require("../../../assets/moon_disc.png"),
    normal: require("../../../assets/moon_normal.png"),
  },
  small: {
    albedo: require("../../../assets/moon_disc_256.png"),
    normal: require("../../../assets/moon_normal_256.png"),
  },
} as const;

export type MoonTextureTier = keyof typeof SOURCES;

export interface MoonTextures {
  albedo: SkImage;
  normal: SkImage;
}

/**
 * The 256px map stretched past one and a half times its size starts to soften,
 * so anything larger takes the full pair.
 */
const SMALL_MAX_PX = 384;

const ready = new Map<MoonTextureTier, MoonTextures>();
const inFlight = new Map<MoonTextureTier, Promise<MoonTextures | null>>();

/**
 * Decodes now rather than at first draw. `MakeImageFromEncoded` returns a lazy
 * image that Skia decodes when something first samples it, which is the UI
 * thread mid-frame: Home's hero decoded two 1024px maps in its first frame.
 * RN Skia's `makeNonTextureImage` calls `makeRasterImage`
 * (cpp/api/JsiSkImage.h), which forces the decode on the calling thread.
 */
export function rasterImage(data: SkData): SkImage | null {
  const lazy = Skia.Image.MakeImageFromEncoded(data);
  if (!lazy) return null;
  try {
    return lazy.makeNonTextureImage() ?? lazy;
  } catch {
    // No GPU context yet. The lazy image still draws; it decodes late.
    return lazy;
  }
}

function load(tier: MoonTextureTier): Promise<MoonTextures | null> {
  const existing = inFlight.get(tier);
  if (existing) return existing;

  const source = SOURCES[tier];
  const promise = Promise.all([
    loadData<SkImage>(source.albedo, rasterImage),
    loadData<SkImage>(source.normal, rasterImage),
  ])
    .then(([albedo, normal]) => {
      if (!albedo || !normal) {
        // Forget the failure so the next glyph to mount tries again.
        inFlight.delete(tier);
        return null;
      }
      const textures = { albedo, normal };
      ready.set(tier, textures);
      return textures;
    })
    .catch(() => {
      inFlight.delete(tier);
      return null;
    });

  inFlight.set(tier, promise);
  return promise;
}

/** The pair for `sizePt`, decoded, for code that draws outside a component. */
export function loadMoonTextures(sizePt: number): Promise<MoonTextures | null> {
  const tier = moonTextureTier(sizePt);
  const decoded = ready.get(tier);
  return decoded ? Promise.resolve(decoded) : load(tier);
}

/** Which pair a moon drawn `sizePt` points across should sample. */
export function moonTextureTier(sizePt: number): MoonTextureTier {
  return sizePt * PixelRatio.get() <= SMALL_MAX_PX ? "small" : "full";
}

/**
 * Starts both decodes. Called once at launch so the first moon has its maps
 * waiting; the splash holds for the returned promise, up to a cap.
 */
export function preloadMoonTextures(): Promise<void> {
  return Promise.all([load("full"), load("small")]).then(() => undefined);
}

/**
 * The maps for a moon drawn `sizePt` points across, or null until they decode.
 *
 * Once a pair has decoded, every later glyph gets it on its first render, so a
 * row scrolling back into view draws its moon in the same frame as its text.
 */
export function useMoonTextures(sizePt: number): MoonTextures | null {
  const tier = moonTextureTier(sizePt);
  const [state, setState] = useState(() => ({
    tier,
    textures: ready.get(tier) ?? null,
  }));

  useEffect(() => {
    let alive = true;
    const decoded = ready.get(tier);
    if (decoded) {
      setState((prev) =>
        prev.textures === decoded ? prev : { tier, textures: decoded }
      );
      return;
    }
    load(tier).then((textures) => {
      if (alive && textures) setState({ tier, textures });
    });
    return () => {
      alive = false;
    };
  }, [tier]);

  return state.textures;
}
