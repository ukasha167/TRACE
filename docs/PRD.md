# TRACE — product definition

## The thesis

The sky repeats itself for you.

TRACE is not an app that prints facts about a date. It is an app about *recurrence*: the sky keeps a
schedule, and that schedule lines up with the dates people care about. An anniversary is recurrence.
The Metonic cycle is recurrence. Every feature is an instance of that one idea, and any proposed
feature that is not should be rejected.

The test for a new feature is never "is this a cool space fact". It is "is this the sky keeping time
with a person."

### Why recurrence is the right spine

19 tropical years is 6939.60 days. 235 synodic months is 6939.69 days. They differ by about two
hours, so the moon returns to nearly the same phase on the same calendar date every 19 years. That
is the Metonic cycle, and both the Hebrew calendar and the Easter computus are built on it.

Weaker near-repeats sit at 8 years (about 1.6 days of drift) and 11 years (about 1.5 days, drifting
the other way). Their errors have opposite signs, so 8 + 11 = 19 cancels them. That is why 19 is the
strong one, and why 30 (11 + 19) and 38 (19 + 19) are strong too.

For any date a person cares about there is a real, computable, non-obvious set of years where their
sky comes back. That is the product.

### The failure mode to avoid

An earlier revision was a feature list rather than a product: five independent sections stacked on
one screen, each a different fact about a date, none of them speaking to each other. Anything that
pulls back toward that shape is a regression.

## Feature status

| Feature | Status | Why |
|---|---|---|
| Moon return | Core | The thesis, made literal. |
| Life ledger | Core | One row per year of a life: age, the real moon, that day's APOD. |
| Rarity, computed | Core | Measured frequencies, never adjectives. |
| Immersive sky | Core | The sky over *that place* on *that night*, held up in the hand. |
| Bright-limb tilt | Supporting | Folds into the moon glyph and the sky render. |
| Constellation figures | Supporting | Lines and names for all 88, drawn artwork for the 15 people look for. |
| NASA APOD per date | Supporting | A secondary card, never the hero. |
| Export card | Supporting | Skia card at 1080x1920 or 1080x1080. |
| Tonight surface | Supporting | The app is about now as well as then. |
| Planetary age converter | Cut | Every space-novelty app has this. Removed, screen and library both. |
| Light-travel distances | Cut | Emotionally inert. Nobody is alive for the arrival and the user cannot go look at the object. |
| Hubble/JWST curated set | Cut | A worse APOD at higher curation cost, visibly redundant under the real NASA image. |
| Backend, accounts, sync | None | Fully local, offline-first, single device. |

## User journey

1. Open the app. Home leads with tonight's moon over the current location, then the saved records.
2. Tap `+`. Title, type, date, optional location.
3. The app computes the moon, its rarity, the return years, and the sky for that date and place,
   then fetches and caches the APOD.
4. The detail screen leads with the moon that night, then rarity, then the returns, then the ledger
   link, then the APOD card.
5. Immersive mode: hold the phone up and look around the sky as it was that night.
6. Export a card through the native share sheet.
7. All of it works offline after the first fetch.

## Screens

| Screen | Route | Purpose |
|---|---|---|
| Home | `/` | Tonight's moon over the current location, then the record ledger. Empty state with a real CTA. |
| Add record | `/milestone/new` | Title, type, date, optional location. |
| Edit record | `/milestone/edit/[id]` | Same form, prefilled. |
| Record detail | `/milestone/[id]` | Moon that night, rarity, returns, ledger link, APOD card, export. |
| Immersive sky | `/sky/[id]` | Full-screen time-shifted planetarium. `/sky/tonight` synthesises a record for now. |
| Life ledger | `/ledger/[id]` | One row per year: age, moon glyph at true phase and tilt, APOD thumbnail. |
| Export preview | `/export/[id]` | Skia card, Story or Square, native share. |
| Settings | `/settings` | NASA key override, about, credits. |

## Framing rules

**The immersive sky is not "look at the sky".** Pointing a phone at the sky shows you tonight, which
is a strictly worse Stellarium. The payload is a sky that is years gone and cannot be pointed at.
The mode is "look at the sky as it was, from there, then". A live-sky mode without the time shift
has no reason to exist.

**APOD is never the hero.** It publishes a *featured* image, not one captured that day, and it is
the one part of a record that is not specific to the person. The only honest framing is "what the
world was looking at that day". Because the hero is local computation, every APOD failure state
still leaves a complete screen.

**Rarity never uses an adjective where a number will do.** The global frequency is measured by
walking the days, not asserted. The personal number matters more: "2 of your 22 birthdays have had a
moon this full."

## Build phases

Phases A through H are built, tested, and verified on an iPhone simulator and a Pixel 7 Pro.

| Phase | Scope | State |
|---|---|---|
| A | Correctness foundation: bright limb fix, date helpers, `isTruePhase`, dead module removal | Done |
| B | Recurrence engine: `moonReturn`, `rarity` | Done |
| C | Detail screen cut down to the recurrence order | Done |
| D | Life ledger: `lifeLedger`, `apodBatch`, `useApodBatch`, `/ledger/[id]` | Done |
| E | APOD classifier and the demoted card | Done |
| F | Static sky render: `bsc.json`, `skyTransform`, `skySphere`, `skyBodies` | Done |
| G | Immersive mode: `attitude`, `useSkyOrientation`, `/sky/[id]` | Done |
| H | Export card and the tonight surface on Home | Done |

## Backlog

Open work, roughly in order of value.

- **Figure artwork for the other 73 constellations.** Fifteen have one. The rest keep lines and a
  name, which is the right trade for now: nobody is looking for Antlia.
- **Notification when a return approaches.** The tonight surface already knows; nothing tells the
  user when the app is closed.
- **Real timezone data.** Offsets are approximated from longitude today. See ASTRONOMY.md for the
  size of the error and why it is tolerable.
- **`react-native-view-shot` removal.** Superseded by Skia snapshotting, still in `package.json`.
