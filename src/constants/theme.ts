/**
 * Celestial Archive — Design System
 * Spec §11: Cyanotype/blueprint direction. Not a generic dark-mode space app.
 * Reference point: historical star charts, cyanotype botanical plates, blueprint documentation.
 */

// ---- Color Tokens ----
export const Colors = {
  /** Primary background, nearly everywhere. Deep Prussian blue — not black. */
  blueprint: "#14213D",
  /** Secondary surfaces, card backgrounds, dividers. */
  cyanotype: "#6E8CB0",
  /** Inset surface (ledger rows, text-safe export zones). Used sparingly — never dominant. */
  parchment: "#EDE6D8",
  /** Moon-phase illustration + light-travel numerals. Warm gold = moonlight/starlight. */
  starlight: "#F4E9C1",
  /**
   * The single interactive accent: buttons, moon-phase glyph outline, key data callouts.
   * Red reference: astronomers use red light to preserve night vision.
   */
  ember: "#C1553A",
  /** High-contrast text on parchment/starlight surfaces. */
  ink: "#0C1524",
  /** Deeper variant of blueprint for subtle depth on cards. */
  blueprintDark: "#0C1524",
  /** Lighter blueprint for surface overlays. */
  blueprintLight: "#1E3057",
} as const;

export type ColorToken = keyof typeof Colors;

// ---- Typography ----
/** Font family names — must match the loaded font names from @expo-google-fonts */
export const FontFamily = {
  /** Fraunces: Display / headlines / milestone titles. Soft old-style serif. */
  display: "Fraunces_400Regular",
  displayItalic: "Fraunces_400Regular_Italic",
  displaySemiBold: "Fraunces_600SemiBold",
  displayBold: "Fraunces_700Bold",
  /** Manrope: Body / UI / data labels. Geometric humanist sans. */
  sans: "Manrope_400Regular",
  sansLight: "Manrope_300Light",
  sansMedium: "Manrope_500Medium",
  sansSemiBold: "Manrope_600SemiBold",
  sansBold: "Manrope_700Bold",
  /** JetBrains Mono: Numeric data (distances, dates, coordinates). */
  mono: "JetBrainsMono_400Regular",
  monoMedium: "JetBrainsMono_500Medium",
} as const;

// ---- Spacing — 8pt scale ----
export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const;

// ---- Border radius ----
export const Radius = {
  /** Data chips, tags */
  sm: 4,
  /** Cards */
  md: 16,
  /** Full pill — use sparingly */
  full: 9999,
} as const;

// ---- Typography scale ----
export const FontSize = {
  xs:   11,
  sm:   13,
  md:   15,
  lg:   17,
  xl:   22,
  xxl:  28,
  hero: 40,
} as const;

// ---- Common style helpers ----
export const divider = {
  height: 1,
  backgroundColor: Colors.cyanotype,
  opacity: 0.3,
} as const;
