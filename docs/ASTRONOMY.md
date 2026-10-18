# TRACE: astronomy spec

Everything under `src/lib/astronomy/` is a pure function: no side effects, no network, no React
Native imports. It is the highest-risk-of-silent-wrongness code in the app and the easiest to test.

**The rule that overrides everything here: never state an astronomical claim the data does not
support.** The app's entire premise is that the numbers are real. A rounded label that reads as a
precise claim is a bug, not a UI detail.

## Dates and timezones

Every date is a **calendar date**, not an instant. Store it as `"YYYY-MM-DD"`.

To get a `Date`, construct it explicitly. Never `new Date("YYYY-MM-DD")`, which parses as UTC
midnight and silently lands on the previous calendar day anywhere behind UTC.

| Helper | Instant | Use for |
|---|---|---|
| `toLocalNoon` | 12:00 on the date | Calendar-date identity: cache keys, display, age arithmetic. |
| `toLocalDayStart` | 00:00 beginning the date | The `isTruePhase` syzygy check. |
| `toLocalNight` | 00:00 of the **following** day | Everything about how the moon *looked*. |

"That night" means local midnight at the end of the date, because that is when the moon is actually
observed on the evening of a given date. The illuminated fraction moves up to about 1.2% per hour
near the quarters, so noon and night can differ by more than a percentage point, and near the
terminator the phase name can flip outright.

A record with a location is evaluated in **that place's** local time, not the device's. A birthday
in Tokyo is a Tokyo night, and `MilestoneLocation.timezoneOffsetMin` is what lets someone viewing
from another country still see the right sky. With `location: null`, fall back to device local time
and say so in the UI.

### Timezone offsets are approximated from longitude

Real timezone boundaries are political, and resolving them properly needs a date-keyed database
(offsets move, DST rules change, countries re-zone). The value only picks which instant counts as
"that night", so an hour of error moves the illuminated fraction by well under a percent.

Correct to the hour for most of the world. About 30 minutes out for India, up to 2 hours out for
western China, and 1 to 2 hours out for Portugal, Spain and France, which keep central European
time west of its meridian. It is never used for displaying clock times, where that error would
matter: a record's night is said against sunset and sunrise instead (`nightFacts`). The one word
that still leans on the estimate is "midnight", in the star map caption, the constellation and
planets "at midnight", and the sky scrubber's labels.

A place taken from the phone ("Use current") stores the phone's own offset on the record's date,
which is exact. Only typed places carry the estimate. A bundled town list with each town's own zone
is the fix for those, and it is the top item in PRD.md's backlog.

## Moon phase, and the labelling rule

```typescript
const PHASE_NAMES = [
  "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
  "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent",
];
```

`Math.round(illumination.phase * 8) % 8` buckets anything within 1.85 days of full into
`"Full Moon"`. **Illumination as low as about 87% gets labelled "Full Moon."** That misled this
app's own author into believing a date was a full moon when it was 96%.

Rules that follow from that:

- **Display labels gate on illumination, not on `isTruePhase` alone.** A moon at 99.9% whose exact
  full instant lands at 08:00 the next morning *is* a full moon to any observer. Calling it "Waxing
  Gibbous" understates reality as badly as the bucket overstated it at 96%. `describePhase()` uses a
  99% threshold (`FULL_ENOUGH`), with "Almost full moon" from 96% and "Half moon" from 45% through 55%, and `describeSyzygyNote()` then discloses where the exact instant
  fell. Both directions of error are bugs.
- **`isTruePhase` is computed** for the four primary phases. It is true only when the exact syzygy
  instant falls inside the observer's local calendar day. That is the almanac convention and it is
  precise.
- **The exact percentage is always displayed** alongside the name. Never the name alone.
- **`waxing` comes from SunCalc, never from `phaseIndex`.** The primary buckets (index 0 and 4) span
  both sides of the syzygy, so half of every "Full Moon" bucket is waning. Inferring direction from
  the index is a 180 degree error waiting to happen, and it has happened twice.

## Moon return

For a source date, find the anniversaries whose moon returns to the same phase.

```
For each year y in [sourceYear - 60, sourceYear + 60]:
  p(y)  = illuminated phase at (y, sourceMonth, sourceDay), local midnight-of-night
  delta = circular distance between p(y) and p(source), in days
          min(|dp|, 1 - |dp|) * 29.530589
  A return is delta < 1.0 day.
Return the nearest past hit, the next future hit, and the full list.
```

Verified output, two dates that land on different chains:

- 20 January 2000 over Lisbon, the eve of a total lunar eclipse: +19y (0.03d off), +38y (0.04d),
  +57y (0.45d). The Metonic chain.
- 8 June 2004 over Greenwich (UTC+1), the day of the Venus transit: +11y (0.14d), +30y (0.00d),
  +49y (0.28d). The 11-year chain, with 30 = 11 + 19.

Which chain a date sits on depends on where its anniversaries fall against the 11-year slip, and
both are what the thesis predicts. It is a good end-to-end sanity check.

Every hit is labelled with *why* it recurs (11-year, Metonic 19-year, 30 = 11 + 19). The explanation
carries most of the emotional payload: it says the sky is on a schedule, not that a coincidence
happened.

**`MoonReturn.direction` is relative to the record, not to today.** Using it for "in N years"
produces negative years.

## Rarity

Measure, do not assert. The frequency is computed by walking days over a multi-decade window rather
than hardcoding a figure. Measured over 29,220 days from 1980 to 2060:

| Illumination | Frequency | Reads as |
|---|---|---|
| >= 90% | 20.19% | about 1 in 5 |
| >= 95% | 13.99% | about 1 in 7 |
| >= 97% | 10.86% | about 1 in 9 |
| >= 99% | **6.06%** | **about 1 in 16.5** |
| >= 99.5% | 3.94% | about 1 in 25 |

The personal number is far stronger than the global one and falls straight out of the ledger:
"2 of your 22 birthdays have had a moon this full."

## Bright limb and moon rotation

`getBrightLimbAngle` returns the position angle of the midpoint of the illuminated limb, measured
from the zenith, counter-clockwise (eastward) positive, normalised into (-180, 180].

```
brightLimbAngleDeg = illumination.angle - moonPosition.parallacticAngle
```

Both terms are already degrees. Do not add a radians conversion (see DECISIONS.md).

### The moon is drawn with two rotations, not one

They are independent, and keeping them independent is the whole point.

| Helper | Drives | Follows |
|---|---|---|
| `getMoonLimbRotation` | a glyph drawn with its bright limb on the right | the Sun |
| `getLitPathRotation` | the lit region path: illuminated limb and terminator ellipse | the Sun |
| `getLunarNorthRotation` | the lunar photograph | the Moon's north pole |

**The terminator follows the Sun, exactly.** It is the great circle whose plane is perpendicular to
the Moon-to-Sun direction, so its projection onto the disc is an ellipse whose minor axis lies along
the projected Sun direction. No libration correction applies, because that relation is fixed by the
Sun alone and says nothing about where the Moon's poles are.

**The photograph follows the pole.** `getLunarNorthRotation` returns `-(P - q)`, where `P` is the
position angle of the Moon's north pole from celestial north (from `astronomy-engine`'s
`RotationAxis`, topocentric) and `q` is the parallactic angle that re-references it to the observer's
zenith. `q` comes from SunCalc, the same source `getBrightLimbAngle` uses, so both rotations share a
zenith and a shared error in `q` cancels between them.

One angle used to drive both, which assumes the pole sits exactly 90 degrees from the bright limb in
position angle. See DECISIONS.md entry 18 for why that is false and what it cost.

The lit path rotation must be driven by `snapshot.waxing`, never by `phaseIndex <= 4`. The measured
cost of getting that wrong is 171 degrees (Greenwich, 2015-09-28, a 98.8% waning moon in bucket 4).

## Sky transform

RA/Dec to local sidereal time to hour angle to altitude/azimuth. Standard spherical trigonometry,
roughly 30 lines. Azimuth is north-based clockwise.

**Precession is deliberately skipped.** It runs about 50 arcseconds per year, so even a 30-year
lookback accumulates about 25 arcminutes, under a pixel at phone scale. J2000 catalogue coordinates
are used directly. This is a legitimate simplification, documented in the code so nobody "fixes" it.

**Atmospheric refraction is ignored** for the same reason. It matters only within a few degrees of
the horizon.

**Validation.** `skyTransform` is cross-validated against `astronomy-engine`, an independently
written implementation. Worst disagreement is 23.6 arcseconds across 100 comparisons spanning 1990
to 2050 and five sites from the Arctic to Sydney. Asserting my own arithmetic against numbers
derived from that same arithmetic would prove nothing; agreeing with a separate codebase is
evidence.

## Device orientation

Orientation comes from physics, not from platform convention. Gravity gives "down" and the magnetic
field gives "north"; together they pin a complete world basis with nothing left to assume. This is
the same construction as Android's `SensorManager.getRotationMatrix`.

```
A = normalize(gravity)        up, in device coordinates
H = normalize(magnetic x A)   east, in device coordinates
M = A x H                     north, in device coordinates
R = rows [H, M, A]            maps device vectors to world (East, North, Up)
```

The camera looks along device -Z, so its world direction is `-(H.z, M.z, A.z)`.

**Sensor fusion, not sensor averaging.** The accelerometer and magnetometer give an orientation that
is stable over minutes but noisy frame to frame. The gyroscope gives motion that is smooth over a
second but drifts over minutes. Smoothing the noisy one hard enough to look calm necessarily makes
it lag, and that trade is unwinnable. A complementary filter escapes it: integrate the gyro for fast
motion, then blend gently toward the absolute reading (factor about 0.035) to cancel its drift.

**The accelerometer sign is platform-specific and must be a constant, not a runtime guess.** Android
reports the reaction to gravity (+1 g on z when face-up); iOS CoreMotion reports the opposite. Expo
passes both through unchanged. Getting it wrong inverts altitude *and* mirrors azimuth, because east
comes from `magnetic x gravity`. Manual overrides stay in the debug panel for hardware that
disagrees.

**Roll comes from gravity alone**, which is stable and drift-free, while the view direction comes
from the fused estimate.

**Pointing accuracy.** Phone magnetometers run 10 to 15 degrees out, worse indoors or near metal.
There is deliberately no reticle: drawing a crosshair on top of that error would be a lie the
interface tells continuously. Drag-to-pan is always available and is the default when the
magnetometer reports low accuracy.

## Test fixtures

`npm test` runs Node's built-in test runner through `tsx`. Unit tests cover everything in
`src/lib/astronomy/`.

Use publicly verifiable, impersonal reference dates. Do not put personal dates in fixtures. Eclipse
instants are good fixtures because a lunar eclipse can only occur at exactly full and a solar
eclipse at exactly new, which pins the maths against physics rather than against arithmetic.

| Date (instant, UTC) | Assert |
|---|---|
| 2000-01-21 04:44, total lunar eclipse | `fraction` about 1.0000 |
| 2015-09-28 02:47, total lunar eclipse | `fraction` about 1.0000 |
| 2024-04-08 18:17, total solar eclipse | `fraction` about 0.0000 |
| 2015-09-28 02:47 at Greenwich | `brightLimbAngleDeg` about 133.87 |
| any date and site | `getLunarNorthRotation` within 1 degree of an independent spherical-trig pole angle |
| any date and site | the pole is **not** 90 degrees from the bright limb, which is the libration |

Also assert that `getBrightLimbAngle` stays within (-180, 180], and that moon return on a known date
reproduces the +11 / +19 / +30 structure.

## Limits, stated plainly

The immersive view shows about 8,400 real stars, the constellations, and the solar system bodies,
correctly placed for a given time and place. It draws no deep-sky objects, no satellites, and has no
telescope control. The atmosphere it models is typical, not that night's: extinction on the colour
of the sun, moon and planets (`skyView.airLight`) and on star brightness, moonlight scattered into
the sky by Krisciunas and Schaefer's model (`skyLight.moonSkyBrightness`, coefficient 0.172 mag per
airmass, dark sky 79 nL), and twilight hiding the Milky Way until the sun is 12 degrees down. None
of it changes the phase or any printed number.

Sizes are true: the sun and moon from their distances, the planets from IAU radii, flattenings and
pole directions, Saturn's ring opening from astronomy-engine. Star colours come from catalogued B-V
through Ballesteros's temperature formula and Mitchell Charity's blackbody table, mixed a third of
the way back to white, which is a print decision. The Milky Way's brightness does not change with
zoom, because an extended source's surface brightness is the same at any magnification.
