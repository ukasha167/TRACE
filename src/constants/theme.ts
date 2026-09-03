/**
 * TRACE — Design System
 *
 * DIRECTION: Swiss / International Typographic Style, printed on paper.
 *
 * The reference is a printed astronomical atlas or an observatory record sheet:
 * bone paper, a strict grid, one grotesque doing all the work, hairline rules
 * as structure, and exactly one accent used sparingly. Hierarchy comes from
 * type SIZE and WEIGHT, never from decoration, shadows, or gradients.
 *
 * THE PLATE IDEA: reading surfaces are paper. Anything showing the actual sky —
 * moon glyphs, APOD photographs, the sky render — is a dark "plate" set into
 * that paper, the way images were tipped into printed books. The contrast is
 * deliberate and load-bearing: the atlas is paper, the sky is dark.
 *
 * RULE: text is never truncated. No numberOfLines, no ellipsis. Layouts must
 * grow to fit their content. A grid that clips its own text is a broken grid.
 */

// ---- Color ----
export const Colors = {
  /** Bone paper. The ground for every reading surface. */
  paper: "#F2EFE9",
  /** Slightly recessed paper, for inset blocks and alternating rows. */
  paperDim: "#E7E3DA",
  /** Near-black with a trace of warmth — never pure #000. Primary text. */
  ink: "#14140F",
  /** Secondary text, labels, captions. */
  inkMuted: "#6B6A61",
  /** Hairline rules. The main structural device. */
  rule: "#C9C4B8",

  /** Dark plate ground — for sky imagery set into the paper. */
  plate: "#14140F",
  /** Text on a plate. */
  plateInk: "#F2EFE9",
  /** Muted text on a plate. */
  plateMuted: "#8A887E",
  /** The moon itself, drawn on a plate. */
  moonlight: "#F7F3E4",
  /** Unlit portion of the moon disc (earthshine), a shade above the plate ground. */
  earthshine: "#24241C",
  /** Pitch black ground — for the night sky render and full-screen photography viewer. */
  space: "#000000",

  /**
   * The single accent. Signal red — the classic Swiss accent, and native to the
   * subject: observers use red light to preserve night vision. Used for rules,
   * return years, and active states. Never for large fills.
   */
  signal: "#D6301F",
} as const;

export type ColorToken = keyof typeof Colors;

// ---- Typography ----
/**
 * Archivo (grotesque) carries display and UI. JetBrains Mono carries every
 * number — dates, illumination, angles, years — so data reads as data.
 *
 * Fraunces is deliberately gone. A soft old-style serif is the opposite of this
 * brief; Swiss hierarchy comes from a single family at contrasting sizes.
 */
export const FontFamily = {
  thin: "Archivo_300Light",
  regular: "Archivo_400Regular",
  medium: "Archivo_500Medium",
  semibold: "Archivo_600SemiBold",
  bold: "Archivo_700Bold",
  black: "Archivo_900Black",
  mono: "JetBrainsMono_400Regular",
  monoMedium: "JetBrainsMono_500Medium",
} as const;

/**
 * Wide steps, not a gentle ramp. Swiss layouts get their tension from a big gap
 * between display and body, with very little in between.
 */
export const FontSize = {
  micro: 10,
  label: 11,
  small: 13,
  body: 15,
  lead: 18,
  heading: 24,
  title: 34,
  display: 48,
  mega: 68,
} as const;

/** Tight tracking on large type, wide on small caps labels. */
export const Tracking = {
  display: -1.6,
  title: -0.8,
  heading: -0.3,
  body: 0,
  label: 1.4,
} as const;

export const LineHeight = {
  display: 50,
  title: 38,
  heading: 28,
  lead: 26,
  body: 22,
  small: 19,
  label: 14,
} as const;

// ---- Grid ----
/** 8pt base. PAGE is the outer margin every screen shares. */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  xxl: 64,
  page: 24,
} as const;

/**
 * Corners stay near-square. Rounded cards read as generic app chrome; printed
 * plates have corners.
 */
export const Radius = {
  none: 0,
  sm: 2,
  plate: 3,
} as const;

// ---- Rules (the structural device) ----
export const Rule = {
  hair: { height: 1, backgroundColor: Colors.rule },
  ink: { height: 1, backgroundColor: Colors.ink },
  heavy: { height: 3, backgroundColor: Colors.ink },
  signal: { height: 3, backgroundColor: Colors.signal },
} as const;

// ---- Shared text roles ----
export const Type = {
  /** Small uppercase mono label. Pairs with a hairline rule beneath. */
  label: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.label,
    letterSpacing: Tracking.label,
    lineHeight: LineHeight.label,
    color: Colors.inkMuted,
    textTransform: "uppercase" as const,
  },
  display: {
    fontFamily: FontFamily.black,
    fontSize: FontSize.display,
    letterSpacing: Tracking.display,
    lineHeight: LineHeight.display,
    color: Colors.ink,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.title,
    letterSpacing: Tracking.title,
    lineHeight: LineHeight.title,
    color: Colors.ink,
  },
  heading: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.heading,
    letterSpacing: Tracking.heading,
    lineHeight: LineHeight.heading,
    color: Colors.ink,
  },
  lead: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.lead,
    lineHeight: LineHeight.lead,
    color: Colors.ink,
  },
  body: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.body,
    lineHeight: LineHeight.body,
    color: Colors.ink,
  },
  bodyMuted: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.body,
    lineHeight: LineHeight.body,
    color: Colors.inkMuted,
  },
  small: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.small,
    lineHeight: LineHeight.small,
    color: Colors.inkMuted,
  },
  /** Every number in the app. */
  data: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.body,
    color: Colors.ink,
  },
  dataSmall: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.small,
    color: Colors.inkMuted,
  },
} as const;

/** Zero-padded section numbers — 001, 002. A record-sheet device. */
export function sectionNumber(n: number): string {
  return String(n).padStart(3, "0");
}
