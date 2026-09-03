/**
 * TRACE design system
 *
 * DIRECTION: Keepsake / Nocturne.
 *
 * Two materials, and the contrast between them carries the whole app.
 *
 * PAPER is where the words live: warm bone stock, a serif for anything a person
 * wrote or was named, generous leading, hairlines that guide rather than divide.
 * The reference is a letterpress book of hours, not a lab printout.
 *
 * PLATE is where the sky lives: deep warm ink, the moon and the star field set
 * into it the way figures were tipped into printed books. On the home screen the
 * plate is the hero and takes the top of the page; everywhere else it is an
 * inset. Reading surfaces are never dark, sky surfaces are never light.
 *
 * WHAT CHANGED FROM THE PREVIOUS SYSTEM, AND WHY
 *
 * The old direction was Swiss / International Typographic Style: Archivo Black,
 * uppercase monospace labels, signal red, square corners, hairline rules. It was
 * internally consistent and it was the wrong register. Three specific failures:
 *
 *   1. Uppercase mono was the app's speaking voice. That is the typography of
 *      terminals and receipts. This app records the people someone loves.
 *   2. Signal red sat on every date. Red is the alarm colour everywhere else on
 *      a phone, so a birthday read as an error rather than as emphasis.
 *   3. Square corners plus hairlines read as unstyled to anyone not already
 *      fluent in Swiss design. Rigour was landing as absence.
 *
 * THREE RULES THAT SURVIVE UNCHANGED
 *
 *   - Mono carries every number, so data reads as data.
 *   - Text is NEVER truncated. No numberOfLines, no ellipsis. Layouts grow.
 *   - Phase labels stay honest and always ship the exact percentage (§6.2).
 */

// ---- Color ----
export const Colors = {
  /** Warm bone stock. The ground for every reading surface. */
  paper: "#F5F0E6",
  /** Recessed paper, for inset blocks, empty thumbnails and pressed states. */
  paperDim: "#EAE3D3",
  /** Warm near-black. Primary text. Never pure #000. */
  ink: "#211D16",
  /** Secondary text, captions, resolved values. */
  inkMuted: "#7E7566",
  /** Hairlines between rows. Softer than the old rule, so it guides rather than divides. */
  rule: "#DED5C3",

  /** Deep warm ink. The plate ground for anything showing sky. */
  plate: "#14110C",
  /** Text on a plate. */
  plateInk: "#F0E6D2",
  /** Muted text on a plate. */
  plateMuted: "#8E8168",
  /** The moon itself, drawn on a plate. */
  moonlight: "#F4E8CE",
  /** Unlit disc (earthshine), a whisper above the plate ground. */
  earthshine: "#1A160F",
  /** Hairlines and outlined buttons ON a plate. The dark counterpart to `rule`. */
  plateRule: "#4A412F",
  /** Pitch black. The immersive sky and the full-screen image viewer only. */
  space: "#000000",

  /**
   * The single accent: aged brass.
   *
   * It replaces signal red, which was borrowed from Swiss print convention and
   * from red observing torches. Both are true and neither survives contact with
   * a phone, where red means something is wrong. Brass is warm, quiet, reads as
   * gilding on a printed page, and sits naturally beside moonlight.
   */
  signal: "#A8763E",
  /**
   * Brass lifted for dark grounds. #A8763E is legible on paper and muddy on the
   * plate, so anything accented on a dark surface uses this instead. Using the
   * paper value on a plate is the most likely mistake here.
   */
  signalOnPlate: "#C79A55",

  /**
   * Destructive actions and validation errors only.
   *
   * A muted brick rather than a pure red. It exists because the accent stopped
   * being red: brass now means "this is the important figure", so it cannot
   * also mean "this will delete something". One colour cannot carry both jobs.
   */
  danger: "#8E3B2E",
} as const;

export type ColorToken = keyof typeof Colors;

/**
 * The planetarium palette.
 *
 * These live apart from `Colors` because they answer to physics rather than to
 * the design direction: they are chosen so faint structure separates from stars
 * on a pitch-black ground without ever competing with the moonlight the stars
 * are drawn in. Changing the app's accent must not change these, because a brass
 * constellation line would read as a real object.
 *
 * They were inline hex literals in the sky renderer, which broke the one-source
 * rule and made them invisible to anyone reading the design system.
 */
export const SkyColors = {
  /** Alt/az grid rings and meridians. Kept at very low alpha by the renderer. */
  grid: "#7FB0D0",
  /** Constellation figure lines. Same hue as the grid, drawn slightly stronger. */
  figure: "#7FB0D0",
  /** The horizon ring, the one line in the view that marks the ground. */
  horizon: "#C9C4B8",
  /** Messier objects. Green-cyan so a galaxy never reads as another star. */
  deepSky: "#9BE0C8",
  /** Star and body names. Cool grey-blue, quieter than the stars themselves. */
  label: "#93A7B4",
} as const;

// ---- Typography ----
/**
 * Three roles, three faces, and each one has a job it does not share:
 *
 *   Newsreader (serif).     Names, titles, headlines. Anything a person wrote
 *                            or is called. This is the voice of the app.
 *   Figtree (grotesque).    Interface. Labels, body copy, buttons, captions.
 *   JetBrains Mono.         Every figure. Dates, percentages, angles, years.
 *
 * Archivo is gone. A grotesque at Black weight was doing display duty, which is
 * what made the app read as a poster rather than a record.
 *
 * The `regular`/`medium`/`bold` keys are Figtree and carry the UI. Anything
 * named `serif*` is Newsreader. Reach for serif when the string is a name.
 */
export const FontFamily = {
  // Newsreader, the voice
  serifLight: "Newsreader_300Light",
  serif: "Newsreader_400Regular",
  serifMedium: "Newsreader_500Medium",
  serifSemibold: "Newsreader_600SemiBold",

  // Figtree, the interface
  thin: "Figtree_300Light",
  regular: "Figtree_400Regular",
  medium: "Figtree_500Medium",
  semibold: "Figtree_600SemiBold",
  bold: "Figtree_700Bold",
  black: "Figtree_800ExtraBold",

  // JetBrains Mono, the figures
  mono: "JetBrainsMono_400Regular",
  monoMedium: "JetBrainsMono_500Medium",
} as const;

/**
 * A gentler ramp than the Swiss scale it replaces. The old one deliberately
 * left a hole between display and body to create tension; here the steps are
 * even, because a keepsake wants continuity rather than tension.
 */
export const FontSize = {
  micro: 10,
  label: 11,
  small: 13,
  body: 15,
  lead: 18,
  heading: 22,
  title: 30,
  display: 40,
  mega: 56,
} as const;

/**
 * Tracking relaxes across the board. -1.6 at display was tightening a grotesque
 * into a wordmark; a serif at display size wants close to its natural fit.
 */
export const Tracking = {
  display: -0.7,
  title: -0.4,
  heading: -0.2,
  body: 0,
  /** Uppercase labels, now set in Figtree rather than mono. */
  label: 1.1,
} as const;

/** Leading opens roughly 15% against the old scale. Air is most of the softness. */
export const LineHeight = {
  display: 46,
  title: 36,
  heading: 28,
  lead: 26,
  body: 24,
  small: 20,
  label: 14,
} as const;

// ---- Grid ----
/** 8pt base. `page` is the outer margin every screen shares. */
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
 * Corners are soft now.
 *
 * The old system pinned everything at 0–3px on the reasoning that rounded cards
 * read as generic app chrome. True in isolation, and it cost more than it
 * bought: square corners plus hairlines are what made the build look like a
 * prototype. Radius here is graded by how large the surface is, so a 14px plate
 * and a 22px hero stay in proportion rather than all sharing one value.
 */
export const Radius = {
  none: 0,
  sm: 8,
  /** Inset plates: moon thumbnails, APOD images, small dark blocks. */
  plate: 14,
  /** The big surfaces: the home hero, full-bleed plates. */
  hero: 22,
  /** Buttons and chips. */
  pill: 999,
} as const;

// ---- Rules ----
/*
 * There is no Rule token object any more. The old system exported hair/ink/heavy
 * presets because rules WERE the structure; nothing imported them once space and
 * material took that job, and the 3px ink rule they existed to standardise is
 * gone. Rows now use `borderBottomColor: Colors.rule` directly, and dark
 * surfaces use Colors.plateRule.
 */

// ---- Motion ----
/**
 * The old system had no motion at all, and stillness was reading as absence
 * rather than as restraint. Two gestures, used everywhere, and nothing else:
 * things arrive by rising a little and fading in, and the moon settles.
 *
 * Keep it to these. Scattered one-off animations are what make an interface
 * feel busy rather than alive.
 */
export const Motion = {
  /** Standard arrival. */
  duration: 420,
  /** The hero moon, which should feel slower than the text around it. */
  durationSlow: 620,
  /** Per-item stagger for lists. Small enough that a long list still settles fast. */
  stagger: 55,
  /** How far an arriving element rises, in points. */
  rise: 10,
} as const;

// ---- Shared text roles ----
export const Type = {
  /**
   * Small uppercase label. Figtree, not mono. That single swap is most of what
   * separates this system from the record-sheet one it replaces.
   */
  label: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.label,
    letterSpacing: Tracking.label,
    lineHeight: LineHeight.label,
    color: Colors.inkMuted,
    textTransform: "uppercase" as const,
  },

  // ---- The serif voice: names, titles, headlines ----
  /** A record title at full size. The largest type on any screen. */
  display: {
    fontFamily: FontFamily.serif,
    fontSize: FontSize.display,
    letterSpacing: Tracking.display,
    lineHeight: LineHeight.display,
    color: Colors.ink,
  },
  title: {
    fontFamily: FontFamily.serif,
    fontSize: FontSize.title,
    letterSpacing: Tracking.title,
    lineHeight: LineHeight.title,
    color: Colors.ink,
  },
  heading: {
    fontFamily: FontFamily.serif,
    fontSize: FontSize.heading,
    letterSpacing: Tracking.heading,
    lineHeight: LineHeight.heading,
    color: Colors.ink,
  },
  /** A serif line on a dark plate. */
  headingOnPlate: {
    fontFamily: FontFamily.serif,
    fontSize: FontSize.heading,
    letterSpacing: Tracking.heading,
    lineHeight: LineHeight.heading,
    color: Colors.plateInk,
  },

  // ---- The interface voice ----
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
  smallOnPlate: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.small,
    lineHeight: LineHeight.small,
    color: Colors.plateMuted,
  },

  // ---- Figures ----
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
  /** A figure carrying the accent, such as illumination or a return year. */
  dataAccent: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.body,
    color: Colors.signal,
  },
} as const;

/**
 * Dates in prose: "27 October 2004".
 *
 * The old system set every date as 27.10.2004 in mono. Mono is right for a
 * figure being compared against other figures, and wrong for a date that is
 * being read as a word. Numerals stay mono where they line up in a column.
 */
export function formatLongDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "27 Oct 2004", the same convention compressed for list rows. */
export function formatShortDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
