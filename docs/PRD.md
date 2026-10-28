# TRACE: product definition

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
| Constellation figures | Supporting | Lines, names and drawn artwork for 25: the zodiac and thirteen people find without a chart. |
| NASA APOD per date | Supporting | A secondary card, never the hero. |
| The reveal | Core | Saving a record plays the moon of that night rising, with four lines. The moment the app exists for. |
| Coming up and reminders | Core | The next anniversary and its moon, and a notification at 19:00 on the night. The reason to open the app twice. |
| That night, in words | Core | When the moon rose and set, how high it climbed, what it sat in front of, any eclipse. |
| Star map | Supporting | The whole sky over that place at midnight, on the record page. |
| Life in moons | Supporting | Every anniversary's moon in one grid, returns ringed, a year opening onto NASA's picture. |
| Planet returns | Supporting | Jupiter and Saturn coming back to the same stars, beside the moon's returns. |
| Export card | Supporting | Night (default) or paper, story or square, 1080 wide, an optional line of the sender's own. |
| Tonight surface | Supporting | Tonight's moon, any night's moon by the dial, the next full and new moon, rise and set, 30 nights. |
| Backup and restore | Supporting | The records as one file through the share sheet, and back. |
| Planetary age converter | Cut | Every space-novelty app has this. Removed, screen and library both. |
| Light-travel distances | Cut | Emotionally inert. Nobody is alive for the arrival and the user cannot go look at the object. |
| Hubble/JWST curated set | Cut | A worse APOD at higher curation cost, visibly redundant under the real NASA image. |
| Backend, accounts, sync | None | Fully local, offline-first, single device. |

## User journey

1. Open the app. Home is two things: tonight's moon over the current location, then the saved
   dates sorted by days left. Swipe the moon up to thirty days either way. A first run offers three
   starts.
2. Tap "Add a date". Title, date, place (the phone's own place filled in when location is already
   on), an optional note. No type question: the title decides, and "Other" is the fallback.
3. Save. The reveal plays the moon of that night with Share as its one button, and the date opens
   under it.
4. The date page leads with its title and Share, its tappable moon, a description of the night,
   this year's moon and reminder, and the next return. Rarity and the instrument readings sit in
   "The numbers" at the bottom. Every year's moon and NASA's pictures have their own page.
5. Immersive mode: tap the moon, look around by hand or by moving the phone, scrub from sunset to
   sunrise, tap a star to name it.
6. Share a card through the native share sheet.
7. On the night, a notification. All of it works offline after the first picture fetch.

## Screens

| Screen | Route | Purpose |
|---|---|---|
| Home | `/` | Swipe through thirty days either side of tonight, then saved dates. First run offers three starts. |
| Add a date | `/milestone/new` | Title, date, place (required), optional note. |
| Edit a date | `/milestone/edit/[id]` | Same form, prefilled. |
| Date page | `/milestone/[id]` | The order in the journey above. |
| Immersive sky | `/sky/[id]` | Full-screen planetarium for that night, sunset to sunrise. `/sky/tonight` synthesises a record for now. |
| Life in moons | `/ledger/[id]` | A grid of every anniversary's moon, a card for the year tapped, and the table one tap away. |
| Share | `/export/[id]` | Night or paper card, story or square, an optional dedication, native share. |
| Settings | `/settings` | What the app is, what leaves the phone and why, backup and restore, a test reminder, credits, the NASA key folded away. |

## Framing rules

**The immersive sky is not "look at the sky".** Pointing a phone at the sky shows you tonight, which
is a strictly worse Stellarium. The payload is a sky that is years gone and cannot be pointed at.
The mode is "look at the sky as it was, from there, then". A live-sky mode without the time shift
has no reason to exist.

**APOD is never the hero.** It publishes a *featured* image, not one captured that day, and it is
the one part of a record that is not specific to the person. The only honest framing is "what the
world was looking at that day". NASA's own API stopped serving past dates in 2026; the app reads the
archive pages instead (DECISIONS 38). Because the hero is local computation, every APOD failure state
still leaves a complete screen.

**Rarity never uses an adjective where a number will do.** The global frequency is measured by
walking the days, not asserted. The personal number matters more: "2 of the 22 birthdays so far have
had one", counted at the same threshold the headline names (DECISIONS 37).

## Build phases

Phases A through H are built, tested, and verified on an iPhone simulator and a Pixel 7 Pro. The
improvement stages after them (the reveal, coming up and reminders, night facts, the star map, the
sky scrubber, life in moons, the night card, backup) are verified on the iPhone
simulator only.

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

- **Real timezone data, from a bundled town list.** Typed places get an offset estimated from their
  longitude, which is 1 to 2 hours out for Spain, Portugal, France and western China and 30 minutes
  out for India. The plan is the GeoNames list of towns over 15,000 people (about 3 MB zipped, CC BY
  4.0), searched offline as you type, each town carrying its own zone. It also makes the place field
  work offline and gives typed places proper names. Waiting on a yes to download the file.
- **Real-device checks.** Android as a whole, pointing on a real phone, a reminder arriving on its
  night and opening its record when tapped, and one release build before judging speed.
- **An Android home-screen widget** with tonight's moon and the next anniversary. Needs a
  development build instead of Expo Go.
- **The live moon above the form's expandable date wheel.** Built in the prototype, not picked.
- **A night appearance** for the reading surfaces. Built in the prototype, not picked; paper was.
