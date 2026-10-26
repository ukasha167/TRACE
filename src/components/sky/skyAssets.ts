import { useEffect, useState } from "react";
import { Skia, loadData, type SkFont, type SkImage } from "@shopify/react-native-skia";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { rasterImage } from "@/components/moon/moonTextures";

/**
 * THE SKY VIEW'S IMAGES AND LABEL FONT, LOADED ONCE PER RUN.
 *
 * The sky used to call `useImage` twice and `useFont` once, and Skia's hooks
 * keep no cache: every open read the 3840 x 3456 figure sheet and the Milky Way
 * off disk again, and the first draw decoded them on the UI thread. Each one
 * arriving was also a new dependency of the frame loop, so the loop started up
 * to four times on an open, and each restart reset the figure fades and the
 * eye's adaptation. Now they load together, decode to raster here on the
 * JS thread, and the sky gets all of them or none.
 */
const ART_SHEET = require("../../../assets/constellations/figures.png");
const MILKY_WAY = require("../../../assets/sky/milkyway.png");
const LANDSCAPE = require("../../../assets/sky/landscape.png");
const LABEL_SIZE = 11;

export interface SkyAssets {
  labelFont: SkFont;
  artSheet: SkImage;
  milkyWay: SkImage;
  landscape: SkImage;
}

let ready: SkyAssets | null = null;
let inFlight: Promise<SkyAssets | null> | null = null;

/** Starts the loads. Safe to call any number of times. */
export function preloadSkyAssets(): Promise<SkyAssets | null> {
  if (ready) return Promise.resolve(ready);
  if (inFlight) return inFlight;
  inFlight = Promise.all([
    loadData(JetBrainsMono_400Regular, (d) => Skia.Typeface.MakeFreeTypeFaceFromData(d)),
    loadData<SkImage>(ART_SHEET, rasterImage),
    loadData<SkImage>(MILKY_WAY, rasterImage),
    loadData<SkImage>(LANDSCAPE, rasterImage),
  ])
    .then(([typeface, artSheet, milkyWay, landscape]) => {
      if (!typeface || !artSheet || !milkyWay || !landscape) {
        inFlight = null;
        return null;
      }
      ready = { labelFont: Skia.Font(typeface, LABEL_SIZE), artSheet, milkyWay, landscape };
      return ready;
    })
    .catch(() => {
      inFlight = null;
      return null;
    });
  return inFlight;
}

/**
 * All of them, or null until they have loaded. After the first load every caller
 * gets them on its first render, so the frame loop starts once.
 */
export function useSkyAssets(): SkyAssets | null {
  const [assets, setAssets] = useState<SkyAssets | null>(ready);
  useEffect(() => {
    if (assets) return;
    let alive = true;
    preloadSkyAssets().then((a) => {
      if (alive && a) setAssets(a);
    });
    return () => {
      alive = false;
    };
  }, [assets]);
  return assets;
}
