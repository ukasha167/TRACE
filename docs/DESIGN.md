# TRACE — design system

Direction: **Atlas**. Defined in `src/constants/theme.ts`, which is the only file allowed to contain
a colour literal, and checked by `src/constants/__tests__/theme.test.ts`.

## The plate idea

Two materials, and the contrast between them carries the whole app.

**Paper** is where the words live. Warm bone stock, a serif for anything a person wrote or was
named, generous leading, hairlines that guide rather than divide. The reference is a letterpress
book of hours, not a lab printout.

**Plate** is where the sky lives. A deep Prussian night, with the moon and the star field set into it
the way figures were tipped into printed books. On Home the plate is the hero and takes the top of
the page; everywhere else it is an inset.

**The accent is the plate, brought up onto the page.** Every date and every return year is printed in
the colour of the sky it refers to. That is why it is not a decorative choice that could be swapped
for another hue of the same value.

**Reading surfaces are never dark. Sky surfaces are never light.** This is also why a light UI stays
usable at night: the immersive sky mode is a full-screen plate.

## What this replaced, and why

The previous direction was Swiss / International Typographic Style: Archivo Black, uppercase
monospace labels, signal red, square corners, hairline rules. It was internally consistent and it
was the wrong register.

1. Uppercase mono was the app's speaking voice. That is the typography of terminals and receipts.
   This app records the people someone loves.
2. Signal red sat on every date. Red is the alarm colour everywhere else on a phone, so a birthday
   read as an error rather than as emphasis.
3. Square corners plus hairlines read as unstyled to anyone not already fluent in Swiss design.
   Rigour was landing as absence.

Three rules survived unchanged, and still hold: mono carries every number, text is never truncated,
and phase labels stay honest.

## Colour

| Token | Hex | Use |
|---|---|---|
| `paper` | `#F3F0E8` | Warm bone stock. The ground for every reading surface. |
| `paperDim` | `#E6E2D6` | Recessed paper: inset blocks, empty thumbnails, pressed states. |
| `ink` | `#15181F` | Near-black carrying a trace of the plate's blue. Never pure `#000`. |
| `inkMuted` | `#646A76` | Secondary text, captions, resolved values. |
| `rule` | `#D6D2C6` | Hairlines between rows. |
| `plate` | `#0A1120` | Prussian night. The ground for anything showing sky. |
| `plateInk` | `#E8EDF6` | Text on a plate. |
| `plateMuted` | `#78849C` | Muted text on a plate. |
| `plateRule` | `#1E2A40` | Hairlines and outlined buttons on a plate. |
| `moonlight` | `#F5F2E6` | The moon itself. Warm, because moonlight is. |
| `earthshine` | `#0D1526` | The unlit disc, a whisper above the plate ground. |
| `space` | `#000000` | Pitch black. The immersive sky and the full-screen image viewer only. |
| `signal` | `#2D4A7C` | The plate colour lifted onto the page. The single accent. |
| `signalOnPlate` | `#93B4E8` | The accent lifted for dark grounds. Using the paper value on a plate is the most likely mistake here. |
| `danger` | `#9B3B2A` | Destructive actions and validation errors only. |

### Why Atlas replaced Keepsake

Keepsake was warm paper, warm ink, warm plate, aged brass. It failed on two counts.

**Measured.** Three of nine contrast pairs fell below WCAG AA, and the worst was `signal` on `paper`
at 3.47:1 against a 4.5 minimum. That token carries every date, every illumination figure and every
return year, so the accent was the least legible thing on the page. A warm accent on warm paper has
nowhere to go: clearing 4.5:1 against both paper grounds meant leaving that neighbourhood.

**Unmeasured.** Everything was one temperature, so the dark plate read as dark paper rather than as
night, and a warm-black plate pushed the neutral-grey lunar photograph on it toward green.

Cooling the plate does most of the work. The paper stays warm, because a record is a document.

**The accent is never red.** `danger` owns red. One colour cannot mean both "this is the important
figure" and "this will delete something", and this rule has now outlived two accents.

### The planetarium palette

`SkyColors` lives apart from `Colors` because it answers to physics rather than to the design
direction. These are chosen so faint structure separates from stars on a pitch-black ground without
competing with the moonlight the stars are drawn in. **Changing the app's accent must not change
these**, because a brass constellation line would read as a real object.

| Token | Hex | Use |
|---|---|---|
| `grid` | `#7FB0D0` | Alt/az grid rings and meridians, at very low alpha. |
| `figure` | `#7FB0D0` | Constellation figure lines. |
| `horizon` | `#C9C4B8` | The horizon ring, the one line that marks the ground. |
| `deepSky` | `#9BE0C8` | Messier objects. Green-cyan, so a galaxy never reads as another star. |
| `label` | `#93A7B4` | Star and body names. Cooler and quieter than the stars. |
| `planet` | `#D9A15C` | Planets and their labels. Warm, so they never read as scaffolding. |

`planet` exists because planets used to borrow `Colors.signalOnPlate`. That was safe while the accent
was brass and became a bug the moment it went cool: a planet drawn in the grid's own blue reads as a
coordinate line. Warm is also truer, since Mars, Jupiter and Saturn are warm objects.

## Typography

Three roles, three faces, and each has a job it does not share.

| Face | Role |
|---|---|
| **Newsreader** (serif) | Names, titles, headlines. Anything a person wrote or is called. The voice of the app. |
| **Figtree** (grotesque) | Interface. Labels, body copy, buttons, captions. |
| **JetBrains Mono** | Every figure. Dates, percentages, angles, years. |

Scale: `micro 10 / label 11 / small 13 / body 15 / lead 18 / heading 22 / title 30 / display 40 /
mega 56`. Even steps, because a keepsake wants continuity rather than tension. Leading runs about
15% more open than the Swiss scale it replaced; air is most of the softness.

Dates read as prose ("27 October 2004"), set in the serif or the UI face. Mono is for a figure being
compared against other figures, not for a date being read as a word. Use `formatLongDate` and
`formatShortDate`.

## Grid and shape

8 pt base. `Spacing.page = 24` is the outer margin every screen shares.

Corners are graded by surface size, so a 14 px plate and a 22 px hero stay in proportion rather than
all sharing one value: `sm 8`, `plate 14` (moon thumbnails, APOD images, small dark blocks),
`hero 22` (the Home hero, full-bleed plates), `pill 999`.

## Motion

Two gestures, used everywhere, and nothing else. Things arrive by rising a little and fading in, and
the moon settles. Scattered one-off animations are what make an interface feel busy rather than
alive.

`duration 420` standard arrival, `durationSlow 620` for the hero moon, `stagger 55` per list item,
`rise 10` points.

The one piece of scroll-linked motion is the Home status-bar scrim, which keeps the clock legible as
the dark hero scrolls under it.

## Hard rules

**Text is never truncated.** No `numberOfLines`, no ellipsis. Layouts grow to fit their content. A
grid that clips its own text is a broken grid.

```bash
grep -rn "numberOfLines" src/          # must return nothing
```

**No colour outside the tokens.**

```bash
grep -rnE '"#[0-9a-fA-F]{3,8}"' src/ --include="*.tsx"    # theme.ts only
```

**No drop shadows, no elevation.** Separation comes from the paper and plate contrast.

**Mono carries every number.** Data reads as data.

**The palette is checked, not argued about.** `src/constants/__tests__/theme.test.ts` asserts every
contrast pair, that hairlines stay visible, that earthshine sits above the plate without becoming a
grey coin, that the accent is nowhere near `danger` in hue, and that planets do not borrow the
accent. A colour swap is exactly the kind of change that gets made quickly and reviewed by eye.
