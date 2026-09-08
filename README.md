# TRACE

An offline-first astronomy app about recurrence. Give it a date you care about and it works out the moon that hung over that place that night, how uncommon that sky was, and the years it comes back.

Built with Expo and React Native. Everything except the NASA image feed runs on the device.

## Why recurrence

19 tropical years is 6939.60 days. 235 synodic months is 6939.69 days. They differ by about two hours, so the moon returns to nearly the same phase on the same calendar date every 19 years. That is the Metonic cycle, the thing the Hebrew calendar and the Easter computus are both built on. Weaker near-repeats sit at 8 years and 11 years, and because their errors have opposite signs, 8 + 11 = 19 cancels them.

So for any date, there is a real and computable set of years where that sky comes back. That is the whole app. Every feature is an instance of it.

An earlier version of this project was a stack of unrelated facts about a date. It had no reason to exist twice. The rewrite threw that out.

## What works today

**Moon return.** Searches 60 years either side of a date for anniversaries whose moon returns to the same phase, and labels each hit with the cycle that produced it.

**Measured rarity.** No adjectives. A moon at 99% or more illumination falls on 6.06% of days, about 1 in 16.5, computed by walking 29,220 days rather than hardcoding a figure. The personal number matters more: 2 of your 23 birthdays had one.

**Life ledger.** One row per year of your life. Age, the real moon at its true phase and tilt, and that date's NASA Astronomy Picture of the Day. A whole life on one vertical axis.

**Immersive sky.** A full-screen planetarium showing the sky as it was over that place on that night, not tonight. 8,404 stars, 89 constellations, 110 Messier objects, the naked-eye planets and the moon. Point the phone and it tracks, or drag and pinch. The horizon rotates with the device and the view passes below it, because standing somewhere means being able to look down.

**Bright-limb tilt.** The moon is drawn at the angle an observer at that latitude actually saw it.

**Export card.** A Skia-rendered share card at 1080x1920 or 1080x1080.

Screens: home, add and edit record, record detail, immersive sky, life ledger, export preview, settings.

## What is left

The full list is at the end of `docs/PRD.md`. The short version:

- Constellation figure artwork that fades in and out and stays pinned to its stars, the way Stellarium does it. The reveal mechanism is cheap; bundled raster artwork is not.
- A notification when a return is approaching. The home screen already knows, but nothing tells you when the app is closed.
- Real timezone data. Offsets are approximated from longitude today.

## Running it

```bash
npm install
npx expo start
```

Then open it in Expo Go, or press `i` for the iOS simulator and `a` for an Android emulator. Everything works in Expo Go. No custom native modules, no development build required.

```bash
npm test          # 105 tests
npx tsc --noEmit
```

## NASA API key

The app reads one date's Astronomy Picture of the Day per milestone, and one per year for the life ledger. That last one matters: a 23 row ledger fires 23 requests on first open, and `DEMO_KEY` allows 30 per hour. Get your own key.

1. Request one at https://api.nasa.gov. It is free, takes a minute, and needs no card.
2. Create `.env` in the project root:

```
EXPO_PUBLIC_NASA_API_KEY=your_key_here
```

3. Restart the dev server so Expo picks up the variable.

`.env` is gitignored. A personal key allows 1,000 requests per hour against `DEMO_KEY`'s 30.

Every APOD response is cached in AsyncStorage under `apod-cache:YYYY-MM-DD` and never expires, because the picture NASA featured on a past date does not change. A date fetched once costs nothing forever, so the ledger becomes fully offline after one pass.

You can also paste a key into Settings at runtime, which overrides the environment variable.

## How it is built

### Layers

`src/lib/astronomy/` holds pure functions. No network, no React Native imports, no side effects. This is the highest risk code in the app and the cheapest to test, so all 105 tests point at it.

`src/lib/apod/` is the only code that touches the network. Response shapes are mapped into the app's own types at the fetch boundary, so no raw API shape reaches a component.

`src/app/` is Expo Router file-based routes. `src/components/` is presentation. `src/store/` is Zustand with AsyncStorage persistence.

The full module map is in `docs/ARCHITECTURE.md`, the domain maths in `docs/ASTRONOMY.md`, and the design system in `docs/DESIGN.md`.

### Decisions worth explaining

**Zustand over Redux.** About 1KB, no provider, and the entire persisted state is one array of milestones.

**AsyncStorage over MMKV.** MMKV would force an EAS development build from day one, and the data volume is nowhere near AsyncStorage's limits. Expo Go compatibility was worth more.

**tsx and node:test instead of Jest.** `jest-expo` has an unresolvable peer conflict with `react-native@0.86.2`, and it would drag the whole React Native test environment in to test pure functions that import no React Native at all. `tsx` resolves the `@/*` path aliases and runs the suite in under a second.

**astronomy-engine alongside SunCalc.** SunCalc covers the sun and moon. The sky render needs planets, so astronomy-engine came in. It doubles as the independent implementation that `skyTransform` is validated against.

**One SkPicture per frame in the immersive view.** Geometry and text are recorded into a single Skia picture handed over through a Reanimated shared value. No React element per star, per line, or per label. This is not only about speed. When the sky drew at 60fps from shared values while labels came from React state at 10Hz, the labels visibly chased the objects they named. Two clocks meant two positions.

**Precomputed celestial sphere.** For a fixed date and place, every star's horizontal position is constant and only the camera moves. The expensive trigonometry runs once into flat `Float32Array`s, so a frame is three dot products per star into a reused buffer with no allocation.

**No reticle in the immersive view.** Phone compasses run 10 to 15 degrees out. Drawing a crosshair on top of that error would be a lie the interface tells continuously.

## Problems worth knowing about

Eighteen bugs shipped during construction and were fixed. Each has a comment at the site and, where it is testable, a regression test. All of them are written up in `docs/DECISIONS.md`.

**SunCalc v2 returns degrees, not radians.** The spec this was built from asserted radians, which was true for v1. The code multiplied an already-degrees value by 180/pi, inflating it 57 times. It did not crash. Normalisation into (-180, 180] turned it into a plausible looking but wrong angle, so the moon simply rendered at the wrong tilt forever. Check the installed type definitions before trusting any angle.

**Phase names are buckets, not measurements.** `Math.round(phase * 8)` labels anything within 1.85 days of full as "Full Moon", which includes moons as low as 87% illuminated. It told me a 96% moon was full. The fix gates the label on illumination and discloses where the exact instant fell. Understating is equally a bug: calling a 99.9% moon "waxing gibbous" is just as wrong in the other direction.

**Typed locations were stored with latitude and longitude 0.** GPS was the only coordinate source, so any historical date, which is nearly all of them, could never get a sky render or a moon tilt. Typed places now resolve through `Location.geocodeAsync`.

**The batch fetcher silently used DEMO_KEY.** `fetchApod(date)` was called without the key argument, so it fell back to the 30 per hour demo key and rate-limited itself on the first ledger open. It looked exactly like flaky network.

**Sensor conventions are not portable.** Two separate inversions came from assuming one. W3C `alpha` runs counter-clockwise while compass azimuth runs clockwise, and getting that backwards mirrors the view about north. Android's accelerometer reports the reaction to gravity while iOS CoreMotion reports the opposite, and that single sign flip inverts altitude and mirrors azimuth together. Orientation now comes from gravity crossed with the magnetic field, which is physics rather than convention.

**A realtime view must not publish through React state.** Rendering the sky from `useState` ran a full reconciliation 60 times a second. It congested the JavaScript thread badly enough to delay the sensor callbacks feeding it, producing 30 to 50fps of frames carrying 10 to 20Hz of data.

## On measuring before rewriting

At one point the immersive view was slow enough that porting to Flutter looked reasonable. Benchmarking settled it: the per-frame maths costs 0.05ms against a 16.7ms budget, and only about 275 stars are on screen at once after frustum culling. A flagship phone cannot fail to draw 275 dots. The framework was never the bottleneck, the render path was, and moving it off React fixed it without a rewrite.

The same habit applies to correctness. `skyTransform` is cross-validated against astronomy-engine, an independently written implementation, and agrees to 23.6 arcseconds across 100 comparisons spanning 1990 to 2050 and five sites from the Arctic to Sydney. Asserting my own arithmetic against numbers derived from that same arithmetic would have proved nothing.

## Data and attribution

| Data | Source | Licence |
|---|---|---|
| 8,404 stars to magnitude 6.5 | Yale Bright Star Catalog, 5th Revised Ed. | Public domain |
| 333 proper star names | IAU Working Group on Star Names (IAU-CSN) | Official IAU catalogue |
| 89 constellation figures | d3-celestial | BSD-3-Clause |
| 110 Messier objects, 24 of them drawn | d3-celestial | BSD-3-Clause |
| 15 constellation figure illustrations | Johan Meuris, for Stellarium | Free Art License 1.3 |
| Figure anchor data | Stellarium | CC BY-SA 4.0 |
| Astronomy Picture of the Day | NASA | Public domain, individual images may be copyrighted |

Everything bundled is rebuildable:

```bash
node scripts/build-star-catalog.mjs <bsc5.dat>
node scripts/build-sky-data.mjs <constellations.lines.json> <IAU-CSN.txt> <messier.json>
node scripts/build-constellation-art.mjs
```

The figure artwork is the one bundled asset that is not public domain. The Free Art License is copyleft, so the images keep it while the app's own source stays MIT, and the attribution in `assets/constellations/ATTRIBUTION.md` must stay visible in the credits.

The catalogue is generated rather than committed as an opaque blob so the byte offsets stay auditable. Four stars with independently known J2000 positions are asserted in the test suite.

## Accuracy and limits

Precession is deliberately skipped. It runs about 50 arcseconds per year, so a 30 year lookback accumulates roughly 25 arcminutes, under a pixel at phone scale. Atmospheric refraction is ignored for the same reason, mattering only within a few degrees of the horizon.

Timezone offsets for historical dates are approximated from longitude. Real timezone boundaries are political and resolving them properly needs a date-keyed database. The value only picks which instant counts as "that night", so an hour of error moves the illuminated fraction by well under a percent. It is correct to the hour for most of the world, about 30 minutes out for India, and up to 2 hours out for western China.

The immersive view shows roughly 8,400 real stars, the constellations, the Messier catalogue and the solar system bodies, placed correctly for a given time and place. There is no deep-sky catalogue beyond Messier, no atmosphere model, no satellites.

Privacy: no telemetry, no analytics, no accounts, no backend. Location never leaves the device.

## Licence

MIT. See `LICENSE`.
