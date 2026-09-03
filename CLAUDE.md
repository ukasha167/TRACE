# TRACE — Technical & Design Specification

## 0. How to use this document

Single source of truth. Build the phases in Section 15 **in order**; don't start a phase before the previous one meets its "done" criteria. Every data shape is defined in Section 4 — use those exact field names everywhere, and never let a raw API response shape leak past its boundary module.

Where a decision traded simplicity against capability, the reasoning is inline. If you find yourself wanting to deviate, read the reasoning first.

**Two rules that override everything else in this document:**

1. **Never state an astronomical claim the data doesn't support.** This app's entire premise is that the numbers are real. A rounded label that reads as a precise claim is a bug, not a UI detail. See §6.2.
2. **Verify constants and library units against the installed library, not against memory.** §5.1 documents a real bug that shipped into this repo because the spec asserted units that were wrong for the installed version.

---

## 1. Product Definition & Thesis

**The thesis: the sky repeats itself for you.**

This is not an app that prints facts about a date. It is an app about *recurrence* — the observation that the sky keeps a schedule, and that the schedule happens to line up with the dates people care about. An anniversary is recurrence. The Metonic cycle is recurrence. Every feature below is an instance of that one idea, and any proposed feature that isn't should be rejected.

This matters because the previous revision of this spec was a **feature list**, not a product: five independent sections stacked on one screen, each a different fact about a date, none of them speaking to each other. That structure is the failure mode to avoid. When adding something, the test is not "is this a cool space fact" but "is this the sky keeping time with a person."

**Why recurrence is the right spine — the astronomy:**

19 tropical years = 6939.60 days. 235 synodic months = 6939.69 days. They differ by about two hours. So the moon returns to very nearly the same phase on the same calendar date every 19 years — the Metonic cycle, the basis of the Hebrew calendar and the Easter computus. Weaker near-repeats occur at 8 years (~1.6 days of drift) and 11 years (~1.5 days, drifting the opposite way). Because those two errors have opposite signs, 8 + 11 = 19 cancels them, which is why 19 is the good one, and why 30 (11+19) and 38 (19+19) are also strong.

This means: for any date a user cares about, there is a real, computable, non-obvious set of years where their sky comes back. That's the product.

| Feature | Status | Why |
|---|---|---|
| Moon Return | **Core** | The thesis, made literal. §6.3. |
| Life-in-sky ledger | **Core** | One row per year of your life: age, real moon, that day's APOD. §2, §8.5. |
| Rarity, computed | **Core** | Real measured frequencies, never adjectives. §6.4. |
| Time-shifted sky render | **Core** | The sky over *that place* on *that night*, held up in your hand. §7, §12. |
| NASA APOD per date | **Supporting** | Demoted from hero to a secondary card. §8. |
| Bright-limb tilt | **Supporting** | Folds into the sky render rather than standing alone. §6.5. |
| Planetary age converter | **Demoted** | Every space-novelty app has this. Standalone utility screen only; **off the milestone detail screen entirely.** |
| Light-travel / "light leaving X" | **CUT** | Emotionally inert — nobody is alive for the arrival, and the user cannot go look at the object. The sky render does this job properly by letting them point at something real. Delete `lightTravel.ts`, `lightTravelDataset.ts`, and the detail-screen section. |
| Hubble/JWST curated set | **CUT** | A worse APOD at far higher curation cost, and visibly redundant sitting under the real NASA image. Delete `hubbleJwst.ts`. |
| Backend / accounts / sync | **None** | Fully local, offline-first, single device. |

**Core user journey:**
1. Open app → home shows **tonight's** sky and moon over the user's current location, plus saved milestones. The app is about now as well as then.
2. `+` → title, type, date, optional location.
3. App computes the moon, its rarity, the return years, and the sky for that date/place; fetches and caches APOD.
4. Detail screen leads with the **sky render** for that night, then Moon Return, then the ledger, then APOD.
5. Immersive mode: hold the phone up and look around the sky *as it was* that night.
6. Export a card via the native share sheet.
7. All of it works offline after first fetch.

---

## 2. Screens

| Screen | Route | Purpose |
|---|---|---|
| Home | `/` | Tonight's moon over current location, plus the milestone ledger (§11.4's vertical line lives here). Empty state with a clear CTA. |
| Add Milestone | `/milestone/new` | Title, type, date, optional location. |
| Edit Milestone | `/milestone/edit/[id]` | Same form, prefilled. Reached from `EDIT` in the detail masthead. |
| Milestone Detail | `/milestone/[id]` | **Order matters:** sky render hero → Moon Return → rarity → life ledger → APOD card → export. Currently 825 lines implementing the old five-section layout; this gets cut down, not extended. |
| Sky (immersive) | `/sky/[id]` | Full-screen time-shifted planetarium. Drag by default; device-orientation pointing when the compass is calibrated. |
| Life Ledger | `/ledger/[id]` | One row per year: age, moon glyph at true phase and tilt, APOD thumbnail. Scrollable. |
| Export Preview | `/export/[id]` | Skia card, Story (1080×1920) or Square (1080×1080), native share. |
| Planetary Age Converter | `/age-converter` | Standalone utility. Not linked from milestone detail. |
| Settings | `/settings` | NASA key override, units, about/credits. |

---

## 3. Navigation

Expo Router, file-based. Use the typed `router` object and `<Link>`.

```
src/app/
├── _layout.tsx
├── index.tsx
├── age-converter.tsx
├── settings.tsx
├── milestone/{new,[id]}.tsx
├── milestone/edit/[id].tsx
├── sky/[id].tsx
├── ledger/[id].tsx
└── export/[id].tsx
```

---

## 4. Data Models (`src/types/index.ts`)

```typescript
// ---- Milestone ----
export type MilestoneType = "birthday" | "anniversary" | "graduation" | "custom";

export interface MilestoneLocation {
  latitude: number;
  longitude: number;
  label: string;      // "Lahore, Pakistan"
  timezoneOffsetMin: number; // minutes from UTC at that date. REQUIRED — see §6.1.
}

export interface Milestone {
  id: string;                         // expo-crypto randomUUID()
  title: string;
  type: MilestoneType;
  date: string;                       // "YYYY-MM-DD", date-only, always. §6.1.
  location: MilestoneLocation | null; // null degrades gracefully everywhere
  notes?: string;
  createdAt: string;                  // ISO 8601
}

// ---- Moon ----
export type MoonPhaseName =
  | "New Moon" | "Waxing Crescent" | "First Quarter" | "Waxing Gibbous"
  | "Full Moon" | "Waning Gibbous" | "Last Quarter" | "Waning Crescent";

export interface MoonSnapshot {
  phaseFraction: number;             // 0.0–1.0 illuminated fraction
  phaseName: MoonPhaseName;
  phaseIndex: number;                // 0–7
  isTruePhase: boolean;              // §6.2 — the exact syzygy falls inside this local day
  brightLimbAngleDeg: number | null; // null without a location
  altitudeDeg: number | null;        // peak altitude that night
  riseLocal: string | null;          // "HH:mm"
  setLocal: string | null;
}

// ---- Recurrence ----
export interface MoonReturn {
  year: number;
  age: number;                 // years since the source date
  offsetYears: number;         // 11, 19, 30, 38...
  phaseOffsetDays: number;     // circular distance from the source phase
  phaseFraction: number;
  direction: "past" | "future";
}

export interface RarityStat {
  thresholdPct: number;        // e.g. 99
  frequency: number;           // measured fraction of days meeting it
  oneInN: number;              // 1 / frequency, for display
  matchingYears: number[];     // which of THIS person's anniversaries qualified
  totalYears: number;
}

// ---- Sky ----
export interface Star {
  hr: number;       // Bright Star Catalog number
  ra: number;       // right ascension, degrees, J2000
  dec: number;      // declination, degrees, J2000
  mag: number;      // visual magnitude
  name?: string;    // proper name, only where one exists
}

export interface SkyBody {
  id: string;
  label: string;
  altitudeDeg: number;
  azimuthDeg: number;   // north-based clockwise
  magnitude: number;
}

// ---- NASA APOD ----
export type ApodKind = "photograph" | "illustrative" | "video";

export interface ApodCacheEntry {
  date: string;              // "YYYY-MM-DD", also the cache key
  title: string;
  explanation: string;
  url: string;               // standard-res, all in-app display
  hdurl: string | null;      // export render only. §8.2.
  mediaType: "image" | "video";
  kind: ApodKind;            // §8.3 classification, computed at the boundary
  copyright: string | null;
  fetchedAt: string;         // debugging only, NOT a TTL
}

// ---- Settings ----
export interface AppSettings {
  nasaApiKey: string | null;
  distanceUnit: "ly" | "km";
  hasCompletedOnboarding: boolean;
}
```

`LightTravelObject` and `HubbleJwstImage` are **removed**. Delete them and their consumers.

---

## 5. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Expo (managed) + TypeScript | Catches mismatched shapes at compile time. |
| Navigation | `expo-router` | Official default, real native stack behaviour. |
| State | `zustand` + `persist` | ~1KB, no Provider. Redux is overkill here. |
| Storage | `@react-native-async-storage/async-storage` | Runs in Expo Go; MMKV would force an EAS dev build from day one for a data volume nowhere near AsyncStorage's limits. |
| Sun/moon math | `suncalc` **v2.x** | **Returns degrees. See §5.1.** |
| Planet positions | `astronomy-engine` | Also the cross-check for `skyTransform` — see §14. |
| ~~Planet positions~~ | ~~`astronomy-engine`~~ | **New.** The previous spec rejected this saying "you don't need planet positions anywhere in this app." The sky render makes that false. SunCalc does sun and moon only. |
| Device orientation | `expo-sensors` | DeviceMotion + magnetometer. Expo Go compatible. See §7.3 for its real accuracy limits. |
| Rendering | `@shopify/react-native-skia` | Sky render *and* export card. Fixed-resolution output. |
| Location | `expo-location` | First-party, Expo Go compatible. |
| Dates | `date-fns` | Avoids hand-rolled date arithmetic. |
| Tests | `tsx` + `node:test` | See §14 — jest-expo peer-conflicts with this RN version and is overkill for pure functions. |
| Fonts | Fraunces / Manrope / JetBrains Mono | §11.2. |
| Sharing | `expo-sharing` + `expo-file-system` | |
| Icons | `lucide-react-native` | |

```bash
npx expo install expo-sensors
npm install astronomy-engine
npm uninstall react-native-view-shot   # Phase 5 scaffold, now superseded by Skia
```

### 5.1 SunCalc v2 returns DEGREES — the bug this caused

The installed `suncalc@2.0.1` states in its own `index.d.ts`: *"All angles are in degrees."* SunCalc **v1** returned radians, and the previous revision of this spec asserted radians in its worked example. `brightLimb.ts` faithfully implemented that spec, multiplying an already-degrees value by `180/Math.PI` and inflating it ~57×.

It did not crash. The result was normalised into `(-180, 180]`, so it produced a plausible-looking but wrong tilt — the moon simply rendered at the wrong angle forever. Verified example, Lahore, 2004-10-27: the buggy path returned `137.5°`, the correct value is `-129.5°`.

**This is now fixed in `src/lib/astronomy/brightLimb.ts`, with a comment explaining why no conversion belongs there.** Do not reintroduce one. More generally: check the installed `.d.ts` for units before trusting any angle.

---

## 6. Astronomy Module (`src/lib/astronomy/`)

Pure functions, no side effects, no network. Highest-risk-of-silent-wrongness code in the app, and the easiest to test — see §14.

### 6.1 Dates and timezones

Every date here is a **calendar date**, not an instant. Store as `"YYYY-MM-DD"`. To get a `Date`, construct explicitly — `new Date(y, m - 1, d, 12, 0, 0)` — never `new Date("YYYY-MM-DD")`, which parses as UTC midnight and silently lands on the previous calendar day anywhere behind UTC.

**New requirement:** for a milestone with a location, the moon must be evaluated in *that place's* local time, not the device's. A birthday in Lahore is a Lahore night. `MilestoneLocation.timezoneOffsetMin` exists so a user viewing from another country still sees the correct sky. When location is `null`, fall back to device local time and say so in the UI.

"That night" means **local midnight at the end of the date** (00:00 the following day), because that's when the moon is actually observed on the evening of a given date. Use one shared helper; don't recompute this convention per call site.

### 6.2 Moon phase — and the labelling bug that must not recur

```typescript
const PHASE_NAMES: MoonPhaseName[] = [
  "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
  "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent",
];
```

`Math.round(illumination.phase * 8) % 8` buckets anything within ±1.85 days of full into `"Full Moon"` — **illumination as low as ~87% gets labelled "Full Moon."** This actively misled the author of this app into believing a date was a full moon when it was 96%.

Requirements:

- **Display labels are gated on illumination, not on `isTruePhase` alone.** A moon at 99.9% whose exact full instant lands at 08:00 the next morning IS a full moon to any observer — calling it "Waxing Gibbous" understates reality as badly as the bucket overstated it by calling 96% "Full". `describePhase()` uses a 99% threshold (`FULL_ENOUGH`); `describeSyzygyNote()` then discloses where the exact instant fell. Both directions of error are bugs.
- **`isTruePhase` must be computed** for the four primary phases (New, First Quarter, Full, Last Quarter). It is `true` only when the exact syzygy instant falls within the observer's local calendar day. This is the almanac convention and it is precise.
- **The exact percentage is always displayed** alongside the name. Never the name alone.
- When `phaseName === "Full Moon"` but `isTruePhase === false`, the UI must not present it as a full moon. "Waning gibbous, 96% — full moon was the night before" is the correct rendering.

### 6.3 Moon Return (`moonReturn.ts`) — the core feature

For a source date, find the anniversaries whose moon returns to the same phase.

```
For each year y in [sourceYear - 60, sourceYear + 60]:
  p(y)   = illuminated phase at (y, sourceMonth, sourceDay), local midnight-of-night
  delta  = circular distance between p(y) and p(source), expressed in days
           (min(|dp|, 1 - |dp|) * 29.530589)
  A "return" is delta < 1.0 day.
Return the nearest past and next future hits, plus the full list.
```

Verified output for 2004-10-27 (Lahore): returns at **+11y (0.75d off), +19y (0.83d), +30y (0.75d), +38y (0.88d), +49y (0.82d)** — exactly the 8/11/19 combination structure §1 predicts. This is a good end-to-end sanity check for the implementation.

Label each hit with *why* it recurs (11-year, Metonic 19-year, 30 = 11+19). The explanation is a large part of the emotional payload: it says the sky is on a schedule, not that a coincidence happened.

### 6.4 Rarity (`rarity.ts`)

Never use an adjective where a number will do. Measure, don't assert.

Compute the frequency empirically by iterating days over a multi-decade window rather than hardcoding a figure. Measured over 29,220 days (1980–2060):

| Illumination | Frequency | Reads as |
|---|---|---|
| ≥ 90% | 20.19% | ~1 in 5 |
| ≥ 95% | 13.99% | ~1 in 7 |
| ≥ 97% | 10.86% | ~1 in 9 |
| ≥ 99% | **6.06%** | **~1 in 16.5** |
| ≥ 99.5% | 3.94% | ~1 in 25 |

The personal number is far stronger than the global one and falls straight out of the ledger: *"2 of your 22 birthdays have had a moon this full."* Show that.

### 6.5 Bright-limb angle (`brightLimb.ts`) — FIXED, see §5.1

Already corrected in the repo. Feeds the sky render and the moon glyph. `null` when location is absent.

### 6.6 Sky transform (`skyTransform.ts`)

RA/Dec → local sidereal time → hour angle → altitude/azimuth. Standard spherical trigonometry, roughly 30 lines.

**Precession can be skipped.** It runs ~50 arcsec/year, so even a 30-year lookback accumulates ~25 arcminutes — under a pixel at phone scale. Use J2000 catalog coordinates directly. This is a legitimate simplification, not a shortcut; document it in the code so nobody "fixes" it later.

Atmospheric refraction is likewise negligible except within a few degrees of the horizon; ignore it and note the limitation.

---

## 7. The Sky Render

Two surfaces sharing one engine: a static hero on the detail screen, and a full-screen immersive mode.

**Framing — this is the emotionally load-bearing decision.** Pointing a phone at the sky shows you *tonight*. The payload here is a sky that is years gone and cannot be pointed at. So the mode is not "look at the sky," it is **"look at the sky as it was, from there, then."** Same gesture, aimed into the past. A live-sky mode without the time shift would be a strictly worse Stellarium and there is no reason to build one.

### 7.1 Star catalog (`src/data/bsc.json`)

Yale Bright Star Catalog, public domain, ~9,100 stars. Trim to magnitude ≤ 5.5 for roughly 3,000 stars — approximately what a good dark-sky naked eye sees — and it bundles at ~150KB. Store as `Star[]` (§4). Constellation line data is separately available in the public domain; keep it as index pairs into the catalog, not duplicated coordinates.

### 7.2 Bodies

Sun and moon from SunCalc. Planets from `astronomy-engine`. The moon is drawn at its true phase **and** its true bright-limb tilt (§6.5) — this is where that feature finally earns its place, instead of floating as an isolated section.

### 7.3 Immersive mode — state the limits up front

`expo-sensors` DeviceMotion gives attitude; magnetometer gives heading. **Phone magnetometers are typically ±10–15° and worse indoors or near metal.** This is the main honest limitation of the feature and it must be designed for, not discovered late:

- Offer a calibration nudge on entry.
- Always provide a **drag-to-pan fallback**, and make it the default when the magnetometer reports low accuracy.
- Never render a precision claim on top of a ±15° pointing error. Show the sky, not a targeting reticle.

### 7.6 Making it read as sky rather than dots

Pitch black ground (`#000000`, not the warm `plate` ink) — this is the one surface whose whole job is contrast, and any lift in the ground steals it.

**Glow.** Stars brighter than a threshold are drawn twice: a blurred halo underneath, sharp cores on top. Only the bright ones bloom — blooming everything turns the field to fog and destroys the depth that makes it read as real.

**Figures and grid.** Constellation lines from d3-celestial (BSD-3, MIT-compatible), whose GeoJSON carries RA/Dec directly — which is why this no longer needs the HIP<->HR cross-index that blocked it in Phase F. 89 constellations, 150 segments, 21KB. An alt/az grid (rings every 30 degrees, meridians every 30) draws the inside of the celestial sphere, so the view feels like standing within it. Both are kept faint: structure, not decoration.

**One picture per frame.** Geometry AND text are recorded into a single `SkPicture` and handed to Skia through a shared value — no React element per star, per line, or per label. This is not only a performance choice: when the sky drew from shared values at 60fps while labels came from React state at 10Hz, labels visibly chased the objects they named. Two clocks meant two positions. Now a star and its name are emitted by the same instruction stream, so they cannot disagree.

**Don't cull at the data layer what the projection should cull.** `getSolarSystemSky` filtered bodies to `altitude > 0`, which was correct when only the visible hemisphere was drawn. Once the view rendered the full sphere it became a bug: on 2004-10-27 over Lahore, Saturn was the only planet above the horizon and the other four were simply underfoot — so four planets silently vanished rather than appearing below the horizon where they belong.

**Labels.** 333 IAU-approved proper names, matched onto the Yale catalog by the HR number the IAU itself publishes — nothing guessed. How many show scales with zoom (10 wide, 60 zoomed in), because a wide view labelled densely is unreadable. Near the right edge a label flips to the left of its object rather than being suppressed — a fixed right margin silently hid the Moon's own name whenever it drifted into the last 90 points.

**Deep sky.** The Messier catalogue (110 objects, 40 of them galaxies) from d3-celestial, drawn as small ellipses rather than dots so a galaxy never reads as just another star.

### 7.4 What this is not

No deep-sky catalog, no atmosphere model, no satellite tracking, no telescope control. It shows ~3,000 real stars, the constellations, and the solar system bodies, correctly placed for a given time and place. Say that plainly in the credits screen.

---

## 8. NASA APOD

### 8.1 Request

```
GET https://api.nasa.gov/planetary/apod?date=YYYY-MM-DD&api_key=KEY
```

### 8.2 Mapping

Map `snake_case` response fields into `ApodCacheEntry` at the fetch boundary; nothing downstream sees a raw response. `hdurl` can be multi-thousand-pixel — use `url` for standard in-app surfaces, thumbnails, and ledger rows. `hdurl` is permitted only for rendering the export card and on-demand inside the single active full-screen pinch-zoom viewer (`ImageViewerModal`), where 4x zoom provides an honest use for full resolution. The modal unmounts upon dismissal, guaranteeing a 40-row ledger never holds more than one high-resolution image in memory at any time.

### 8.3 Kind classification — and the hero policy

**APOD is no longer the hero.** The hero of a milestone is the sky render: it is the app's signature, it is specific to the user's own place and date, and it is the thing APOD can never be. APOD demotes to a secondary card, correctly framed as *"what the world was looking at that day"* — which is also the only honest description of APOD, since it publishes a *featured* image, not one captured that day.

That reordering is the primary fix. The classifier below then handles how the APOD **card** renders:

```typescript
// "photograph" | "illustrative" | "video"
// illustrative = the day's pick is a diagram/chart/map/artist's concept,
// not an image of the sky. Detected by the author's own positional
// self-description ("the above illustration shows...", "pictured above
// is a diagram of...").
```

Measured across 160 sampled dates:

| Era | video | GIF asset | illustrative |
|---|---|---|---|
| 1996–2000 | 0% | 25% | 5% |
| 2001–2007 | 0% | 8% | 3% |
| 2008–2015 | 3% | 0% | 3% |
| 2016–2025 | 8% | 0% | 0% |

So roughly **1 in 20 dates** is illustrative and up to 1 in 12 recent dates is video — together a real class worth handling, not a special case.

Two findings worth recording so nobody "simplifies" the classifier later:

- **File extension alone is not a valid signal.** Early APOD used GIFs for genuine photographs (e.g. 1995-06-20, "Pleiades Star Cluster"). A `.gif` rule would misclassify a quarter of the 1996–2000 era.
- **A bare keyword scan is not either.** Matching `illustration|diagram|chart|map` anywhere in the explanation false-positives on prose that mentions a map in passing. Requiring the *positional* self-reference is what makes it precise.

An `illustrative` or `video` APOD renders as a labelled card with the title, the explanation, and an outbound link — never stretched into a hero image slot.

### 8.4 Error states

| Condition | Behaviour |
|---|---|
| `media_type === "video"` | Distinct video card with link out. Never rendered as a photo. |
| Non-200 / network failure | Retry-able error state. Never a blank hero, never a crash. |
| No APOD for that date (pre-1995-06-16, or a gap) | Same fallback. **Do not hardcode a cutoff date** — handle the actual response. |
| HTTP 429 | Clear "rate limit reached, try again in an hour." Rare once §9 caching works. |

Because the sky render is the hero, **every one of these degrades to a still-complete screen.** That is the structural benefit of the reordering.

### 8.5 Batch fetching for the ledger

The life ledger needs one APOD per year of the user's life — 20–40 requests. This is the app's most interesting engineering problem:

- Check cache first; only fetch misses.
- Bound concurrency (4–6 in flight), never fan out unbounded.
- Budget against the key's quota and degrade gracefully: render the ledger rows immediately with moon data (which is local and instant), and let thumbnails fill in progressively.
- Persist every result. After one pass, the ledger is permanently offline.

A free personal key allows 1,000 req/hour vs `DEMO_KEY`'s 30/hour — get one on day one; the ledger alone would exhaust the demo cap in a single view.

### 8.6 Key management

Load via `expo-constants`/env and embed. This is a free, rate-limited key with no billing exposure and no PII behind it; worst case on leak is quota theft. Settings offers a user-supplied key override as polish.

---

## 9. Storage & Caching

**Milestones** — key `milestones`, one JSON array, via Zustand `persist`. Small enough to read/write as one blob.

**APOD cache** — key `apod-cache:{YYYY-MM-DD}`, one entry each. **Never expires, never invalidates** — APOD content for a past date does not change. Always check cache before any request. This is also the rate-limit strategy: a date viewed once is free forever.

**Sky/moon data is never cached.** It is pure computation from bundled data and recomputing is cheaper than storing.

**Offline-first:** the detail screen must render completely with no network. Sky render, moon, returns, and rarity are all local computation; only APOD touches the network and it is cached. Offline support is close to free if the caching layer is built correctly from the start rather than bolted on.

---

## 10. Location

Captured **per milestone**, always optional.

1. Optional Location field on the form.
2. "Use current location" → `requestForegroundPermissionsAsync` → coords → reverse-geocode a label.
3. For historical dates, typed entry resolved through `Location.geocodeAsync` — GPS only ever describes where you are standing now, and nearly every milestone is historical. **An earlier build stored typed places with latitude/longitude `0`**, which silently disabled the sky render and the moon tilt for exactly the records that most needed them. A place without coordinates is not a location.
4. **Capture `timezoneOffsetMin` for the milestone's date**, not today's. This is what makes §6.1's "that place's night" correct.
5. Denied or skipped → `location: null`. Fully supported: sky render and tilt are unavailable, phase/fraction/returns/rarity all still work. Nothing breaks.

All location data stays on device. There is no backend to send it to.

---

## 11. Design System — "Record Sheet"

**Direction: Swiss / International Typographic Style, printed on paper.**

The reference is a printed astronomical atlas or an observatory record sheet: bone paper, a strict grid, one grotesque doing all the work, hairline rules as structure, and exactly one accent used sparingly. Hierarchy comes from type **size and weight** — never from decoration, shadows, gradients, or rounded cards.

This replaces the earlier "Celestial Archive" cyanotype direction entirely. That palette was defensible but it was still a dark space app, which is the expected move; a Swiss paper document for astronomical data is not.

**THE PLATE IDEA — the load-bearing device.** Reading surfaces are paper. Anything showing the actual sky — moon glyphs, APOD photographs, the Phase F sky render — is a dark **plate** set into that paper, the way figures were tipped into printed books. The contrast is deliberate: *the atlas is paper, the sky is dark.* This is also why a light UI stays usable at night — the immersive sky mode is a full-screen plate.

### 11.1 Color

| Token | Hex | Use |
|---|---|---|
| `paper` | `#F2EFE9` | Bone ground for every reading surface. |
| `paperDim` | `#E7E3DA` | Recessed paper — inset blocks, empty thumbnails. |
| `ink` | `#14140F` | Near-black with a trace of warmth. Never pure `#000`. Primary text, heavy rules, plate ground. |
| `inkMuted` | `#6B6A61` | Secondary text, labels, captions. |
| `rule` | `#C9C4B8` | Hairlines. **The main structural device.** |
| `plate` | `#14140F` | Dark plate ground for sky imagery. |
| `plateInk` / `plateMuted` | `#F2EFE9` / `#8A887E` | Text on a plate. |
| `moonlight` | `#F7F3E4` | The moon itself, drawn on a plate. |
| `signal` | `#D6301F` | **The one accent.** Rules, return years, dates, active states. Never large fills. |

Signal red is the classic Swiss accent, and it is native to the subject: observers use red light to preserve night vision.

### 11.2 Typography

**Archivo** (grotesque) carries display and UI at every weight from Light to Black. **JetBrains Mono** carries every number — dates, illumination, angles, years — so data reads as data. Fraunces and Manrope are removed from the project; a soft old-style serif is the opposite of this brief, and Swiss hierarchy comes from one family at contrasting sizes.

The scale has **wide steps, not a gentle ramp** (`micro 10 / label 11 / small 13 / body 15 / lead 18 / heading 24 / title 34 / display 48 / mega 68`). The tension comes from the gap between display and body with little in between. Tracking is tight on large type (`-1.6` at display) and wide on small caps labels (`+1.4`).

### 11.3 Structural devices

- **The numbered section header** (`SectionHeader.tsx`): a zero-padded number in signal red, a hairline rule, an uppercase mono label. Repeating it is what makes a stack of sections read as one document rather than a pile of cards.
- **Hairline separators instead of cards.** Rows are divided by rules, not boxed. The rule *is* the structure.
- **The moon glyph** stays the signature element (`variant="plate"` sets it into a dark square; `variant="bare"` for surfaces already dark). It is informative as well as decorative — always that date's real phase at its real tilt.
- **Masthead**: wordmark set large, 3px ink rule beneath, mono meta line under that.

### 11.4 Hard rules

- **Text is NEVER truncated.** No `numberOfLines`, no ellipsis. Layouts grow to fit their content. A grid that clips its own text is a broken grid. This is checkable: `grep -rn "numberOfLines" src/` must return nothing.
- **No drop shadows, no elevation.** Separation comes from rules and from the paper/plate contrast.
- **Corners stay near-square** (`Radius.sm = 2`, `Radius.plate = 3`). Rounded cards read as generic app chrome.
- **No color outside the tokens.** `grep -rnE '"#[0-9a-fA-F]{3,8}"' src/ --include="*.tsx"` should only match the theme file.
- 8pt spacing scale, `Spacing.page = 24` as the shared outer margin.

## 12. Export Card (Skia)

Story 1080×1920 or Square 1080×1080.

1. **Sky region** (top ~55%) — the rendered sky for that night and place, not the APOD image. This is what makes the card unmistakably *this app's*.
2. **Title block** — title in Fraunces, date in JetBrains Mono.
3. **Moon strip** — glyph at true phase and true tilt, plus name and exact percentage.
4. **Return line** — one sentence, e.g. *"This moon last returned in 2015, and comes back in 2034."* Distance and dates in JetBrains Mono.
5. **Watermark** — app name, small, quiet.

Single `<Canvas>` in `src/components/ExportCardCanvas.tsx`, parameterised by `Milestone`, `MoonSnapshot`, `MoonReturn[]`, and the sky data. Snapshot via `makeImageSnapshot()`, write with `expo-file-system`, hand to `expo-sharing`.

---

## 13. States Checklist

- [ ] No milestones — Home empty state with a real CTA, not a blank list.
- [ ] APOD failure / 429 / non-200 — §8.4. Screen still complete because the hero is local.
- [ ] APOD video or illustrative — labelled card, never a stretched hero.
- [ ] Offline, uncached — explicit message, not an infinite spinner.
- [ ] Location denied — saves with `location: null`; sky render unavailable, everything else intact.
- [ ] Magnetometer low accuracy — auto-fall back to drag-to-pan, tell the user why.
- [ ] Date before APOD's start — handled by response, not a hardcoded cutoff.
- [ ] Ledger partially fetched — rows render immediately from local moon data; thumbnails fill in.
- [ ] `phaseName === "Full Moon"` but `isTruePhase === false` — must not read as a full moon.

---

## 14. Non-functional

- **Performance:** `hdurl` only in the export render. List screens never block on network. The sky render targets 60fps in immersive mode — cull below-horizon stars before projecting.
- **Accessibility:** support OS dynamic type where RN/Skia allow. Verify contrast against `blueprint`/`parchment` with a real checker.
- **Privacy:** no telemetry, no analytics, no accounts. Location never leaves the device.
- **Testing:** `npm test` — Node's built-in test runner via `tsx` (`node:test` + `node:assert`). **Not jest.** `jest-expo` has an unresolvable peer conflict with `react-native@0.86.2` (it wants `@react-native/jest-preset@^0.86.3`, RN pins `0.86.2`), and it would drag the entire React Native test environment in to test pure functions that import no RN at all. `tsx` resolves the `@/*` tsconfig paths and runs the suite in under a second. Revisit only if component tests are ever needed.

  Unit tests cover everything in `src/lib/astronomy/`. Use **publicly verifiable, impersonal reference dates** — do not put personal dates in test fixtures. Good fixtures, since a lunar eclipse can only occur at exactly full and a solar eclipse at exactly new, which pins the math against physics rather than against arithmetic:

| Date (instant, UTC) | Assert |
|---|---|
| 2000-01-21 04:44 — total lunar eclipse | `fraction ≈ 1.0000` |
| 2015-09-28 02:47 — total lunar eclipse | `fraction ≈ 1.0000` |
| 2024-04-08 18:17 — total solar eclipse | `fraction ≈ 0.0000` |
| 2015-09-28 02:47 @ Greenwich | `brightLimbAngleDeg ≈ 133.87` (guards the §5.1 regression) |

  Also assert `getBrightLimbAngle` stays within `(-180, 180]`, and that Moon Return on a known date yields the +11/+19/+30 structure.

---

## 15. Build Phases

**Phase A — Correctness foundation. DONE.** `brightLimb` fix (**done**), shared date/timezone helpers (§6.1), `isTruePhase` (§6.2), delete `lightTravel*.ts` and `hubbleJwst.ts`, tests from §14. *Done when the astronomy lib is green and the dead modules are gone.*

**Phase B — Recurrence engine. DONE.** `moonReturn.ts` and `rarity.ts`. Pure functions, no UI. *Done when a known date reproduces the +11/+19/+30 structure and measured rarity matches §6.4.*

**Phase C — Detail screen. DONE** (rewritten, 825 -> 292 lines, sections extracted to `src/components/detail/`).** Cut the 825-line five-section screen down to the §2 order. Delete the light-travel and observatory sections; demote planetary ages off-screen. Moon Return and rarity become the top content until the sky render exists. *Done when the screen is materially shorter and leads with recurrence.*

**Phase D — Life ledger. DONE.** `lifeLedger.ts` + `apodBatch.ts` + `useApodBatch` + `/ledger/[id]`.

  `fetchApodBatch` takes injectable `fetcher`/`cacheReader`/`cacheWriter` seams. This is deliberate: the concurrency bound and the 429 circuit breaker are the only genuinely interesting logic in the networking layer, and neither is observable without standing in for the network. Tests cover cache-first, the concurrency ceiling, early stop on 429, and per-item failure isolation.

**Phase E — APOD hero policy.** §8.3 classifier and the demoted card. *Done when illustrative and video dates render as labelled cards and the screen is still complete with the network off.*

**Phase F — Sky render (static). DONE.** `bsc.json` (2,887 stars), `skyTransform.ts`, `skyBodies.ts`, `SkyCanvas.tsx`, `SkySection.tsx`.

  The transform is cross-validated against **astronomy-engine**, an independent implementation: worst disagreement **23.6 arcseconds** across 100 comparisons spanning 1990-2050 and five sites from the Arctic to Sydney. Asserting my own arithmetic against numbers derived from that same arithmetic would prove nothing; agreeing with a separate codebase does.

  The catalog is built by `scripts/build-star-catalog.mjs` from the Yale BSC5 so the bundled data is reproducible rather than a blob to trust. Byte offsets are verified in tests against four stars with independently known J2000 positions.

**Phase G — Immersive mode. DONE (rebuilt).** `attitude.ts`, `skySphere.ts`, `useSkyOrientation.ts`, `/sky/[id]`.

  The first attempt worked but felt wrong — laggy, jittery, and inaccurate enough that a target stayed on screen no matter how the phone turned. Three separate causes, three separate fixes:

  **1. Orientation was not an orientation.** Altitude came from the `beta` Euler angle alone and azimuth from the compass alone. Two decoupled scalars do not compose into a pointing direction, and roll was ignored entirely. `attitude.ts` now builds the full W3C ZXY rotation and rotates the device's viewing axis (-Z, out of the back) into the world frame. Pinned by tests asserting physical cases: a flat screen-up phone looks DOWN, a full yaw sweep visits every azimuth exactly once.

  **2. Sensor fusion, not sensor averaging.** The gyro attitude is fast and smooth but its azimuth zero is arbitrary; the compass knows north but is noisy. The compass now contributes ONLY a slowly-varying north offset, hard-smoothed. Because that offset is near-constant, smoothing it heavily removes jitter without adding any lag to head movement.

  **3. Smoothing runs on the frame clock, not the sensor clock.** Sensor callbacks write to refs; a requestAnimationFrame loop eases toward them and publishes one state update per frame, with a snap threshold so fast turns don't drag behind the hand.

  **Rendering.** Positions are precomputed once per date/place into flat `Float32Array`s (`skySphere.ts`); a frame is three dot products per star into a reused buffer, with no allocation. Stars draw as four batched Skia `Path`s bucketed by brightness — the previous revision emitted ~1,400 `<Circle>` elements and rebuilt every one each frame, which was the lag. The catalog is now the full BSC5 depth (**8,404 stars**, mag <= 6.5, 466KB), with a per-surface magnitude limit that opens up as you zoom in.

  Nothing is culled by altitude: the whole celestial sphere is retained so the view passes through the horizon and keeps going. Standing somewhere means being able to look down.

  Drag and pinch-to-zoom (18-100° FOV) via gesture-handler. `GestureHandlerRootView` wraps the app in `_layout.tsx` — without it every `GestureDetector` throws at render.

  Per §7.3 there is still no reticle: a ±10-15° compass error makes any precision affordance a lie the interface tells continuously.

  Sensors used: `Accelerometer` (gravity), `Magnetometer` (north), `Gyroscope` (angular speed, driving adaptive smoothing), `DeviceMotion` (sign referee only), and the compass for magnetic declination alone. See §7.5.

  **Verified in the simulator:** rendering, drag, pinch, below-horizon, and the no-sensor degradation path. **Smoothness on real hardware is the user's call** — the simulator has no motion sensors, so frame pacing under live gyro input cannot be measured here.

### 7.5 Orientation and the render loop — three bugs worth remembering

**Sensor conventions are not portable, so do not assume them.** Two separate inversions shipped from assuming one:
- W3C `alpha` runs counter-clockwise; compass azimuth runs clockwise. Getting that backwards mirrors the view about north (east reads as west).
- Android's accelerometer reports the *reaction* to gravity (+9.81 on z face-up); iOS CoreMotion reports the opposite. One sign flip inverts altitude AND mirrors azimuth, because east comes from `magnetic x gravity`.

  Both are now resolved at runtime. Orientation comes from gravity and the magnetic field (`lookDirectionFromSensors`), which is physics rather than convention, and the accelerometer's sign is refereed against the Euler tilt (`gravitySignFromEuler`) using only `beta`/`gamma` — never `alpha`, the angle vendors actually disagree about.

**Sample sensors at matched rates.** Altitude depends only on gravity; azimuth on gravity *and* the magnetometer. `DeviceMotion` is a composite sensor that on Android ignores `setUpdateInterval` and runs slower than the magnetometer, so vertical motion stepped while horizontal stayed smooth. Gravity now comes from the raw `Accelerometer`, with `Magnetometer` and `Gyroscope` on the same 60Hz cadence.

**The camera frame needs roll, not just a direction.** Deriving `right` from the look azimuth and forcing its z to zero pins the horizon parallel to the screen's x-axis, so rotating the phone to landscape leaves the horizon running across the screen instead of up it. The frame now comes from the full device basis (`cameraAxesFromBasis`), and roll is read from gravity — stable and drift-free — while the view direction comes from the fused estimate. Drag mode passes roll 0, which is what a dragged view should do.

**Fuse the sensors, don't average them.** Accelerometer + magnetometer give an orientation that is stable over minutes but noisy frame to frame; the gyroscope gives motion that is smooth over a second but drifts over minutes. Neither alone is enough, and smoothing the noisy one hard enough to look calm necessarily makes it lag — that trade is unwinnable. A complementary filter escapes it: integrate the gyro for the fast motion (`integrateGyro`), then blend gently toward the absolute reading (`blendToward`, factor ~0.035) to cancel its drift. The per-frame easing on top is then only a polish pass, not the thing holding the view together.

**Runtime auto-detection is not always better than a tested constant.** The accelerometer's sign was briefly refereed against DeviceMotion's Euler tilt — but Euler convention is the very thing that proved unreliable, and the referee got it wrong on real hardware. It is now a constant measured on a device, with a manual override kept in the debug panel for hardware that disagrees.

**Never publish a realtime view through React state.** Rendering the sky from `useState` ran a full reconciliation 60 times a second, congesting the JS thread so badly it delayed the sensor callbacks themselves — 30-50fps of frames carrying 10-20Hz of data. The view now lives in a ref, a frame loop writes Skia paths into Reanimated shared values, and React re-renders only for things a person changes (field of view, mode) plus a 4Hz text label. Measured cost of the maths is 0.05ms/frame against a 16.7ms budget, which is why the framework was never the bottleneck.

**Phase H — Export + Today surface.** §12 card; Home shows tonight's sky; optional notification when a return approaches. *Done when a card exports crisply at both sizes and Home gives a reason to open the app on an ordinary day.*

---

## 16. Current state — read this first

Everything through **Phase G is built, tested and verified on real hardware** (iPhone simulator + a Pixel 7 Pro). Phases A–G are marked DONE in §15 with their specifics.

**Nothing is committed.** The working tree has ~50 changed/new files on `main` against a last commit of `85e3556`. That commit predates essentially all of this work.

```
npm test          98 tests, all passing (tsx + node:test, NOT jest — see §14)
npx tsc --noEmit  clean
```

**Bundled data (795KB total), all reproducible from `scripts/`:**

| File | Contents | Source |
|---|---|---|
| `src/data/bsc.json` | 8,404 stars to mag 6.5, with 333 IAU proper names merged in | Yale BSC5 (public domain) + IAU-CSN |
| `src/data/constellations.json` | 89 constellations, 150 line segments | d3-celestial (BSD-3) |
| `src/data/messier.json` | 110 deep-sky objects, 40 galaxies | d3-celestial (BSD-3) |
| `assets/moon_disc.png` | 397x397 orthographic near-side moon disc with alpha limb (292KB) | NASA LRO / CGI Moon Kit (public domain) |

Rebuild with `node scripts/build-star-catalog.mjs <bsc5.dat>` then
`node scripts/build-sky-data.mjs <constellations.lines.json> <IAU-CSN.txt> <messier.json>` then
`node scripts/build-moon-texture.mjs [assets/2k_moon.jpg] [assets/moon_disc.png]`.

### 16.1 What each module is for

- **`lib/astronomy/`** — all pure functions, no network, no RN imports. This is where the tests live and where bugs are cheapest to catch.
  - `moonPhase` illumination + the honest-labelling rules (§6.2); `moonReturn` the recurrence engine (§6.3); `rarity` measured frequencies (§6.4); `lifeLedger` one row per year; `brightLimb` crescent tilt and rotation transforms; `dateUtils` the date conventions (§6.1); `planetaryAge` the demoted utility.
  - `skyTransform` RA/Dec → alt/az, cross-validated to 24 arcsec against astronomy-engine; `skySphere` the precomputed sphere and allocation-free projection; `skyBodies` planets/moon/sun; `attitude` device orientation, sensor fusion, camera frames (§7.5).
- **`hooks/useSkyOrientation`** — the sensor stack. Three raw sensors at 60Hz, complementary filter, roll extraction. The single most bug-prone file in the app; read §7.5 before touching it.
- **`app/sky/[id]`** — immersive renderer. One `SkPicture` per frame, no React elements for sky content.
- **`lib/apod/`** — network boundary. `apodBatch` has injectable seams because concurrency and the 429 breaker are unobservable otherwise.

### 16.2 Hard-won lessons, all documented inline

Seven real bugs shipped and were fixed during construction. Each has a comment at the site and a regression test. Do not undo them:

1. **SunCalc v2 returns degrees, not radians** (§5.1) — a spec error that silently rendered the moon at a 57x-wrong tilt.
2. **Phase names are buckets, not measurements** (§6.2) — `round(phase*8)` calls a 96% moon "Full". Both over- and under-claiming are bugs.
3. **`MoonReturn.direction` is relative to the milestone, not to today** — using it for "in N years" produced negative years.
4. **Typed locations were stored with lat/lng 0** (§10) — silently disabling the sky render for exactly the historical dates the app exists for.
5. **Sensor conventions are not portable** (§7.5) — two separate inversions came from assuming one.
6. **A realtime view must not publish through React state** (§7.5) — it congested the JS thread badly enough to starve the sensors feeding it.
7. **Bright-limb rotation was inverted and datum-mismatched across all consumers** (Task 0): `getBrightLimbAngle` measures position angle from zenith counter-clockwise (East-ward / left in sky), while screen transforms rotate clockwise. The unrotated glyphs had their bright limb on the right (+90° from zenith), creating a 90° datum offset. Flipping with `isWaxing` double-counted the lit side because the angle already determines which side is lit. Unified into `getMoonLimbRotation` and `getMoonTextureRotation` without mirroring.

### 16.3 Verification habits that paid off

- Cross-validate against an **independent implementation**, not against your own arithmetic. `skyTransform` agrees with astronomy-engine to 24 arcseconds across 100 comparisons; that is evidence, whereas asserting my own formula against numbers I derived from it would have proved nothing.
- **Measure before optimising.** The per-frame maths was benchmarked at 0.05ms against a 16.7ms budget, which is what ruled out a Flutter/C++ rewrite: a Pixel 7 Pro cannot fail to draw 275 dots, so the framework was never the bottleneck.
- Use **impersonal, publicly verifiable fixtures** (§14). Eclipse instants pin illumination against physics.

---

## 17. Backlog — next session starts here

### 17.1 Moon rendering is geometrically wrong at some phases. DONE.

Replaced the 3-View ellipse approximation in `MoonPhaseGlyph.tsx` and the flat card moon in `ExportCardCanvas.tsx` with the real NASA LRO lunar texture (`assets/moon_disc.png`), lit by exact 2-arc Skia path geometry (`litMoonPath`). Generated via reproducible Node script `scripts/build-moon-texture.mjs`. The texture is never mirrored, and rotates together with the terminator via `getMoonTextureRotation`.


Needs a public-domain moon texture (NASA/LRO imagery is public domain).

### 17.2 APOD images should open full screen. DONE.

Built `ImageViewerModal` with pinch-to-zoom (1x to 4x), pan, double-tap to zoom, pull-down to dismiss, and tap-to-toggle minimal chrome. Accessible from both `ApodCard` and every `LedgerRow` thumbnail. Uses `hdurl` on-demand with unmount guarantee so 40 ledger rows never hold more than one in memory.

### 17.3 Sky render — remaining work

- **Constellation figure artwork.** Only the stick-figure lines exist. The mythological figures overlaid faintly would be a large step up. Needs licensed/public-domain artwork and a projection onto the sphere.
- **Label culling by angular distance from the view centre.** Everything in frame is currently labelled, so the edges crowd. Labels should fade or drop with distance from the centre of view.
- **Galaxies and other deep-sky objects need real illustrations**, not the current uniform ellipse marker. A galaxy, a nebula and a globular cluster should not look identical.
- **Too many faint background stars.** The magnitude limit opens up as you zoom, but at wide field the density crams the frame and makes labels hard to read. Needs a density budget, not just a magnitude cut.
- **Labels are locked to the canvas axes.** `cv.drawText` draws axis-aligned, so when the device rolls the sky rotates but the text does not stay level to the viewer. Labels need to counter-rotate by the roll angle (available as `rollFromAxes`), or the text needs drawing in a rotated canvas layer.

### 17.4 Phases still unbuilt

**Phase H** (§15) — the export card at both sizes, and a Home surface showing tonight's sky so the app has a reason to be opened on an ordinary day. The export card renderer exists (`ExportCardCanvas`) but has not been visually verified at either output size.

Also unbuilt: any commit history for this work, and an EAS build for distributing the APK.

---

## Appendix — Folder structure

```
scripts/
├── build-star-catalog.mjs      # Yale BSC5 -> bsc.json
└── build-sky-data.mjs          # constellations, IAU names, Messier
src/
├── app/
│   ├── _layout.tsx             # fonts, GestureHandlerRootView, routes
│   ├── index.tsx               # home: the record ledger
│   ├── milestone/{new,[id]}.tsx
│   ├── milestone/edit/[id].tsx
│   ├── sky/[id].tsx            # immersive renderer (one SkPicture per frame)
│   ├── ledger/[id].tsx
│   ├── export/[id].tsx
│   ├── age-converter.tsx
│   └── settings.tsx
├── components/
│   ├── MilestoneForm.tsx       # shared by create + edit — do not fork
│   ├── MoonPhaseGlyph.tsx      # see §17.1 — geometry is wrong at some phases
│   ├── MilestoneListRow.tsx
│   ├── LedgerRow.tsx
│   ├── SkyCanvas.tsx           # static disc chart (detail hero)
│   ├── ExportCardCanvas.tsx
│   └── detail/{SectionHeader,SkySection,MoonSection,RaritySection,MoonReturnSection,ApodCard}.tsx
├── hooks/{useApod,useApodBatch,useSkyOrientation}.ts
├── store/{useMilestonesStore,useSettingsStore}.ts
├── lib/
│   ├── astronomy/
│   │   ├── moonPhase.ts  moonReturn.ts  rarity.ts  lifeLedger.ts
│   │   ├── brightLimb.ts  dateUtils.ts  planetaryAge.ts
│   │   ├── skyTransform.ts  skySphere.ts  skyBodies.ts  attitude.ts
│   │   └── __tests__/{astronomy,attitude,skyTransform,lifeLedger}.test.ts
│   └── apod/
│       ├── apodClient.ts  apodCache.ts  apodClassify.ts  apodBatch.ts
│       └── __tests__/{apodBatch,apodClassify}.test.ts
├── data/{bsc,constellations,messier}.json
├── constants/theme.ts          # the Record Sheet design system (§11)
└── types/index.ts
```

Deleted during the rebuild: `lightTravel.ts`, `lightTravelDataset.ts`, `hubbleJwst.ts`, `light-travel-objects.json`, `hubble-jwst-curated.json`, `react-native-view-shot`, and the Fraunces/Manrope font packages.
