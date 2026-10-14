/**
 * TRACE design system
 *
 * DIRECTION: Atlas.
 *
 * Two materials, and the contrast between them carries the whole app.
 *
 * PAPER is where the words live: warm bone stock, a serif for anything a person
 * wrote or was named, generous leading, hairlines that guide rather than divide.
 * The reference is a letterpress book of hours, not a lab printout.
 *
 * PLATE is where the sky lives: a deep Prussian night, the moon and the star
 * field set into it the way figures were tipped into printed books. On the home
 * screen the plate is the hero and takes the top of the page; everywhere else it
 * is an inset. Reading surfaces are never dark, sky surfaces are never light.
 *
 * THE ACCENT IS THE PLATE, BROUGHT UP ONTO THE PAGE. Every date and every return
 * year is printed in the colour of the sky it refers to. That is the whole idea,
 * and it is why the accent is not a decorative choice that could be swapped for
 * another hue of the same value.
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
 * WHAT CHANGED WHEN KEEPSAKE BECAME ATLAS
 *
 * Keepsake was warm paper, warm ink, warm plate, aged brass. It failed on two
 * counts, one of them measurable.
 *
 *   1. MEASURED. Three of nine contrast pairs fell below WCAG AA, and the worst
 *      was `signal` on `paper` at 3.47:1 against a 4.5 minimum. That token
 *      carries every date, every illumination figure and every return year in
 *      the app, so the accent was the least legible thing on the page. A warm
 *      accent on warm paper has nowhere to go; clearing 4.5:1 against both paper
 *      grounds meant leaving that neighbourhood entirely.
 *   2. UNMEASURED. Everything was one temperature, so the dark plate read as
 *      dark paper rather than as night, and a warm-black plate pushed the
 *      neutral-grey lunar photograph sitting on it toward green.
 *
 * Cooling the plate does most of the work. The paper stays warm, because a
 * record is a document and documents are warm.
 *
 * FOUR RULES THAT SURVIVE UNCHANGED
 *
 *   - Mono carries every number, so data reads as data.
 *   - Text is NEVER truncated. No numberOfLines, no ellipsis. Layouts grow.
 *   - Phase labels stay honest and always ship the exact percentage (§6.2).
 *   - The accent is NEVER red. `danger` owns red, and one colour cannot mean
 *     both "this is the important figure" and "this will delete something".
 */

// ---- Color ----
export const Colors = {
  /** Warm bone stock. The ground for every reading surface. */
  paper: "#F3F0E8",
  /** Recessed paper, for inset blocks, empty thumbnails and pressed states. */
  paperDim: "#E6E2D6",
  /** Near-black carrying a trace of the plate's blue. Primary text, never #000. */
  ink: "#15181F",
  /** Secondary text, captions, resolved values. 4.77:1 on paper. */
  inkMuted: "#646A76",
  /** Hairlines between rows. Guides rather than divides. */
  rule: "#D6D2C6",

  /**
   * Prussian night. The plate ground for anything showing sky.
   *
   * This is the single change that does the most work in the system. A warm
   * black is dark paper; a cool one is night, and it lets the neutral-grey
   * lunar photograph on top of it read as grey instead of drifting green.
   */
  plate: "#0A1120",
  /** Text on a plate. */
  plateInk: "#E8EDF6",
  /** Muted text on a plate. */
  plateMuted: "#78849C",
  /** The moon itself, drawn on a plate. Warm, because moonlight is. */
  moonlight: "#F5F2E6",
  /**
   * The unlit side of the moon, at full strength.
   *
   * Earthlight is blue because the Earth is, and the hue is the whole reason
   * the ash-grey disc inside a thin crescent reads as cold. The level here is
   * the PEAK, for a moon hanging under a nearly-full Earth; the shader scales it
   * down by the Earth's own phase (see earthshineGain), so a gibbous moon gets a
   * quarter of it and no more.
   *
   * Was #0D1526, chosen to sit a whisper above the Prussian plate. On black that
   * choice inverted: it is the ground that changed, so the value that used to
   * mean "just visible" now had to be measured against space instead.
   */
  earthshine: "#0B121F",
  /** Hairlines and outlined buttons ON a plate. The dark counterpart to `rule`. */
  plateRule: "#1E2A40",
  /**
   * Pitch black. The immersive sky, the full-screen image viewer, and the ground
   * under every moon.
   *
   * THE MOON GROUND USED TO BE `plate`, and that was wrong for one reason worth
   * keeping: a moon has a dark side. On Prussian blue the unlit hemisphere and
   * the surface behind it were within a hair of each other, so the silhouette
   * dissolved and what was left read as a lit crescent lying on a rectangle
   * rather than as a sphere half in shadow. Black is the only ground a night
   * side can be measured against.
   *
   * It also buys the mineral colour back. A dark blue ground drags the disc's
   * own blues toward it and costs roughly a fifth of the apparent saturation.
   */
  space: "#000000",

  /**
   * The single accent: the plate colour lifted onto the page.
   *
   * It replaces aged brass, which replaced signal red. Brass was warm on warm
   * and came out at 3.47:1, below AA for the text it carried. This clears 7.74:1
   * on paper and 6.81:1 on paperDim.
   *
   * It also means something, which brass did not: a date set in this colour is
   * printed in the colour of the night it names.
   */
  signal: "#2D4A7C",
  /**
   * The accent lifted for dark grounds. #2D4A7C is legible on paper and vanishes
   * into the plate, so anything accented on a dark surface uses this instead.
   * Using the paper value on a plate is the most likely mistake here.
   *
   * NOTE for the immersive sky: planets do NOT use this. See SkyColors.planet.
   */
  signalOnPlate: "#93B4E8",

  /**
   * Destructive actions and validation errors only.
   *
   * A muted brick. It stays the only red in the system precisely so that red
   * keeps meaning one thing. The accent has been three different hues now and
   * red has never been available to it.
   */
  danger: "#9B3B2A",
} as const;

export type ColorToken = keyof typeof Colors;

/**
 * The planetarium palette.
 *
 * These live apart from `Colors` because they answer to physics rather than to
 * the design direction: they are chosen so faint structure separates from stars
 * on a pitch-black ground without ever competing with the moonlight the stars
 * are drawn in. Changing the app's accent must not change these, and the reverse
 * caught us out: planets borrowed the accent, so cooling it to Prussian would
 * have drawn them in the grid's own blue. Anything in this view that names a
 * real object gets its colour from here, not from Colors.
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
  /**
   * Planets, and their labels.
   *
   * Planets used to borrow Colors.signalOnPlate, which was safe while the accent
   * was brass and stopped being safe the moment it went cool: under Atlas a
   * planet and a grid meridian would be drawn in the same blue, so the one class
   * of object that moves against the stars would read as scaffolding.
   *
   * Warm is also truer. Mars is red, Jupiter cream, Saturn gold, and none of
   * them are the colour of a coordinate line.
   */
  planet: "#D9A15C",

  /**
   * The two ends of the star tint range, for the decorative field behind the
   * moon (`components/moon/starGrain.ts`). `Colors.moonlight` is the neutral
   * they are mixed against.
   *
   * These are not invented. All three are real blackbody colours: cool is about
   * 10,000 K, moonlight lands near 5,800 K, and warm is about 4,300 K, which is
   * roughly the naked-eye range from Rigel to Aldebaran. What the field does not
   * claim is that any PARTICULAR star has one, which is why the tint is drawn
   * from a distribution weighted hard toward neutral rather than assigned.
   *
   * They live here rather than in `Colors` because they answer to temperature
   * rather than to the design direction, which is the line SkyColors draws.
   */
  starCool: "#CBD8FF",
  starWarm: "#FFD9B0",

  /**
   * The sky's own ground as the sun comes up through the scrubber: astronomical
   * twilight, nautical, civil, and the sun on the horizon. Night is `Colors.space`.
   * Chosen to read as the familiar deepening blue of a clear evening, and kept
   * dark enough that the brightest stars and planets still show through the
   * first two.
   */
  twilightAstro: "#030712",
  twilightNautical: "#0B1733",
  twilightCivil: "#1B3261",
  daylight: "#3C5F95",

  /**
   * The Earth's shadow on the moon, applied by multiplying. The umbra is the
   * copper of a totally eclipsed moon, which comes from sunlight bent through
   * the Earth's atmosphere; the penumbra only greys the disc a little.
   */
  umbra: "#8A3A22",
  penumbra: "#BDB8B0",
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
 * The `regular`/`medium`/`semibold` keys are Figtree and carry the UI. Anything
 * named `serif*` is Newsreader. Reach for serif when the string is a name.
 *
 * Only weights a screen actually sets live here, because the splash waits for
 * every one of them to load. Add a weight when something draws with it.
 */
export const FontFamily = {
  // Newsreader, the voice
  serif: "Newsreader_400Regular",
  serifMedium: "Newsreader_500Medium",

  // Figtree, the interface
  regular: "Figtree_400Regular",
  medium: "Figtree_500Medium",
  semibold: "Figtree_600SemiBold",

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
 * Dates in prose: "20 January 2000".
 *
 * The old system set every date as 20.01.2000 in mono. Mono is right for a
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

/** "20 Jan 2000", the same convention compressed for list rows. */
export function formatShortDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
