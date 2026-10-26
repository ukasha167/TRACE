import * as Astronomy from "astronomy-engine";
import type { MilestoneLocation } from "@/types";
import { parseDateString, toLocalNight } from "./dateUtils";
import { lru } from "@/lib/memo";

/**
 * THAT NIGHT, IN WORDS.
 *
 * The record page used to describe the night with a limb tilt in degrees and a
 * phase offset like ±0.61d. Both are true and neither means anything to the
 * person the record is about. This module says what the moon DID: when it came
 * up, how high it climbed, what it sat in front of, who else was in the sky,
 * and whether the Earth's shadow crossed it.
 *
 * NO CLOCK TIMES, and this is a rule rather than a style. The record's offset
 * is estimated from its longitude (dateUtils.approximateTimezoneOffsetMin), and
 * ASTRONOMY.md forbids printing a clock time from an estimate: an hour out in
 * Spain or half an hour out in India would be printed as fact. Every time here
 * is said against sunset or sunrise at that place, which depend on nothing but
 * the coordinates, so "rose 14 minutes after sunset" is exact wherever it is.
 *
 * The offset still picks which evening "that night" means. An hour's error
 * there moves the search start by an hour and finds the same sunset.
 */

const DAY_MS = 86_400_000;
const COMPASS = [
  "north", "northeast", "east", "southeast",
  "south", "southwest", "west", "northwest",
] as const;
const PLANETS = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn"] as const;

export type EclipseKind = "penumbral" | "partial" | "total";

export interface NightFacts {
  sunset: Date | null;
  sunrise: Date | null;
  moonrise: Date | null;
  moonset: Date | null;
  /** The moon's highest point between sunset (or its rise) and sunrise (or its set). */
  highest: { altitudeDeg: number; azimuthDeg: number; at: Date } | null;
  /** IAU constellation holding the moon at local midnight. */
  constellation: string;
  moonUpAtMidnight: boolean;
  planetsUpAtMidnight: string[];
  /** A lunar eclipse peaking within a day of that midnight. */
  eclipse: { kind: EclipseKind; peak: Date; moonAltitudeDeg: number } | null;
  /** Each a whole sentence, or null when there is nothing to say. */
  sentences: { eclipse: string | null; motion: string; sky: string };
  /** Label/value pairs for the details fold. */
  rows: { label: string; value: string }[];
}

/** "3 h 7 min", "14 min", "2 h". Spelled for reading, not for a column. */
export function formatDuration(ms: number): string {
  const minutes = Math.round(Math.abs(ms) / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function compassWord(azimuthDeg: number): string {
  return COMPASS[Math.round((((azimuthDeg % 360) + 360) % 360) / 45) % 8];
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The place's name without its region, for a sentence: "Lisbon", not "Lisbon, Portugal". */
export function shortPlace(label: string): string {
  return label.split(",")[0].trim();
}

const factsCache = lru<NightFacts>(16);

/**
 * getNightFacts, once per date and place. Its eclipse search and five-minute
 * moon walk were most of the pause after Save: the reveal and the record screen
 * under it ran it in the same commit, and the share card ran it again. The
 * result is frozen because every caller shares it. Tests call getNightFacts.
 */
export function nightFactsFor(
  dateString: string,
  location: Pick<MilestoneLocation, "latitude" | "longitude" | "label">,
  tzOffsetMin?: number
): NightFacts {
  const key = `${dateString}|${location.latitude}|${location.longitude}|${location.label}|${tzOffsetMin ?? ""}`;
  return factsCache.through(key, () => {
    const facts = getNightFacts(dateString, location, tzOffsetMin);
    // One level down too: a caller pushing onto `rows` would grow it per render.
    Object.freeze(facts.rows);
    Object.freeze(facts.sentences);
    Object.freeze(facts.planetsUpAtMidnight);
    return Object.freeze(facts);
  });
}

export function getNightFacts(
  dateString: string,
  location: Pick<MilestoneLocation, "latitude" | "longitude" | "label">,
  tzOffsetMin?: number
): NightFacts {
  const observer = new Astronomy.Observer(location.latitude, location.longitude, 0);
  const place = shortPlace(location.label);
  const { year, month, day } = parseDateString(dateString);
  const offset = tzOffsetMin ?? 0;
  const noon = new Date(Date.UTC(year, month - 1, day, 12) - offset * 60_000);
  const midnight = toLocalNight(dateString, tzOffsetMin);

  const horizontal = (body: Astronomy.Body, at: Date) => {
    // Of-date coordinates, because Horizon wants the equator of the moment.
    const eq = Astronomy.Equator(body, at, observer, true, true);
    return Astronomy.Horizon(at, observer, eq.ra, eq.dec, "normal");
  };

  const sunset = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, noon, 1)?.date ?? null;
  const sunrise = sunset
    ? Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, +1, sunset, 1)?.date ?? null
    : null;

  // Said against whichever of sunset and sunrise is nearer.
  const relative = (t: Date): string => {
    if (!sunset || !sunrise) return "";
    if (t < sunset) return `${formatDuration(sunset.getTime() - t.getTime())} before sunset`;
    if (t > sunrise) return `${formatDuration(t.getTime() - sunrise.getTime())} after sunrise`;
    return t.getTime() - sunset.getTime() < sunrise.getTime() - t.getTime()
      ? `${formatDuration(t.getTime() - sunset.getTime())} after sunset`
      : `${formatDuration(sunrise.getTime() - t.getTime())} before sunrise`;
  };

  const rows: NightFacts["rows"] = [];

  // ---- An eclipse leads, because it is the rarest thing a night can hold ----
  let eclipse: NightFacts["eclipse"] = null;
  let eclipseSentence: string | null = null;
  const found = Astronomy.SearchLunarEclipse(new Date(midnight.getTime() - 1.5 * DAY_MS));
  if (Math.abs(found.peak.date.getTime() - midnight.getTime()) <= DAY_MS) {
    const peak = found.peak.date;
    const altitude = horizontal(Astronomy.Body.Moon, peak).altitude;
    const kind = found.kind as EclipseKind;
    eclipse = { kind, peak, moonAltitudeDeg: altitude };
    const when = relative(peak) || "that night";
    eclipseSentence =
      `A ${kind} lunar eclipse peaked ${when}, ` +
      (altitude > 0
        ? `with the moon ${Math.round(altitude)}° up over ${place}.`
        : `while the moon was below the horizon in ${place}.`);
    rows.push({ label: "Lunar eclipse", value: `${kind[0].toUpperCase()}${kind.slice(1)}, ${when}` });
  }

  // ---- When it came up, how high it went, when it went down ----
  let moonrise: Date | null = null;
  let moonset: Date | null = null;
  let highest: NightFacts["highest"] = null;
  let motion: string;

  if (!sunset || !sunrise) {
    // Three different nights fail the search, and only one of them is a sun
    // that never set. Above the Arctic Circle in December it never rose.
    if (sunset) motion = `The sun set in ${place} that evening and stayed down through the next day.`;
    else if (horizontal(Astronomy.Body.Sun, noon).altitude > 0)
      motion = `The sun did not set in ${place} that night.`;
    else motion = `The sun did not rise in ${place} that day, so the whole of it was night.`;
  } else {
    const upAtSunset = horizontal(Astronomy.Body.Moon, sunset).altitude > 0;
    let from: Date | null;
    if (upAtSunset) {
      moonrise = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, +1, sunset, -1.2)?.date ?? null;
      from = sunset;
    } else {
      const rise = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, +1, sunset, 1)?.date ?? null;
      moonrise = rise && rise < sunrise ? rise : null;
      from = moonrise;
    }

    if (from) {
      moonset = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, -1, from, 1.2)?.date ?? null;
      const until = moonset && moonset < sunrise ? moonset : sunrise;
      for (let t = from.getTime(); t <= until.getTime(); t += 5 * 60_000) {
        const h = horizontal(Astronomy.Body.Moon, new Date(t));
        if (!highest || h.altitude > highest.altitudeDeg) {
          highest = { altitudeDeg: h.altitude, azimuthDeg: h.azimuth, at: new Date(t) };
        }
      }
      const peak = highest!;
      const alt = Math.round(peak.altitudeDeg);
      const dir = compassWord(peak.azimuthDeg);

      if (upAtSunset && peak.at.getTime() === from.getTime()) {
        // Already past its highest when the sun went down; it only sank from there.
        motion = `The moon was already ${alt}° up in the ${dir} at sunset.`;
      } else {
        const rose =
          !upAtSunset || (moonrise && sunset.getTime() - moonrise.getTime() < 3 * 3_600_000)
            ? `rose ${relative(moonrise!)}`
            : "was up before sunset";
        motion = `The moon ${rose} and climbed to ${alt}° in the ${dir}.`;
      }
      if (moonset) motion += ` It set ${relative(moonset)}.`;

      rows.push({ label: "Moonrise", value: moonrise ? relative(moonrise) : "Up all day" });
      rows.push({ label: "Highest that night", value: `${alt}°, ${dir}` });
      if (moonset) rows.push({ label: "Moonset", value: relative(moonset) });
    } else {
      motion = "The moon stayed below the horizon all night.";
      rows.push({ label: "Moonrise", value: "Not that night" });
    }
    rows.push({
      label: "Dark hours",
      value: `${formatDuration(sunrise.getTime() - sunset.getTime())}, sunset to sunrise`,
    });
  }

  // ---- Where it sat, and who else was up ----
  // Constellation boundaries are defined in J2000, so ofdate = false here.
  const eqj = Astronomy.Equator(Astronomy.Body.Moon, midnight, observer, false, true);
  const constellation = Astronomy.Constellation(eqj.ra, eqj.dec).name;
  const moonUpAtMidnight = horizontal(Astronomy.Body.Moon, midnight).altitude > 0;
  const planetsUpAtMidnight = PLANETS.filter(
    (name) => horizontal(Astronomy.Body[name], midnight).altitude > 0
  );
  const others = joinNames([...planetsUpAtMidnight]);
  const sky = moonUpAtMidnight
    ? `At midnight it sat in ${constellation}${others ? `, with ${others} also above the horizon` : ""}.`
    : `At midnight it was below the horizon, in ${constellation}${
        others ? `, while ${others} ${planetsUpAtMidnight.length > 1 ? "were" : "was"} up` : ""
      }.`;
  rows.push({ label: "Constellation", value: constellation });
  rows.push({ label: "Planets up at midnight", value: others || "None" });

  return {
    sunset,
    sunrise,
    moonrise,
    moonset,
    highest,
    constellation,
    moonUpAtMidnight,
    planetsUpAtMidnight: [...planetsUpAtMidnight],
    eclipse,
    sentences: { eclipse: eclipseSentence, motion, sky },
    rows,
  };
}

/** The one or two sentences the record page and the reveal lead with. */
export function headlineSentences(facts: NightFacts): string[] {
  return [facts.sentences.eclipse, facts.sentences.motion, facts.sentences.sky]
    .filter((s): s is string => !!s)
    .slice(0, 2);
}
