import { useEffect, useState } from "react";
import { Skia, loadData, type DataModule, type SkFont, type SkTypeface, type SkTypefaceFontProvider } from "@shopify/react-native-skia";
import {
  Newsreader_400Regular,
  Newsreader_400Regular_Italic,
  Newsreader_500Medium,
  Newsreader_600SemiBold,
} from "@expo-google-fonts/newsreader";
import { Figtree_400Regular } from "@expo-google-fonts/figtree";
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";

/**
 * THE SHARE CARDS' FONTS, LOADED ONCE PER RUN.
 *
 * Both cards called Skia's `useFonts` and `useFont`, which keep no cache: every
 * open of the share screen read every font file again and drew a blank card
 * until they arrived. The typefaces load once here, and the record screen
 * starts the load while it sits idle, so the card opens with its text.
 */

const typefaces = new Map<DataModule, Promise<SkTypeface | null>>();

function typeface(source: DataModule): Promise<SkTypeface | null> {
  let pending = typefaces.get(source);
  if (!pending) {
    pending = loadData(source, (d) => Skia.Typeface.MakeFreeTypeFaceFromData(d)).catch(() => null);
    pending.then((tf) => {
      if (!tf) typefaces.delete(source); // the next open tries again
    });
    typefaces.set(source, pending);
  }
  return pending;
}

async function provider(families: Record<string, DataModule[]>): Promise<SkTypefaceFontProvider | null> {
  const entries = Object.entries(families).flatMap(([family, sources]) => sources.map((s) => [family, s] as const));
  const loaded = await Promise.all(entries.map(([, s]) => typeface(s)));
  if (loaded.some((tf) => !tf)) return null;
  const mgr = Skia.TypefaceFontProvider.Make();
  loaded.forEach((tf, i) => mgr.registerFont(tf!, entries[i][0]));
  return mgr;
}

export interface ExportCardFonts {
  paragraphs: SkTypefaceFontProvider;
  head: SkFont;
  body: SkFont;
  mono: SkFont;
  monoSmall: SkFont;
}

/** A value built once, by whoever asks first, and handed to everyone after. */
function once<T>(build: () => Promise<T | null>) {
  let value: T | null = null;
  let pending: Promise<T | null> | null = null;
  return {
    get: () => value,
    load(): Promise<T | null> {
      pending ??= build()
        .then((v) => {
          value = v;
          if (!v) pending = null;
          return v;
        })
        .catch(() => {
          pending = null;
          return null;
        });
      return pending;
    },
  };
}

const nightCard = once(() =>
  provider({
    Newsreader: [Newsreader_400Regular, Newsreader_600SemiBold, Newsreader_400Regular_Italic],
    Figtree: [Figtree_400Regular],
    JetBrainsMono: [JetBrainsMono_400Regular],
  })
);

const exportCard = once(async (): Promise<ExportCardFonts | null> => {
  const [paragraphs, head, body, mono, monoSmall] = await Promise.all([
    // The name and the place wrap, so they are set as paragraphs, which need
    // the typefaces registered with a provider rather than loaded as single fonts.
    provider({ Newsreader: [Newsreader_600SemiBold], Figtree: [Figtree_400Regular] }),
    typeface(Newsreader_500Medium),
    typeface(Figtree_400Regular),
    typeface(JetBrainsMono_500Medium),
    typeface(JetBrainsMono_400Regular),
  ]);
  if (!paragraphs || !head || !body || !mono || !monoSmall) return null;
  return {
    paragraphs,
    head: Skia.Font(head, 46),
    body: Skia.Font(body, 32),
    mono: Skia.Font(mono, 34),
    monoSmall: Skia.Font(monoSmall, 26),
  };
});

/** Starts both cards' loads. Called by the record screen at idle. */
export function preloadCardFonts(): void {
  nightCard.load();
  exportCard.load();
}

function useOnce<T>(source: ReturnType<typeof once<T>>): T | null {
  const [value, setValue] = useState<T | null>(source.get);
  useEffect(() => {
    if (value) return;
    let alive = true;
    source.load().then((v) => {
      if (alive && v) setValue(v);
    });
    return () => {
      alive = false;
    };
  }, [source, value]);
  return value;
}

export const useNightCardFonts = () => useOnce(nightCard);
export const useExportCardFonts = () => useOnce(exportCard);
