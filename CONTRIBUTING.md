# Contributing to TRACE

TRACE tells people what the sky did on a night that mattered to them, so a wrong number is the worst bug it can have. Most of this file is about keeping the numbers honest.

## Set up

You need Node.js 20.19.4 or newer and either Expo Go on a phone or a simulator.

```bash
git clone https://github.com/ukasha167/TRACE.git && cd TRACE && npm install && npx expo start
```

Press `i` for the iOS simulator or `a` for the Android emulator, or scan the QR code with Expo Go.

## Before you open a pull request

```bash
npm test            # 253 tests, tsx + node:test (not Jest)
npx tsc --noEmit
```

Both must pass. CI runs the same two commands on every pull request.

## Rules the code already follows

1. **No astronomical claim the data does not support.** The exact percentage always ships beside the phase name. A label that rounds 99.96% to "100%" is a bug.
2. **Check library units against the installed package.** Read the `.d.ts` inside `node_modules`, not `@types/*` and not memory. A wrong assumption about one library's units once tilted the moon 57 times too far.
3. **Never derive a measurement from a bucket.** `phaseIndex` is an 8-way bucket. Waxing comes from `snapshot.waxing`, illumination from `phaseFraction`.
4. **Text is never truncated.** No `numberOfLines`, no ellipsis. Layouts grow to fit.

Dates: never write `new Date("YYYY-MM-DD")`, which lands on the previous day anywhere west of UTC. Use `toLocalNoon`, `toLocalNight` or `toLocalDayStart`.

Colours live only in `src/constants/theme.ts`.

Before changing `src/lib/astronomy/`, `src/hooks/useSkyOrientation.ts` or `src/app/sky/[id].tsx`, read [docs/DECISIONS.md](docs/DECISIONS.md). Most odd-looking choices in those files are fixes for bugs that shipped.

## Tests

Astronomy lives in pure functions under `src/lib/`, and that is where tests go. Use public reference dates and places (an eclipse, a transit, a famous night) so anyone can check the expected value against an outside source.

## Commits

One change per commit, with a prefix: `ADD:`, `UPDATE:`, `FIX:` or `REFACTOR:`, then what changed in the present tense.

```
FIX: stop the reveal printing a 99.96% moon as 100%
```

## Where to start

- Issues labelled [good first issue](https://github.com/ukasha167/TRACE/labels/good%20first%20issue) are small and self-contained.
- The backlog at the end of [docs/PRD.md](docs/PRD.md#backlog) lists the larger open work.
- Questions and half-formed ideas go in [Discussions](https://github.com/ukasha167/TRACE/discussions).

## Where the detail lives

| Doc | Covers |
|---|---|
| [docs/PRD.md](docs/PRD.md) | What TRACE is for, its screens, what was cut and why |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, modules, storage, the render path |
| [docs/ASTRONOMY.md](docs/ASTRONOMY.md) | Date conventions, phase rules, returns, rarity, orientation maths |
| [docs/DESIGN.md](docs/DESIGN.md) | Colour, type, grid, motion |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Every bug that shipped and why each fix looks the way it does |
