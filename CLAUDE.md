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
| [docs/DECISIONS.md](docs/DECISIONS.md) | Fifteen bugs that shipped, and why the fixes look the way they do. |

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
npm test                # 105 tests, tsx + node:test. NOT jest.
npx tsc --noEmit
```

Both must be green before anything is called done.

## Layout

```
src/
├── app/            Expo Router routes. Screens only.
├── components/     Presentation. No astronomy, no network.
│   ├── detail/     The record detail sections.
│   └── moon/       Terminator path geometry.
├── hooks/          Stateful glue.
├── store/          Zustand + AsyncStorage.
├── lib/
│   ├── astronomy/  Pure functions. No network, no RN imports, no side effects. All tests point here.
│   └── apod/       The only code that touches the network.
├── data/           bsc.json, constellations.json, messier.json. Rebuildable from scripts/.
├── constants/      theme.ts. The only file allowed a colour literal.
└── types/          Shared shapes. Nothing else defines a domain type.
```

## Conventions that bite

**Dates.** Never `new Date("YYYY-MM-DD")`. It parses as UTC midnight and lands on the previous day
anywhere behind UTC. Use `toLocalNoon` for identity, `toLocalNight` for anything about how the moon
looked, `toLocalDayStart` for the syzygy check.

**Timezones.** A record with a location is evaluated in *that place's* local time, not the device's.
A birthday in Lahore is a Lahore night.

**Boundaries.** No raw API response shape gets past its own module. NASA's fields are mapped into
`ApodCacheEntry` at the fetch boundary.

**The immersive view never publishes through React state.** The view lives in a ref, a frame loop
writes Skia paths into shared values, and geometry and text go into one `SkPicture` per frame. React
re-renders only for what a person changes.

**Colour.** Only `theme.ts` holds hex. `SkyColors` is separate from `Colors` on purpose: it answers
to physics, so changing the app's accent must not change a constellation line.

## Writing

Follow the `unslop` skill for everything: comments, commit messages, docs, and chat. No em dashes.
No AI vocabulary. Active voice. Say what a thing does, not how it feels. If a sentence could appear
unchanged in another project's docs, it says nothing and should go.

Code comments earn their place by explaining *why*, usually by naming the bug that would otherwise
come back. Do not narrate what the next line does.

## Current state

Phases A through H are built, tested, and verified on an iPhone simulator and a Pixel 7 Pro. `npm
test` is green at 105 tests and `npx tsc --noEmit` is clean.

Open work is listed at the end of PRD.md.
