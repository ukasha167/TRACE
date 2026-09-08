# TRACE — architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Expo (managed) + TypeScript | Runs in Expo Go. No custom native modules anywhere. |
| Navigation | `expo-router` | File-based, real native stack behaviour. |
| State | `zustand` + `persist` | About 1 KB, no provider. The whole persisted state is one array. |
| Storage | `@react-native-async-storage/async-storage` | MMKV would force an EAS dev build on day one for a data volume nowhere near AsyncStorage's limits. |
| Sun and moon | `suncalc` 2.0.1 | Returns **degrees**. Read ASTRONOMY.md before touching any angle. |
| Planets, cross-checks | `astronomy-engine` | Also the independent implementation `skyTransform` is validated against. |
| Sensors | `expo-sensors` | Accelerometer, Magnetometer, Gyroscope. Expo Go compatible. |
| Rendering | `@shopify/react-native-skia` | Sky render, moon glyph, export card. |
| Location | `expo-location` | Coordinates and magnetic declination. |
| Dates | `date-fns` | No hand-rolled date arithmetic. |
| Tests | `tsx` + `node:test` | See below. |
| Fonts | Newsreader / Figtree / JetBrains Mono | See DESIGN.md. |
| Sharing | `expo-sharing` + `expo-file-system` | |
| Icons | `lucide-react-native` | |

### Why not Jest

`jest-expo` has an unresolvable peer conflict with `react-native@0.86.2` (it wants
`@react-native/jest-preset@^0.86.3`, RN pins `0.86.2`), and it would drag the whole React Native test
environment in to test pure functions that import no React Native at all. `tsx` resolves the `@/*`
tsconfig paths and runs the suite in under a second. Revisit only if component tests are ever needed.

## Commands

```bash
npm install
npx expo start          # then i for iOS simulator, a for Android
npm test                # 105 tests, tsx + node:test
npx tsc --noEmit
```

## Layers

```
src/
├── app/            Expo Router routes. Screens only.
├── components/     Presentation. No astronomy, no network.
├── hooks/          Stateful glue between libs and screens.
├── store/          Zustand + AsyncStorage persistence.
├── lib/
│   ├── astronomy/  Pure functions. No network, no React Native imports, no side effects.
│   └── apod/       The only code that touches the network.
├── data/           Bundled catalogues, all rebuildable from scripts/.
├── constants/      theme.ts, the design system.
└── types/          Shared shapes. Nothing else defines a domain type.
```

**The boundary rule.** No raw API response shape gets past its own module. `lib/apod/apodClient.ts`
maps NASA's `snake_case` into `ApodCacheEntry` at the fetch boundary, so nothing downstream sees a
field NASA could rename.

**The purity rule.** Everything under `lib/astronomy/` is a pure function. That is where the tests
live and where bugs are cheapest to catch, and it stays true only if nobody imports React Native
into it.

## Module map

### `lib/astronomy/`

| Module | Job |
|---|---|
| `dateUtils` | The date conventions. Calendar date to instant, and back. |
| `moonPhase` | Illumination, phase naming, the honesty rules. |
| `moonReturn` | The recurrence engine. |
| `rarity` | Measured frequencies over a multi-decade window. |
| `lifeLedger` | One row per year of a life. |
| `brightLimb` | Crescent tilt and the glyph rotation transforms. |
| `skyTransform` | RA/Dec to altitude/azimuth. Cross-validated to 24 arcseconds. |
| `skySphere` | The precomputed sphere and the allocation-free projection. |
| `skyBodies` | Planets, moon, sun. |
| `attitude` | Device orientation, sensor fusion, camera frames. |

### `hooks/`

| Hook | Job |
|---|---|
| `useSkyOrientation` | The sensor stack. Three raw sensors at 60 Hz, complementary filter, roll extraction. The single most bug-prone file in the app. Read DECISIONS.md before touching it. |
| `useApod` | One date's APOD, cache first. |
| `useApodBatch` | The ledger's 20 to 40 requests, bounded and progressive. |
| `useCurrentLocation` | Foreground permission, coordinates, reverse-geocoded label. |

### `lib/apod/`

`apodClient` fetches and maps. `apodCache` reads and writes AsyncStorage. `apodClassify` sorts a
response into photograph, illustrative, or video. `apodBatch` runs the ledger's fan-out.

`fetchApodBatch` takes injectable `fetcher` / `cacheReader` / `cacheWriter` seams. That is
deliberate: the concurrency bound and the 429 circuit breaker are the only genuinely interesting
logic in the networking layer, and neither is observable without standing in for the network.

## The immersive render path

This is the one place where the ordinary React model is deliberately abandoned.

1. `buildSkySphere` runs once per date and place. Every star's horizontal position is constant for a
   fixed observer, so the trigonometry happens once into flat `Float32Array`s.
2. A `requestAnimationFrame` loop reads the camera frame from a ref, projects the sphere into a
   reused buffer (three dot products per star, zero allocation), and records geometry **and text**
   into a single `SkPicture`.
3. The picture is handed to Skia through a Reanimated shared value. React re-renders only for things
   a person changes: field of view, mode, and a 4 Hz text label.

Stars draw as batched Skia `Path`s bucketed by brightness. Nothing is culled by altitude, so the
view passes through the horizon and keeps going. Standing somewhere means being able to look down.

**What the view actually shows, and what it leaves out.** The bundled catalogue runs to magnitude
6.5, and the view builds its sphere at 6.2, which is 6,331 stars or 75% of it. The faintest quarter
carries no shape a person recognises and fogs the bright stars that make constellations legible. Any
star with an IAU proper name is kept regardless of the limit.

Of the 110 Messier objects, 24 draw: the galaxies, nebulae, planetary nebulae and supernova remnants
that carry a common name. Anonymous objects ("M58", "M59") cost the reader the sky behind them, and
cluster glyphs sit on top of stars the catalogue is already drawing correctly. Dropping M45 does not
remove the Pleiades; it returns them to being seven stars.

Constellation figures rest at an alpha almost too faint to notice and lift, with their name, when
the view centre comes within 60% of the half-field of their centroid, easing over about 0.8 seconds.
Figures at rest all draw in one path, so the common case costs what the whole set used to.

Fifteen of them also carry a drawn figure, riding the same fade and drawn under the lines. Placement
comes from Stellarium's anchor scheme: three points in the illustration are tied to three real
stars, and `anchorTransform` solves the affine map through their projected positions. That is an
approximation of the spherical projection and it is the one Stellarium makes too; it holds because a
constellation spans tens of degrees rather than a hemisphere. The transform returns null rather than
a near-degenerate matrix when an anchor approaches the camera plane.

Labels claim rectangles as they are drawn, and a later label that would overlap is dropped. Priority
runs solar system, named stars, deep sky, constellation names.

Measured cost of the per-frame maths is 0.05 ms against a 16.7 ms budget.

## Storage and caching

**Records.** Key `milestones`, one JSON array, through Zustand `persist`. Small enough to read and
write as a single blob.

**APOD cache.** Key `apod-cache:{YYYY-MM-DD}`, one entry each. It never expires and never
invalidates, because the picture NASA featured on a past date does not change. Always check the
cache before any request. This is also the rate-limit strategy: a date viewed once is free forever.

**Sky and moon data is never cached.** It is pure computation from bundled data, and recomputing is
cheaper than storing.

**Offline-first.** The detail screen renders completely with no network. Only APOD touches the
network and it is cached.

## NASA API key

The ledger fires one request per year of a life on first open. `DEMO_KEY` allows 30 requests per
hour; a free personal key allows 1,000.

```
EXPO_PUBLIC_NASA_API_KEY=your_key_here     # in .env, gitignored
```

Settings offers a runtime override that wins over the environment variable. The key is free,
rate-limited, carries no billing exposure and no PII, so it is embedded rather than proxied. Worst
case on a leak is quota theft.

## Location

Captured per record, always optional.

1. Optional location field on the form.
2. "Use current location" goes through `requestForegroundPermissionsAsync`, then reverse-geocodes a
   label.
3. Typed entry resolves through `Location.geocodeAsync`. GPS only ever describes where you are
   standing now, and nearly every record is historical.
4. `timezoneOffsetMin` is captured for the record's own date, not today's.
5. Denied or skipped saves `location: null`. The sky render and the tilt are unavailable; phase,
   fraction, returns, and rarity all still work.

All location data stays on the device. There is no backend to send it to.

## Bundled data

795 KB total, all reproducible from `scripts/`.

| File | Contents | Source |
|---|---|---|
| `src/data/bsc.json` | 8,404 stars to magnitude 6.5, with 333 IAU proper names merged in | Yale BSC5 (public domain) + IAU-CSN |
| `src/data/constellations.json` | 89 constellations, 150 line segments | d3-celestial (BSD-3) |
| `src/data/messier.json` | 110 deep-sky objects, 40 of them galaxies | d3-celestial (BSD-3) |
| `src/data/constellationNames.ts` | 88 IAU abbreviations to full names | IAU designations |
| `assets/moon_disc.png` | 397x397 orthographic near-side moon disc with an alpha limb | NASA LRO / CGI Moon Kit (public domain) |
| `assets/constellations/figures.png` | 2048x2048 sheet, 15 figure illustrations at 512pt | Stellarium, Johan Meuris (**Free Art License 1.3**) |
| `src/data/constellationArt.json` | Three sky anchors per figure, resolved from HIP through VizieR | Stellarium (CC BY-SA 4.0) |

The figure artwork is the one bundled asset that is not public domain. The Free Art License is
copyleft: the images keep it, the app's own source stays MIT, and the attribution in
`assets/constellations/ATTRIBUTION.md` has to remain visible in the app's credits.

```bash
node scripts/build-star-catalog.mjs <bsc5.dat>
node scripts/build-sky-data.mjs <constellations.lines.json> <IAU-CSN.txt> <messier.json>
node scripts/build-moon-texture.mjs [assets/2k_moon.jpg] [assets/moon_disc.png]
node scripts/build-constellation-art.mjs          # downloads; caches under .cache/
```

The catalogue is generated rather than committed as an opaque blob so the byte offsets stay
auditable. Four stars with independently known J2000 positions are asserted in the test suite.

## States checklist

- No records: Home empty state with a real CTA, not a blank list.
- APOD failure, 429, or non-200: retryable error state. The screen is still complete.
- APOD video or illustrative: labelled card, never a stretched hero.
- Offline and uncached: an explicit message, not an infinite spinner.
- Location denied: saves with `location: null`, sky render unavailable, everything else intact.
- Magnetometer low accuracy: fall back to drag-to-pan and say why.
- Date before APOD's start: handled by the response, never a hardcoded cutoff.
- Ledger partially fetched: rows render immediately from local moon data, thumbnails fill in.
- `phaseName === "Full Moon"` with `isTruePhase === false`: must not read as a full moon.

## Non-functional

**Performance.** `hdurl` only in the export render and the single active full-screen viewer. List
screens never block on network. The immersive view targets 60 fps.

**Privacy.** No telemetry, no analytics, no accounts. Location never leaves the device.

**Accessibility.** Support OS dynamic type where React Native and Skia allow. Verify contrast with a
real checker.
