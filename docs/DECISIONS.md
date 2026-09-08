# TRACE — decisions and bugs that shipped

Every entry here is a real bug that reached the running app, or a decision that looks wrong until you
know why. Each has a comment at the site and, where it is testable, a regression test. **Do not undo
these.**

## Bugs

### 1. SunCalc v2 returns degrees, not radians

The spec this was built from asserted radians, which was true for SunCalc **v1**. `brightLimb.ts`
faithfully implemented that, multiplying an already-degrees value by `180/Math.PI` and inflating it
about 57 times.

It did not crash. The result was normalised into (-180, 180], so it produced a plausible-looking but
wrong tilt. The moon simply rendered at the wrong angle forever. Verified example, Lahore
2004-10-27: the buggy path returned 137.5 degrees; the correct value is -129.5.

The installed `suncalc@2.0.1` states it in its own `index.d.ts`: "All angles are in degrees." Note
that `@types/suncalc` does **not** say this and does not declare `waxing` either, so the bundled
`.d.ts` is the authority.

**Rule: check the installed type definitions for units before trusting any angle.**

### 2. Phase names are buckets, not measurements

`Math.round(phase * 8)` labels anything within 1.85 days of full as "Full Moon", which includes moons
as low as 87% illuminated. It told this app's author that a 96% moon was full.

The fix gates the label on illumination and discloses where the exact instant fell. Understating is
equally a bug: calling a 99.9% moon "waxing gibbous" is just as wrong in the other direction.

### 3. `MoonReturn.direction` is relative to the record, not to today

Using it for "in N years" produced negative years.

### 4. Typed locations were stored with latitude and longitude 0

GPS was the only coordinate source, so any historical date, which is nearly all of them, could never
get a sky render or a moon tilt. It silently disabled the feature for exactly the records the app
exists for. Typed places now resolve through `Location.geocodeAsync`.

**A place without coordinates is not a location.**

### 5. The batch fetcher silently used `DEMO_KEY`

`fetchApod(date)` was called without the key argument, so it fell back to the 30-per-hour demo key
and rate-limited itself on the first ledger open. It looked exactly like flaky network.

### 6. Sensor conventions are not portable

Two separate inversions shipped from assuming one.

- W3C `alpha` runs counter-clockwise; compass azimuth runs clockwise. Getting that backwards mirrors
  the view about north, so east reads as west.
- Android's accelerometer reports the *reaction* to gravity (+1 g on z face-up); iOS CoreMotion
  reports the opposite. One sign flip inverts altitude **and** mirrors azimuth, because east comes
  from `magnetic x gravity`.

Orientation now comes from gravity and the magnetic field, which is physics rather than convention.
The accelerometer's sign is a per-platform constant with a manual override in the debug panel.

The constant then shipped wrong for a second time: it was hardcoded to -1 for both platforms, which
is correct on iOS and inverted on Android. `expo-sensors` normalises nothing (Android's
`AccelerometerModule.kt` divides `TYPE_ACCELEROMETER` by `GRAVITY_EARTH` and stops; iOS forwards
`CMAccelerometerData.acceleration` untouched), so screen-up reads +1 g on z on Android and -1 g on
iOS. **The diagnostic symptom is worth memorising: both axes appear wrong, and turning on the
up/down override appears to fix left/right too.** That is not a coincidence and not two bugs. East
comes from `magnetic x gravity`, so negating gravity flips the cross product with it.

### 7. Runtime auto-detection is not always better than a tested constant

The accelerometer sign was briefly refereed against DeviceMotion's Euler tilt. But Euler convention
is the very thing that proved unreliable, and the referee got it wrong on real hardware. Resolving an
ambiguity with an unreliable arbiter is worse than a constant that has actually been measured.

### 8. Sample sensors at matched rates

Altitude depends only on gravity; azimuth depends on gravity *and* the magnetometer. `DeviceMotion`
is a composite sensor that on Android ignores `setUpdateInterval` and runs slower than the
magnetometer, so vertical motion stepped while horizontal stayed smooth. Gravity now comes from the
raw `Accelerometer`, with `Magnetometer` and `Gyroscope` on the same 60 Hz cadence.

### 9. The camera frame needs roll, not just a direction

Deriving `right` from the look azimuth and forcing its z to zero pins the horizon parallel to the
screen's x-axis, so rotating the phone to landscape leaves the horizon running across the screen
instead of up it. It was a planisphere pretending to be a window. The frame now comes from the full
device basis, and roll is read from gravity.

### 10. A realtime view must not publish through React state

Rendering the sky from `useState` ran a full reconciliation 60 times a second, congesting the JS
thread badly enough to delay the sensor callbacks feeding it: 30 to 50 fps of frames carrying 10 to
20 Hz of data.

The view now lives in a ref, a frame loop writes Skia paths into Reanimated shared values, and React
re-renders only for things a person changes plus a 4 Hz text label.

### 11. Two clocks meant two positions

The sky drew from shared values at 60 fps while labels came from React state at 10 Hz, so labels
visibly chased the objects they named. Geometry **and** text are now recorded into a single
`SkPicture`, so a star and its name are emitted by the same instruction stream and cannot disagree.

### 12. Bright-limb rotation was inverted and datum-mismatched

`getBrightLimbAngle` measures position angle from the zenith counter-clockwise (eastward, left in the
sky), while screen transforms rotate clockwise. The unrotated glyphs had their bright limb on the
right, which is +90 degrees from the zenith, creating a 90 degree datum offset. Flipping with
`isWaxing` double-counted the lit side, because the angle already determines which side is lit.

Unified into `getMoonLimbRotation` and `getMoonTextureRotation`, with no mirroring anywhere. The
texture is never flipped with `scaleX: -1`, because that moves Mare Crisium to the wrong limb.

### 13. Waxing was inferred from the phase bucket

`MoonPhaseGlyph` and `ExportCardCanvas` both computed `isWaxing = phaseIndex <= 4`. Buckets 0 and 4
straddle the syzygy, so half of every "Full Moon" bucket is waning and half of every "New Moon"
bucket is waxing. The lunar photograph rendered upside down for those.

Measured against lunar north pole position angles from `astronomy-engine`: a 98.8% waning moon over
Greenwich on 2015-09-28 was 171.6 degrees wrong, and a 0.01% waning moon over Reykjavik was 119.8
degrees wrong. Correct cases sit at 2.9 to 8.4 degrees, which is the libration floor of rotating the
texture and the terminator as one body.

`waxing` now comes from `MoonSnapshot`, which takes it from SunCalc. This is the second time the
same class of bug shipped (see 2), and both times the cause was treating an 8-way bucket as a
measurement.

### 14. Label counter-rotation ran the wrong way

Sky labels are drawn in screen space, so text with no rotation is already level with the screen.
Rotating it by `-roll` to "keep it level" moved it *away* from the horizon at double rate. Text that
should follow the horizon rotates by `+roll`.

### 15. A colour system can fail a measurement, not just a taste test

The Keepsake palette fails three of nine contrast pairs, and the worst is `signal` on `paper` at
3.47:1 against a 4.5 minimum. That token carries every date, every illumination figure and every
return year. "The colours feel off" turned out to have a number behind it.

Check a palette with a real ratio calculation before arguing about it.

### 16. Labels drawn independently will print on top of each other

The constellation name draws at the figure's centroid, and the centroid of a figure is very close to
where its brightest star sits, which is where that star's label goes. Orion rendered as
"ORIONBellatrix". Every label now claims a rectangle and a later one that would overlap is dropped,
in priority order: solar system, named stars, deep sky, constellation names.

### 17. Do not cull at the data layer what the projection should cull

`getSolarSystemSky` filtered bodies to `altitude > 0`, which was correct when only the visible
hemisphere was drawn. Once the view rendered the full sphere it became a bug: on 2004-10-27 over
Lahore, Saturn was the only planet above the horizon, and the other four silently vanished instead
of appearing below the horizon where they belong.

## Decisions

**Zustand over Redux.** About 1 KB, no provider, and the entire persisted state is one array of
records.

**AsyncStorage over MMKV.** MMKV would force an EAS development build from day one, and the data
volume is nowhere near AsyncStorage's limits. Expo Go compatibility was worth more.

**`tsx` and `node:test` instead of Jest.** `jest-expo` peer-conflicts with `react-native@0.86.2`, and
it would drag the entire React Native test environment in to test pure functions that import no
React Native at all.

**`astronomy-engine` alongside SunCalc.** SunCalc covers the sun and moon only. The sky render needs
planets. It doubles as the independent implementation `skyTransform` is validated against.

**No reticle in the immersive view.** Phone compasses run 10 to 15 degrees out. A crosshair on top of
that error would be a lie the interface tells continuously.

**Precession skipped.** About 25 arcminutes over a 30-year lookback, under a pixel at phone scale.

## Verification habits that paid off

**Cross-validate against an independent implementation, not against your own arithmetic.**
`skyTransform` agrees with `astronomy-engine` to 24 arcseconds across 100 comparisons. That is
evidence. Asserting my own formula against numbers I derived from it would have proved nothing. The
same method caught bug 13.

**Measure before optimising.** At one point the immersive view was slow enough that porting to
Flutter looked reasonable. Benchmarking settled it: the per-frame maths costs 0.05 ms against a
16.7 ms budget, and only about 275 stars are on screen at once after culling. A flagship phone
cannot fail to draw 275 dots. The framework was never the bottleneck, the render path was, and
moving it off React fixed it without a rewrite.

**Use impersonal, publicly verifiable fixtures.** Eclipse instants pin illumination against physics.
