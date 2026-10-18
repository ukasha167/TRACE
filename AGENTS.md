# TRACE

An offline-first astronomy app about recurrence. Give it a date, and it works out the moon that hung
over that place that night, how uncommon that sky was, and the years it comes back.

Expo + React Native + TypeScript. Everything except the NASA image feed runs on the device.

## Where the detail lives

This file is the operating guide. The specification is split by concern, and each of these is the
authority for its own subject.

| Doc | Authority for |
|---|---|
| [docs/PRD.md](docs/PRD.md) | The thesis, the feature set, screens, what is cut and why, backlog. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, layers, module map, storage, the render path, data files. |
| [docs/ASTRONOMY.md](docs/ASTRONOMY.md) | Date conventions, phase honesty, moon return, rarity, orientation maths, fixtures. |
| [docs/DESIGN.md](docs/DESIGN.md) | The Keepsake / Nocturne system: colour, type, grid, motion, hard rules. |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Every bug that shipped, and why the fixes look the way they do. |

Read DECISIONS.md before changing anything in `lib/astronomy/`, `hooks/useSkyOrientation.ts`, or
`app/sky/[id].tsx`. Most of what looks like an odd choice in those files is a scar.

## Four rules that override everything else

1. **Never state an astronomical claim the data does not support.** The app's premise is that the
   numbers are real. A rounded label that reads as a precise claim is a bug, not a UI detail. The
   exact percentage always ships alongside the phase name.
2. **Verify constants and library units against the installed library, not against memory.** Check
   the bundled `.d.ts`, not `@types/*`, and not your recollection. A spec assertion about SunCalc's
   units shipped a moon rendered at a 57x wrong tilt.
3. **Never derive a measurement from a bucket.** `phaseIndex` is an 8-way bucket that straddles each
   syzygy. Waxing comes from `snapshot.waxing`, illumination from `phaseFraction`. This class of bug
   has shipped twice.
4. **Text is never truncated.** No `numberOfLines`, no ellipsis. Layouts grow to fit.

## Commands

```bash
npx expo start          # then i for iOS simulator, a for Android
npm test                # 251 tests, tsx + node:test. NOT jest.
npx tsc --noEmit
```

Both must be green before anything is called done.

## Layout

```
src/
├── app/            Expo Router routes. Screens only.
├── components/     Presentation. No astronomy, no network.
│   ├── detail/     The record detail sections.
│   ├── moon/       The moon's SkSL lighting shader, its uniforms and textures, the star field.
│   └── sky/        The Milky Way and moonlit-sky shader; true-size sun and planet discs.
├── hooks/          Stateful glue.
├── store/          Zustand + AsyncStorage.
├── lib/
│   ├── astronomy/  Pure functions. No network, no RN imports, no side effects. Most tests point here.
│   ├── reminders/  The reminder plan and its words. Pure.
│   ├── backup/     The records file, written and read. Pure.
│   ├── apod/       NASA's pictures: the API, the archive pages, the cache. Network lives here.
│   └── occasion.ts Reads a date's type from its title. Pure.
├── data/           bsc.json (with B-V), constellations.json, constellationStars.json, milkyWay.json. Rebuildable from scripts/.
├── constants/      theme.ts. The only file allowed a colour literal.
└── types/          Shared shapes. Nothing else defines a domain type.
```

## Conventions that bite

**Dates.** Never `new Date("YYYY-MM-DD")`. It parses as UTC midnight and lands on the previous day
anywhere behind UTC. Use `toLocalNoon` for identity, `toLocalNight` for anything about how the moon
looked, `toLocalDayStart` for the syzygy check.

**Timezones.** A record with a location is evaluated in *that place's* local time, not the device's.
A birthday in Tokyo is a Tokyo night. A typed place's offset is estimated from its longitude, so a
record's clock time is never printed; say it against sunset or sunrise (`nightFacts`). Tonight's live
sky is the exception: the phone's own clock for the phone's own place is exact. Decision 33.

**NASA's API is not trusted on a 200.** For past dates it answers with its logo. `apodArchive` reads
the archive page instead, and `isPlaceholderApod` keeps the logo out of the cache. Decision 38.

**Boundaries.** No raw API response shape gets past its own module. NASA's fields are mapped into
`ApodCacheEntry` at the fetch boundary.

**The immersive view never publishes through React state.** The view lives in a ref, a frame loop
writes Skia paths into shared values, and geometry and text go into one `SkPicture` per frame. React
re-renders only for what a person changes.

**The moon is shaded, not cut out.** `components/moon/moonShader.ts` lights a sphere per pixel
from `lib/astronomy/moonLighting.ts`. Both the glyph and the export card run it, from the same
uniforms, because a card that does not match the screen it came from is the bug DECISIONS 13 is
about. Read decisions 18 and 20 through 27 before touching it.

**The print exposure and the earthshine gain are one thing.** Both open up as the moon thins, so what
they multiply out to at a thin crescent belongs to neither. They shipped in separate files with
separate DECISIONS entries and a 2% moon printed its night side at a third of its own crescent. They
live together in `lib/astronomy/moonLighting.ts` now, under two invariants a test holds. Decision 27.

**The moon sits on black, and its dark side is a light rather than a mask.** Earthshine is a wrapped
diffuse term from the anti-solar direction scaled by the Earth's own phase, not a fill switched on at
the terminator; the ground under every moon is `space`, not `plate`, because a night side has to be
measurable against something. Decision 21.

**A screen reads one record through `useMilestone`, never through `getMilestone`.** The getter is an
action, its identity never changes, and a selector that returns it subscribes to nothing. Four
screens did that and none of them re-rendered when the record they were showing changed. Decision 25.

**The stars behind the moon are grain, not a chart.** `components/moon/starGrain.ts` is decorative,
and the thing that keeps it inside rule 1 is that it is the same field on every record, every date
and every place, with tints drawn from a distribution rather than assigned. A field seeded per record
would be claiming that this night's sky differed from that one. Nothing labels a star there; the real
sky is `app/sky/[id].tsx`. Every star takes the same blur, because a point spread function belongs to
the air rather than to the star. Decision 26.

**The date wheel on Android is ours.** iOS keeps `UIDatePicker`; Android would otherwise get the
Material calendar dialog, which is a modal on a screen that is one continuous scroll.
`components/WheelDatePicker.tsx` is written rather than installed because every wheel picker that
looks right is a native module and this app runs in Expo Go. The haptic tick fires per detent
crossed, live, not on momentum end.

**The sky view draws everything at its true size.** The sun, moon and planets subtend their real
angle through the frame's focal length; nothing is enlarged so it can be seen, which is why the zoom
reaches 0.1 degrees. The Milky Way keeps its brightness under zoom because surface brightness does
not change with magnification. Read DECISIONS 55 to 58 before changing `components/sky/`.

**Colour.** Only `theme.ts` holds hex. `SkyColors` is separate from `Colors` on purpose: it answers
to physics, so changing the app's accent must not change a constellation line.

## Writing

Follow the `unslop` skill for everything: comments, commit messages, docs, and chat. No em dashes.
No AI vocabulary. Active voice. Say what a thing does, not how it feels. If a sentence could appear
unchanged in another project's docs, it says nothing and should go.

Code comments earn their place by explaining *why*, usually by naming the bug that would otherwise
come back. Do not narrate what the next line does.

## Current state

Phases A through H are built, tested, and verified on an iPhone simulator and a Pixel 7 Pro. The
improvement stages after them (the reveal, reminders, night facts, star map, sky scrubber, life in
moons, the night card, backup) are verified on the iPhone simulator only. `npm test`
is green at 251 tests and `npx tsc --noEmit` is clean.

Open work is listed at the end of PRD.md.
