# TRACE — design system

Direction: **Keepsake / Nocturne**. Defined in `src/constants/theme.ts`, which is the only file
allowed to contain a colour literal.

## The plate idea

Two materials, and the contrast between them carries the whole app.

**Paper** is where the words live. Warm bone stock, a serif for anything a person wrote or was
named, generous leading, hairlines that guide rather than divide. The reference is a letterpress
book of hours, not a lab printout.

**Plate** is where the sky lives. Deep warm ink, with the moon and the star field set into it the
way figures were tipped into printed books. On Home the plate is the hero and takes the top of the
page; everywhere else it is an inset.

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
| `paper` | `#F5F0E6` | Warm bone stock. The ground for every reading surface. |
| `paperDim` | `#EAE3D3` | Recessed paper: inset blocks, empty thumbnails, pressed states. |
| `ink` | `#211D16` | Warm near-black. Primary text. Never pure `#000`. |
| `inkMuted` | `#7E7566` | Secondary text, captions, resolved values. |
| `rule` | `#DED5C3` | Hairlines between rows. |
| `plate` | `#14110C` | Deep warm ink. The ground for anything showing sky. |
| `plateInk` | `#F0E6D2` | Text on a plate. |
| `plateMuted` | `#8E8168` | Muted text on a plate. |
| `plateRule` | `#4A412F` | Hairlines and outlined buttons on a plate. |
| `moonlight` | `#F4E8CE` | The moon itself, drawn on a plate. |
| `earthshine` | `#1A160F` | The unlit disc, a whisper above the plate ground. |
| `space` | `#000000` | Pitch black. The immersive sky and the full-screen image viewer only. |
| `signal` | `#A8763E` | Aged brass. The single accent, on paper. |
| `signalOnPlate` | `#C79A55` | Brass lifted for dark grounds. Using the paper value on a plate is the most likely mistake here. |
| `danger` | `#8E3B2E` | Destructive actions and validation errors only. |

Brass replaced signal red because the accent could not also mean "this will delete something". One
colour cannot carry both jobs.

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
