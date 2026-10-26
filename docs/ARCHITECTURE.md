# TRACE: architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Expo (managed) + TypeScript | Runs in Expo Go. No custom native modules anywhere. |
| Navigation | `expo-router` | File-based, real native stack behaviour. |
| State | `zustand` + `persist` | About 1 KB, no provider. The whole persisted state is one array. |
| Storage | `@react-native-async-storage/async-storage` | MMKV would force an EAS dev build on day one for a data volume nowhere near AsyncStorage's limits. |
| Sun and moon | `suncalc` 2.0.1 | Returns **degrees**. Read ASTRONOMY.md before touching any angle. |
| Planets, cross-checks | `astronomy-engine` | Also the independent implementation `skyTransform` is validated against. |
| Sensors | `expo-sensors` | Accelerometer, Magnetometer, Gyroscope. Expo Go compatible. Outside Expo Go, Android needs `HIGH_SAMPLING_RATE_SENSORS` or every sensor runs at 5 Hz (DECISIONS 60). |
| Rendering | `@shopify/react-native-skia` | Sky render, moon glyph, export card. |
| Location | `expo-location` | Coordinates and magnetic declination. |
| Dates | `lib/astronomy/dateUtils.ts` | Four helpers own every conversion between a calendar date and an instant. See ASTRONOMY.md. |
| Tests | `tsx` + `node:test` | See below. |
| Fonts | Newsreader / Figtree / JetBrains Mono | See DESIGN.md. |
| Sharing | `expo-sharing` + `expo-file-system` | The card, and the records backup. |
| Restore | `expo-document-picker` | Picks a backup file. Expo Go compatible. |
| Reminders | `expo-notifications` | Local notifications only. Nothing remote, no push token. |
| Haptics | `expo-haptics` | Save, the reveal's landing, the bell, the details fold. Nothing that moves under a finger ticks (DECISIONS 62). |
| Icons | `lucide-react-native` | A few: share, edit, close, bell, compass, hand, chevrons. |

### Why not Jest

`jest-expo` has an unresolvable peer conflict with `react-native@0.86.2` (it wants
`@react-native/jest-preset@^0.86.3`, RN pins `0.86.2`), and it would drag the whole React Native test
environment in to test pure functions that import no React Native at all. `tsx` resolves the `@/*`
tsconfig paths and runs the suite in under a second. Revisit only if component tests are ever needed.

## Commands

```bash
npm install
npx expo start          # then i for iOS simulator, a for Android
npm test                # 228 tests, tsx + node:test
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
│   ├── reminders/  The reminder plan and its words. Pure.
│   ├── backup/     Writing and reading the records file. Pure.
│   └── apod/       NASA's pictures: the API, the archive pages, the cache.
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
| `skyNight` | The night as a span: the scrubber's sidereal camera turn, sunset to sunrise, the Earth's shadow on the moon, where an instant sits in the night. |
| `attitude` | Device orientation, sensor fusion, camera frames. |
| `anniversary` | When a date next comes round and the moon it brings. `anniversaryDate` is the cheap half Home sorts by. |
| `nightFacts` | That night in words: rise and set against sunset and sunrise, highest point, constellation, planets up, any lunar eclipse. Never a clock time. |
| `revealLines` | The four lines the reveal speaks. |
| `tonight` | The next full and new moon, and tonight's rise and set, for the phone's own place and clock. |
| `planetReturns` | When Jupiter and Saturn stand in front of the same stars again, geocentric. |

### `hooks/`

| Hook | Job |
|---|---|
| `useSkyOrientation` | The sensor stack. Three raw sensors at 60 Hz, complementary filter, roll extraction. The single most bug-prone file in the app. Read DECISIONS.md before touching it. |
| `useApod` | One date's APOD, cache first. |
| `useApodBatch` | The ledger's 20 to 40 requests, bounded and progressive. |
| `useCurrentLocation` | The phone's place, from `store/useLocationStore`: remembered across launches, refreshed quietly once a session, and never the reason a permission dialog opens. `request()` does that, from a tap. |
| `useReminders` | Keeps pending notifications in step with the records and bells, opens a record from a tapped reminder, and sends the test one. |
| `useBackup` | Saves the records file through the share sheet and restores one. |
| `useSkyPrewarm` | At idle, builds what the sky would open on: its images and font, the star sphere (`skyCache.ts`) and the moon image. Home and the record screen call it. |

### `lib/apod/`

`apodClient` fetches and maps. Dates more than 14 days old go to `apodArchive` first, which reads
the day's archive page; recent dates, and any page the archive cannot answer for, go to the JSON API.
The API answers most past dates with NASA's logo now, and `isPlaceholderApod` keeps that out of the
cache (decision 38). `apodCache` reads and writes AsyncStorage. `apodClassify` sorts an entry into
photograph, illustrative, or video. `apodBatch` runs the ledger's fan-out.

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
   a person changes (mode, the end of a pinch, a scrubber step at most 30 times a second) and a
   heading label that changes only when the view crosses a compass sector or the horizon.
4. Nothing a finger moves is drawn where the finger put it. Drag, pinch and the time scrubber set a
   target and the frame loop glides toward it (`lib/glide.ts`), so uneven touch events arrive as
   even motion, and a flick coasts. The home carousel runs the same glide in a Reanimated frame
   callback on the UI thread.
5. Native objects are made when the loop starts, not in the frame. react-native-skia reports each
   shader and picture recorder to Hermes as a megabyte, so the recorder, the glare gradients and the
   colour filters are made once, and the two full-screen shaders are made again only when one of
   their uniforms changes (`skyShader.uniformShader`). DECISIONS 65.

Stars draw as batched Skia `Path`s bucketed by brightness. Nothing is culled by altitude, so the
view passes through the horizon and keeps going. Standing somewhere means being able to look down.

**What the view actually shows, and what it leaves out.** The bundled catalogue runs to magnitude
6.5, and the view builds its sphere at 6.2, which is 6,331 stars or 75% of it. The faintest quarter
carries no shape a person recognises and fogs the bright stars that make constellations legible. Any
star with an IAU proper name is kept regardless of the limit.

No deep-sky objects draw. A galaxy or nebula drawn as a chart glyph (dashed oval, box, ringed
cross) is a symbol with no shape of its own, and none of them is a naked-eye sight the way a star is.
DECISIONS 53.

The view opens at the normal lens, 46.8 degrees across the diagonal (`skyView.eyeFieldOfView`), and
"Reset zoom" returns to it. It zooms from 100 degrees to 0.1, a small telescope at about 140x.

The sun, the moon and the planets are drawn at the angle they really subtend
(`skyBodies.angularRadiusDeg` through the frame's focal length). A planet is a point of light until
the zoom resolves its disc, then a phased, flattened, limb-darkened disc on its IAU pole, with
Saturn's rings split around the globe (`components/sky/drawBodies.ts`). Opening the sky from a moon
starts at the field of view in which the moon's true size matches the moon that was tapped, and
zooms out to the eye's.

Stars are coloured from their catalogued B-V (`skyLight.bvToKelvin`, binned into nine temperatures
so colour costs nine extra fills), white below magnitude 4 where the eye sees no colour, and dimmed
by the airmass they are seen through.

The Milky Way is NASA's Deep Star Maps 2020 background layer, the light of Gaia's faint stars, in
its measured colour, white-balanced on the band and saturated 2x. `components/sky/skyShader.ts`
projects it per pixel through the same camera as the stars, with the map's median taken off as a
black point so the sky between is black. The same pass computes moonlight scattered by the air
(Krisciunas and Schaefer 1991), which washes the band out near a bright moon, and extinction toward
the horizon. Twilight and a compressed dark adaptation set one exposure per frame.

The ground is Stellarium's default landscape, the field at Guéreins, baked into one azimuth and
altitude panorama and read per pixel through the ground camera by
`components/sky/landscapeShader.ts`. It is lit by the sun and the moon (`skyView.landscapeLight`),
greys out in the dark, and covers everything below its treeline while the view looks up, dissolving
as the view tips to the horizon (`groundOpacity`). The pass is skipped when no part of the screen is
below the treeline, and otherwise covers only the rectangle that holds the treeline and everything
under it (`skyView.groundBounds`).

A moon drawn small takes a glare round it and a lift in exposure (`skyView.moonGlare`), both gone by
the time the zoom makes it 120 points across.

Constellation figures rest at an alpha almost too faint to notice and lift, with their name, when
the view centre comes within 60% of the half-field of their centroid, easing over about 0.8 seconds.
Figures at rest all draw in one path, so the common case costs what the whole set used to.

The view draws 25 constellations: the zodiac and thirteen that people find without a chart
(`DRAWN` in `scripts/build-sky-data.mjs`). Each carries Stellarium's drawn figure, riding the same
fade and drawn under the lines. While
a figure is lit, every star its lines pass through is labelled, with its proper name, else its Bayer
letter, else its Flamsteed number. Placement
comes from Stellarium's anchor scheme: three points in the illustration are tied to three real
stars, and `anchorTransform` solves the affine map through their projected positions. That is an
approximation of the spherical projection and it is the one Stellarium makes too; it holds because a
constellation spans tens of degrees rather than a hemisphere. The transform returns null rather than
a near-degenerate matrix when an anchor approaches the camera plane.

Labels claim rectangles as they are drawn, and a later label that would overlap is dropped. Priority
runs solar system, named stars, a lit figure's stars, constellation names. While the ground is
solid, nothing under it is labelled.

The star projection costs 0.135 ms a frame with a JIT and 0.70 ms in Node with `--jitless`, the
closer stand-in for Hermes. At 120 Hz the whole frame gets 8.3 ms, shared with every React render,
touch and sensor reading on the JS thread. Decision 59.

## Storage and caching

**Records.** Key `milestones`, one JSON array, through Zustand `persist`. Small enough to read and
write as a single blob.

**APOD cache.** Key `apod-cache:{YYYY-MM-DD}`, one entry each. It never expires and never
invalidates, because the picture NASA featured on a past date does not change. Always check the
cache before any request. This is also the rate-limit strategy: a date viewed once is free forever.

**APOD misses.** Key `apod-missing:{YYYY-MM-DD}`, for dates NASA answered "no picture" for, so a
gap day in the archive is asked about once. Only dates at least two days old are recorded, because
NASA also refuses dates it has not reached yet. Dates before 16 June 1995 are never asked at all.

**Reminders.** Key `reminders`: only the ids of records with the bell on. The words and dates are
rebuilt from the records on every sync, so an edit can never leave a stale notification behind.

**The phone's place.** Key `current-place`: the last place the phone was found, so Home names it on
the first frame.

**Moon textures.** Decoded once per run in `components/moon/moonTextures.ts` and shared by every
glyph. Calling `useImage` per glyph decoded both 1024px maps again for every moon on screen. They
decode to raster at launch, and the splash waits for them for up to a second.

**Sky and moon data is never written to disk.** It is pure computation from bundled data, and
recomputing is cheaper than reading it back. Results are kept in memory instead, in small LRUs
(`lib/memo.ts`): the sky's assets, sphere and moon image, `nightFactsFor`, `planetReturnsFor`, the
star field picture and the card fonts. DECISIONS 63 lists them and why tonight's moon is drawn for a
20 minute step.

**Offline-first.** The detail screen renders completely with no network. APOD and the place lookups
are the only network use, and APOD is cached.

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

Records stay on the device; there is no backend to send them to. Two lookups leave it, each because
the person asked: a typed place goes to the phone's geocoder (Apple on iOS, Google on Android), and
a GPS fix goes to the same service for its name. Settings says so in those words.

Saving with a place typed but not looked up runs the lookup before saving. If it finds nothing, the
form asks rather than saving without a place (decision 42). A place taken from the phone stores the
phone's own offset on the record's date; a typed place stores the longitude estimate.

## Bundled data

604 KB of data under `src/data/`, plus the images below. All of it is reproducible from `scripts/`.

| File | Contents | Source |
|---|---|---|
| `src/data/bsc.json` | 8,404 stars to magnitude 6.5, with 333 IAU proper names and 8,160 B-V colour indices merged in | Yale BSC5, V/50 on VizieR (public domain) + IAU-CSN |
| `assets/sky/milkyway.png`, `src/data/milkyWay.json` | 2048x1024 RGB Milky Way in J2000 RA/Dec, white-balanced on the band, gamma 2.2, its reference radiance and black point | NASA SVS Deep Star Maps 2020, Ernie Wright (public domain) |
| `assets/sky/landscape.png`, `src/data/landscape.json` | 2048x696 RGBA panorama, azimuth across, altitude +18.6 down to the nadir | Stellarium's Guéreins, Fabien Chéreau (**GPL-2.0-or-later**) |
| `src/data/constellations.json` | 25 constellations, 63 line segments | d3-celestial (BSD-3) |
| `src/data/constellationStars.json` | 306 figure stars with chart labels | `scripts/build-constellation-stars.mjs`, from the two files above |
| `src/data/constellationNames.ts` | The 25 drawn constellations' IAU abbreviations to full names | IAU designations |
| `assets/moon_disc.png` | 1024x1024 orthographic near-side albedo, exposure graded, opaque to the corners | NASA LROC WAC / CGI Moon Kit (public domain) |
| `assets/moon_normal.png` | 1024x1024 surface normals for the same projection, y down | NASA LOLA LDEM / CGI Moon Kit (public domain) |
| `assets/moon_disc_256.png`, `assets/moon_normal_256.png` | The same pair box-filtered to 256px, for moons drawn small | `scripts/build-moon-thumbs.mjs` |
| `assets/constellations/figures.png` | 3840x1152 sheet, 25 figure illustrations at 384pt | Stellarium, Johan Meuris (**Free Art License 1.3**) |
| `src/data/constellationArt.json` | Three sky anchors per figure, resolved from HIP through VizieR | Stellarium (CC BY-SA 4.0) |

The figure artwork and the landscape are the two bundled assets that are not public domain. The
Free Art License and the GPL are both copyleft: the images keep their licences, the app's own source
stays MIT, and the attributions in `assets/constellations/ATTRIBUTION.md` and
`assets/sky/ATTRIBUTION.md` have to remain visible in the app's credits.

```bash
node scripts/build-star-catalog.mjs <bsc5.dat>
node scripts/build-sky-data.mjs <constellations.lines.json> <IAU-CSN.txt>
node scripts/build-constellation-stars.mjs   # no network; reads the two files above
node scripts/build-constellation-art.mjs     # downloads Stellarium's illustrations
node scripts/build-star-colours.mjs          # B-V from VizieR; caches under .cache/
node scripts/build-milky-way.mjs             # reads sources/milkyway_2020_4k.exr (see its header)
node scripts/build-landscape.mjs             # reads sources/guereins/ (see its header)
node --max-old-space-size=4096 scripts/build-moon-maps.mjs [grade]
node scripts/build-moon-thumbs.mjs   # the 256px pair only; build-moon-maps runs it too
# Builds moon_disc.png and moon_normal.png together, from one projection, so the
# normals cannot drift out of register with the albedo. Reads the two large
# equirectangular maps from sources/, which are gitignored: sources/README.md
# says where they came from and how to verify a replacement. --list prints the
# grades; `photograph` is the ungraded map.
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
- Date before APOD's start (16 June 1995): not requested. It used to be left to the response, and on
  the shared key the "no" answers for a 1970 birthday spent the hourly quota before any real year.
- Ledger partially fetched: rows render immediately from local moon data, thumbnails fill in.
- `phaseName === "Full Moon"` with `isTruePhase === false`: must not read as a full moon.

## Non-functional

**Performance.** `hdurl` only in the export render and the single active full-screen viewer. List
screens never block on network. The immersive view targets 120 fps on a ProMotion iPhone.

**Privacy.** No telemetry, no analytics, no accounts. Records never leave the device except as a
backup file the person sends themselves. Place lookups go to the phone's geocoder, and dates go to
NASA for pictures.

**Accessibility.** Support OS dynamic type where React Native and Skia allow. Verify contrast with a
real checker.
