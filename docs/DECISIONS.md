# TRACE: decisions and bugs that shipped

Every entry here is a real bug that reached the running app, or a decision that looks wrong until you
know why. Each has a comment at the site and, where it is testable, a regression test. **Do not undo
these.**

## Bugs

### 1. SunCalc v2 returns degrees, not radians

The spec this was built from asserted radians, which was true for SunCalc **v1**. `brightLimb.ts`
faithfully implemented that, multiplying an already-degrees value by `180/Math.PI` and inflating it
about 57 times.

It did not crash. The result was normalised into (-180, 180], so it produced a plausible-looking but
wrong tilt. The moon simply rendered at the wrong angle forever. Verified example, Lisbon at local
midnight on 20 January 2000, the eve of that year's total lunar eclipse: the buggy path returned
-48.3 degrees; the correct value is -70.0.

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

`getMoonTextureRotation` has since become `getLitPathRotation` and no longer drives the photograph.
See entry 18.

### 13. Waxing was inferred from the phase bucket

`MoonPhaseGlyph` and `ExportCardCanvas` both computed `isWaxing = phaseIndex <= 4`. Buckets 0 and 4
straddle the syzygy, so half of every "Full Moon" bucket is waning and half of every "New Moon"
bucket is waxing. The lunar photograph rendered upside down for those.

Measured against lunar north pole position angles from `astronomy-engine`: a 98.8% waning moon over
Greenwich on 2015-09-28 was 171.6 degrees wrong, and a 0.01% waning moon over Reykjavik was 119.8
degrees wrong. Correct cases sat at 2.9 to 8.4 degrees, which I called the libration floor of
rotating the texture and the terminator as one body. That figure came from six samples and was too
optimistic: the real ceiling is 66 degrees. See entry 18.

`waxing` now comes from `MoonSnapshot`, which takes it from SunCalc. This is the second time the
same class of bug shipped (see 2), and both times the cause was treating an 8-way bucket as a
measurement.

### 14. Label counter-rotation ran the wrong way

Sky labels are drawn in screen space, so text with no rotation is already level with the screen.
Rotating it by `-roll` to "keep it level" moved it *away* from the horizon at double rate. Text that
should follow the horizon rotates by `+roll`.

### 15. A colour system can fail a measurement, not just a taste test

The Keepsake palette failed three of nine contrast pairs, and the worst was `signal` on `paper` at
3.47:1 against a 4.5 minimum. That token carries every date, every illumination figure and every
return year, so the accent was the least legible thing on the page. "The colours feel off" turned
out to have a number behind it.

Fixed by the Atlas palette, and the check is now `src/constants/__tests__/theme.test.ts` rather than
a habit. `theme.ts` imports nothing, so it runs under tsx like the astronomy library does.

Two things fell out of it worth keeping. **A warm accent on warm paper has nowhere to go**: every
candidate that cleared 4.5:1 against both paper grounds had left that neighbourhood entirely. And
**a token borrowed across contexts breaks when either context moves**: planets took
`Colors.signalOnPlate`, which was safe while the accent was brass and became a bug the moment it
went cool, because a planet drawn in the grid's own blue reads as a coordinate line.

### 16. Labels drawn independently will print on top of each other

The constellation name draws at the figure's centroid, and the centroid of a figure is very close to
where its brightest star sits, which is where that star's label goes. Orion rendered as
"ORIONBellatrix". Every label now claims a rectangle and a later one that would overlap is dropped,
in priority order: solar system, named stars, deep sky, constellation names.

### 17. Do not cull at the data layer what the projection should cull

`getSolarSystemSky` filtered bodies to `altitude > 0`, which was correct when only the visible
hemisphere was drawn. Once the view rendered the full sphere it became a bug: at midnight on 20
January 2000 over Lisbon, Jupiter and Saturn were above the horizon, and Mercury, Venus and Mars
silently vanished instead of appearing below the horizon where they belong.

### 18. The lunar photograph and the terminator do not share a rotation

One angle derived from the bright limb drove both. That silently assumes the Moon's north pole sits
exactly 90 degrees from the bright limb in position angle. Two things break it:

1. The sub-solar latitude, up to 1.54 degrees, because the Moon's equator is tilted to the ecliptic,
   so the terminator plane is not quite pole to pole.
2. Optical libration, up to about 8 degrees, which tilts the pole in and out of the plane of sky.
   The projections of two perpendicular directions in 3D are not themselves perpendicular. This one
   dominates.

Measured over 2,000 site and date samples against `astronomy-engine`'s `RotationAxis`, the coupled
approximation is off by a median 1.3 degrees at the quarters, about 7 degrees at 5 to 10 percent
illumination, and **up to 66 degrees at 97 to 99 percent**. That last band is the most visible case
of all, because a nearly-full moon shows its whole face.

Near syzygy the bright limb is ill-conditioned: at full moon the Sun is almost directly behind the
observer, so its projected direction on the disc is a vanishing vector pointing anywhere. The old
code fed that noise straight into the photograph. The pole has no such degeneracy; it is a real
direction in space at every phase.

Split into `getLitPathRotation`, which follows the Sun, and `getLunarNorthRotation`, which follows
the pole. `MoonPhaseGlyph` and `ExportCardCanvas` rotate the mask geometry in one frame and
counter-rotate the photograph inside it, so the photograph carries the difference and composes back
to the pole angle.

**The lesson is not about the Moon.** An earlier revision of this file put the coupled error at 2.9
to 8.4 degrees, measured across six hand-picked sites and phases. The ceiling is eight times that,
and the six samples missed it because none of them landed in the band where the approximation breaks.
Sampling an error surface at a handful of convenient points tells you the error is small there, and
nothing else.

### 19. With the React Compiler on, a shared value read in an effect is a read during render

Home warned twice on every launch:

```
WARN [Reanimated] Reading from `value` during component render.
```

The line was in the focus effect, not in a render body, which is what made it hard to believe:

```ts
useFocusEffect(useCallback(() => {
  setBarLight(scrollY.value < crossover - 12);   // <- both warnings
}, [setBarLight, crossover, scrollY]));
```

Reanimated's strict mode fires when `isReactRendering() && !isFirstReactRender()`, and
`isReactRendering` asks React for a current owner. `experiments.reactCompiler` is on in `app.json`,
and under it this read lands inside a render pass rather than after one. Bisected to this single
line and confirmed by putting it back: two warnings with it, none without.

The fix is not a cast or a logger config. The reaction directly below it already evaluates the same
predicate on the UI thread, so `setBarLight` records its own argument in a ref and the focus effect
reads the ref. Nothing on the JS thread touches a shared value.

**Two things worth keeping.** Reanimated's strict mode is right even when the call site looks like an
effect, so treat "read shared values only inside worklets" as literal. And when the UI thread already
computes a value, mirror it on the way past instead of asking for it afterwards.

**A note on how this was found**, because the method nearly produced a false fix. The first bisect
appeared to pin the warnings on `TonightHero`'s `useAnimatedStyle` and the fix appeared to work. Both
readings were wrong: the log was being captured with `truncate -s 0` on a file Metro already held
open, so the greps were reading an empty file and counting zero. Every measurement after that point
said "fixed" regardless of the code. An append-only log with a control run, verifying that a bundle
was actually served and that restoring the original line brought the warnings back, is what gave a
real answer. **A verification harness that cannot fail is not a verification harness.**

### 20. Three ways a shaded sphere can still look wrong

Replacing the moon cutout with a per-pixel shader (see the decision below) went in cleanly and then
produced three artefacts in a row, each of which looked like the same bug: a dark ring around the
limb.

**The texture's own antialiasing.** `moon_disc.png` had a soft alpha edge, and linear filtering near
an alpha boundary blends RGB toward the transparent neighbours, which are black. Every sample within
about a texel of the limb came back darkened. Measured on the old asset along the equator: 168,164,161
at r=0.97 falling to 128,126,122 at r=0.99, with no real albedo gradient there. The asset is now a
full square with the limb colour extended outward and alpha 1 throughout, because the shader
antialiases the limb itself from geometry it knows exactly.

**The halo gate at full moon.** The outer glow was gated on the illumination of the limb point,
normal (d.x, d.y, 0). At full moon the Sun is behind the observer, so that normal is perpendicular to
it and the gate evaluated to zero: the halo switched off completely at the one phase where the entire
edge is lit. It now samples the surface just inside the limb, at r = 0.97, which is the question that
was actually meant.

**Antialiasing in the wrong unit.** The coverage band was `1.5 / uRadius`, and `uRadius` is in
points, so on a 3x screen it spanned four and a half device pixels. At 99.9% illumination the
genuinely unlit crescent is about one pixel wide, and smearing coverage over four turned a real
sub-pixel feature into a dark arc down a whole limb. The band is now one device pixel, passed in as a
uniform from `PixelRatio.get()`.

**What the three have in common** is worth more than any of them: all three were the renderer
disagreeing with itself about where the edge is. A texture that carries its own edge, a gate that
samples a different point than the surface it controls, and a coverage function measured in the wrong
unit. When a shader has an edge artefact, ask which of the pieces thinks the edge is somewhere else.

### 21. A light that is really a mask, and the ground that hid the evidence

The shaded moon shipped with earthshine as a flat fill gated on `smoothstep(0.06, -0.06, mu0)`. Two
faults came out of that one line, and a third came from the surface it was drawn on.

**The gate did not overlap the light it took over from.** Sunlight reaches exactly zero at `mu0 = 0`.
The gate only reached full strength at `mu0 = -0.06`. Across that band neither light covered the
surface, so a dark hairline traced the terminator all the way round the disc. Measured on a 42% moon,
walking the equator: luminance 0.065 on the earthlit side, **0.035 at the crossing**, then back up.
The terminator read as a cut edge rather than as a surface turning away from the light, which is the
exact failure the shader had replaced the two-arc cutout to avoid.

**A constant has no gradient.** The night side held between 0.062 and 0.067 across the entire unlit
hemisphere. That is a coin. Nothing about it said sphere, so the disc had a lit half in three
dimensions glued to a dark half in two.

**The ground hid both.** `earthshine` was chosen to sit "a whisper above the plate" and the theme test
asserted exactly that, 1.0 to 1.6:1. Passing it was the problem: at 1.1:1 against `plate` the moon's
dark side and the surface behind it were the same colour, so the silhouette did not exist and the
first two faults had nothing to show against.

**The fix is that earthshine is a light.** A wrapped diffuse term from the anti-solar direction, which
is where the Earth is in the Moon's sky, scaled by the Earth's own illuminated fraction. That
fraction is `1 - f`, because the two phases are complementary, which is why the ash-grey disc is a
thing you can see inside a thin crescent and not inside a gibbous. The wrap reaches onto the sunlit side, so the two
lights overlap instead of meeting, and there is no gate left to disagree with the surface it controls.
Moons are drawn on `space` now, and the palette test measures earthshine's luminance rather than a
contrast ratio, because against black the ratio compresses every usable night colour into 1.0 to 1.5.

`earthshineTerm` and `earthshineGain` live in `lib/astronomy/moonLighting.ts` with the rest of the
illumination geometry, and four tests hold the properties: earthshine is non-zero on the sunlit side,
it is strictly graded across the night side, it limb-darkens, and it follows the Earth's phase.

**One number here is a print decision and is labelled as one.** `EARTHSHINE_FLOOR` keeps a gibbous
moon's night side off the ground so the disc keeps its silhouette. Real earthshine at 81%
illumination is far below it. Nothing in the app claims otherwise and the measured percentage is
always printed beside the moon, which is where rule 1 actually bites.

**The lesson is decision 20's, again.** All three faults were the renderer disagreeing with itself
about where the edge is: a gate sampling a different condition than the light it replaced, a fill that
did not know the surface was curved, and a ground chosen against the wrong neighbour. When a shader
has an edge artefact, ask which piece thinks the edge is somewhere else.

### 22. Reflectance is not a print

The same rewrite exposed a quieter fault. The disc was drawn at raw Lunar-Lambert reflectance, which
peaks near 0.4 of white at quarter phase, so the moon printed as grey felt regardless of how good the
photometry underneath it was. Every photograph of the Moon is exposed for the sunlit side.

`PRINT_EXPOSURE` and `PRINT_CONTRAST` are that exposure, and they run under the rule the albedo map's
own grade already follows in `scripts/build-moon-maps.mjs`: **the tone curve moves luminance and
chroma rides through untouched.** Running the shoulder per channel drives R, G and B toward 1
together, so exactly the bright highlands that carry the strongest mineral signal come out white and
the saturation the whole exercise exists for is eaten by the exposure.

The line between measurement and print is drawn in the shader and worth keeping: everything above the
tone curve is geometry and photometry, everything at it is the darkroom, and nothing anywhere paints
in a feature or moves one.

### 23. The relief was exaggerated, and it was amplifying sampling noise

The terminator on a quarter moon did not read as a curve. It tore: crater walls caught light far
into the night side, floors punched black bites out of the lit side, and the lit boundary wandered
tens of pixels off the ellipse it is supposed to follow. Worse, **the same record rendered a visibly
different shape on iOS and on Android**, which is the detail that gave the cause away.

**The geometry was never wrong.** Rendering the disc at relief 0 with the analytic terminator ellipse
drawn over it shows the lit boundary tracking the ellipse exactly. Turning relief up walks it off.

Two things were multiplying:

- `RELIEF` in `scripts/build-moon-maps.mjs` was **1.6**, a vertical exaggeration of the LOLA
  elevation. Near the terminator `mu0` approaches zero, so the photometric term is at its most
  sensitive there. That sensitivity is why a quarter moon is worth photographing, and it is exactly
  why exaggerating the terrain backfires: 1.6x slope buys 1.6x the spill past the terminator.
- `NORMAL_SIZE` was **512**, upscaled to as much as 894 device pixels on the hero. Every normal
  arrived through a linear filter on a grid that differs between devices, and the exaggeration then
  amplified that difference. iPhone samples the map at 3x and the Pixel at 3.5x, so the two got
  different noise, and at 1.6x the difference was visible as a different shape.

Now 1.0 (true scale) at 1024. The drama at a quarter comes from grazing **light**, not from tall
terrain, so nothing was lost. `soften` in the `gentle` grade also came down from 0.18 to 0.06, which
is the other half of why the disc looked soft.

**The general lesson:** an artefact that differs between two devices running the same maths is
almost never the maths. Look for something amplifying a sampling difference.

### 24. One exposure cannot serve every phase

The full moon printed hot. Measured over the sunlit surface at a flat exposure of 1.9, the
99th-percentile luminance ran **0.466 at 10% illumination to 0.841 at 99.9%**, and the mean 0.193 to
0.642.

That is not a tuning miss, it is the shape of the problem. Under Lunar-Lambert a full moon reflects
at nearly 1.0 across the whole disc, flat to its edge, while a crescent's lit sliver averages a small
fraction of that. Any single exposure that opens a crescent up will blow the gibbous end out.
Photographers have always known this: full moon is the Looney 11 case and a crescent wants two or
three stops more.

`printExposure` stops down linearly with illumination. It holds p99 inside 0.46 to 0.76 **over the
range it was measured on, 10% to 99.9%**, and moves the crescents by about 2%.

That sentence originally said "across the whole cycle", which the measurement above does not support
and which is false: below 10% the sunlit p99 falls off a cliff, to 0.275 at 2% and 0.153 at 0.5%,
because the ramp only ever stops down and there is almost no sunlit surface left to stop down for.
See entry 27, which found it. This is decision 18's lesson landing on decision 18's own author.

### 25. A selector that returns an action subscribes to nothing

Editing a record and saving it popped back to a detail screen still showing the old title, date and
moon. Going home and opening the record again showed the change, which is what made it look like a
navigation or a persistence problem. It was neither.

```ts
const getMilestone = useMilestonesStore((s) => s.getMilestone);
const milestone = getMilestone(id);
```

Zustand re-renders a component when the value its selector returns changes. This selector returns the
**action**, and an action's identity is fixed for the life of the store, so the comparison after every
`set` was `Object.is(fn, fn)` and the screen was never told anything had happened. The record was read
exactly once, at mount, and `router.back()` does not remount the screen underneath.

Four screens had it: detail, ledger, export and the edit form itself. `app/sky/[id].tsx` was written
as `useMilestonesStore((s) => s.getMilestone(id))`, with the call **inside** the selector, and was
correct by accident of where one bracket sat.

`useMilestone(id)` now owns the read. `find` returns the same object identity while a record is
untouched and `updateMilestone` spreads a new object for the one record it changes, so exactly the
screens showing the moved record re-render.

**The general shape is worth more than the fix.** A read that goes through a store and still returns
stale data is a subscription bug, not a data bug, and the tell is that remounting fixes it. Anywhere
a selector returns something whose identity does not track the state, it is a `getState()` with extra
steps.

### 26. The one decorative thing in the app, and the line it stands on

There are faint stars behind the moon on the home hero, the record's plate and the export card. They
have no catalogue behind them, no magnitudes, no positions, and nothing in the interface names one.

That is allowed under rule 1 for exactly one reason: **the field is identical everywhere.** Same
seed, same stars, on every record, every date, every place. A constant texture asserts nothing, the
way paper grain does not claim to be paper. Seeding it per record, which is the obvious next idea
and the reason this entry exists, would make it say that this night's sky differed from that one,
which is precisely the quiet class of lie rule 1 is written against.

Two smaller things fell out of building it.

**Stratified beats uniform at these counts.** Sampling 60 positions uniformly leaves clumps and bald
patches, and at that density a bald patch reads as a rendering fault rather than as sky. One jittered
star per grid cell with a quarter of the cells dropped covers evenly with no visible order.

**The moon washes out its own neighbourhood for free.** The plan had been to fade stars near the
disc, which needs the moon's position in the plate's coordinates and therefore a measuring pass on
two screens that do not otherwise need one. The halo already does it: it is drawn over the field at
0.3 alpha at the limb, falling off exponentially, so stars near the moon are dimmed by roughly the
amount the real thing dims them. The cheapest correct answer was the one already on screen.

**A hard disc is a dot on a surface, not a light at a distance.** The field shipped as flat white
circles first and read as dust on the plate. The missing thing was falloff, and no radius fixes that.
Each star is now drawn twice, a blurred halo and a core over it, with **one blur for every star
rather than one scaled by brightness**, because a point spread function belongs to the air and the lens, not
to the star. That also makes the faint ones stay quiet for nothing: blur conserves energy, so a small
dim disc pushed through the same kernel keeps almost none of its peak, while a bright one keeps
enough to show a halo. Blurring the whole layer uniformly instead, which was the first idea, takes
the cores with it and leaves a field of smudges.

**The tints are blackbody, and that is the only reason they are allowed.** `SkyColors.starCool` and
`starWarm` are real colours at about 10,000 K and 4,300 K, with `Colors.moonlight` sitting near 5,800
K between them; the span is roughly Rigel to Aldebaran. The draw is `sign(u) * |u|^3`, so the mean
shift is a quarter of the way to an endpoint and about one star in ten carries a tint you would name.
The distribution is what keeps this honest as well as quiet: the field says stars have colours, which
is true, and never that a particular one does.

### 27. Two knobs pointing opposite ways, and nobody measured where they crossed

A 2% waning crescent printed its dark side as a bright blue-grey sphere with a thin bright rim around
it. It read as a lit planet, not as the ashen light.

`earthshineGain` rises toward new, because earthshine follows the Earth's phase and a 2% moon hangs
under a 98% Earth. `printExposure` also opens up toward new, because a crescent wants more exposure
than a full moon. Both are individually right and both were argued for in this file. Neither was ever
measured against the other, and what they multiply out to at the thin end is the bug.

Sampling the whole shader over the disc, night-side p99 against sunlit p99:

| illumination | 0.5% | 2% | 8% | 15% | 50% | 90% |
|---|---|---|---|---|---|---|
| night / lit | **0.667** | **0.354** | 0.186 | 0.132 | 0.043 | 0.007 |

A single-exposure photograph of the ashen light sits around 0.10 to 0.20. At 2% this was double the
top of that band and at 0.5% it was more than triple. The disc was not slightly hot, it was printing
its night side at two thirds of its own crescent.

**A tone curve cannot fix it, and knowing why saved building the wrong thing.** The obvious move is a
toe on the exposure, since `1 - exp(-E·lum)` is all shoulder and no toe: it compresses highlights and
leaves shadows multiplied by E, which is backwards from what a darkroom does. But the night side
spans 20:1 from crescent to gibbous and needs to span about 8:1, and every toe compresses the bottom
of a range harder than the top. Measured, a Reinhard toe strong enough to bring 2% into band took the
90% silhouette from 0.0027 to 0.00016, which is decision 21's egg all over again. **A monotonic curve
can compress a ratio; it cannot invert one.** The level was wrong, so the level moved.

`EARTHSHINE_CEILING` is 0.42 rather than an implicit 1.0. Chosen by sweeping candidates against both
constraints at once, not by arithmetic: it lands 2% at 0.154, inside the band, and takes the 90%
unlit limb only from 0.0027 to 0.0022. `EARTHSHINE_FLOOR` did not move, because the gibbous end was
never the problem, and the `1 - f` shape did not move either. What changed is the amplitude of a
print, which is what that constant always was.

**The lesson is not about the Moon, again.** Two constants were each measured, documented and correct
in isolation. The failure was in the product of the two, and it was invisible because each had its
own entry in this file and neither entry mentioned the other. When two knobs move with the same input
in opposite directions, the thing to measure is the ratio, not either one.

**A claim in this file was wrong too**, which is the part worth keeping. Decision 24 said the exposure
ramp "holds p99 inside 0.46 to 0.76 across the whole cycle" on the strength of samples from 10% up.
Below 10% it is 0.275 and 0.153. Entry 24 has been corrected to say what it measured. That is decision
18's own lesson, applied to decision 18's own author, one entry later.

### The other half: the crescent was underexposed, and fixing it re-broke the ratio

The ramp only ever stops **down**. That is right at the top of the cycle, where a full moon reflects
near 1.0 flat across the disc. At the bottom the problem is the opposite: the peak sunlit reflectance
itself collapses, so a thin crescent needs opening **up** and the ramp does nothing.

Solving numerically for the exposure each phase needs to place its sunlit p99 at 0.5, the product
`E x peakIncidence` came out **1.09 to 1.14 from f = 0.002 to f = 0.5**. Three decades, and a
constant. Everything else about the disc changes over that range and that product does not, which is
what says the law is `E ∝ 1 / peak` rather than any of the curves that could have been fitted to the
same points. That is metering: you divide by what the highlight reflects.

The peak has a closed form. Past quadrature the sub-solar point has gone round the limb, so the
brightest sunlit ground left **is** the limb, at incidence `sin g = 2 sqrt(f(1-f))`. Checked against a
200,000-step numerical maximum over the visible hemisphere: agreement to 8e-12. `peakIncidence` and a
test now carry it.

**Then the fix re-broke the thing it was paired with**, which is the lesson landing a second time in
the same entry. Metering opens the exposure roughly 4x at 0.5% illumination, earthshine rides on it
linearly, and the freshly-lowered ceiling was not enough to hold it: a 0.5% moon came out with
earthshine **38% brighter than the version this all started from**.

So the meter is floored, and the floor is set by an invariant rather than by taste:

> `printExposure(f) * earthshineGain(f) <= PRINT_EXPOSURE`, for every f.

The night side sits deep in the linear part of `1 - exp(-E*L)`, so that product is what it receives,
and `PRINT_EXPOSURE` is what the product was at new moon before any of this. **The meter may never
print earthshine brighter than the un-metered exposure did.** `EXPOSURE_METER_FLOOR = 0.20` is the
largest boost that clears it, worst case 0.994.

It lands at 1% illumination. The night-to-lit ratio was independently leaving its band at 1%. Two
constraints derived from different quantities picking the same place is the only reason to trust
either of them, and neither was tuned to the other.

Below 1% the crescent is allowed to fall out of band, to 0.26 at 0.2%. That is honest and it is also
photography: there is not enough sunlit surface left to meter on, and opening up further only prints
the earthshine. Above 9% the meter multiplies the exposure by exactly 1, so the half of the cycle
that was never wrong is bit-identical, and a test holds it there.

**`printExposure` now lives in `moonLighting.ts` next to `earthshineGain`.** It was in `moonShader.ts`,
one file and one DECISIONS entry away from the constant it multiplies against, which is the entire
reason nobody measured the product. Four tests hold them together, and a test cannot reach a file that
imports Skia. **When two constants are coupled, the coupling needs somewhere to live, and separate
files with separate write-ups is how you guarantee it lives nowhere.**

### 28. Every moon decoded its own copy of the Moon

`MoonPhaseGlyph` called `useImage` twice, and Skia's `useImage` keeps no cache: each call fetches the
file and decodes it. Home with ten records decoded 22 maps at 1024px, about 8 MB of pixels per moon,
and the ledger decoded them again whenever a row scrolled back into its window. That is why moons
arrived after the rows around them.

`components/moon/moonTextures.ts` decodes each map once per run and hands every glyph the same
`SkImage`. Moons drawn at 384 device pixels or less sample a 256px pair box-filtered from the full
maps by `scripts/build-moon-thumbs.mjs`, which is sharper there as well as cheaper: a 1024px map
squeezed into a 36pt disc through a filter with no mipmaps reads one texel in ten and shimmers.

**A hook that loads a file is a cache decision, whether or not anyone made one.**

### 29. A chart of the sky was a map of the ground

`projectToDisc` put east on the right with north up, and its test asserted exactly that. A chart of
the sky is read looking up, and looking up with north at the top puts east on the left, which is why
every planisphere is drawn that way. The old projection mirrored every constellation. Nothing drew
with it until the record's star map was planned, which is the only reason it never showed.

The test that enshrined the mirror is the part worth keeping. It checked the code against the code's
own convention, so it passed for as long as the convention was wrong.

### 30. One decimal still rounded a moon up to full

`formatIllumination` keeps a decimal above 95% so that 96% and 99.9% never both read "100%". It still
printed a 99.96% moon as "100.0%", and the rarity chips did the same through their own `toFixed(1)`
on a value `rarity.ts` had already rounded. "100.0%" reads as the exact instant of full, which is
rule 1's territory. Where one decimal would round to 100 the figure now takes a second decimal, cut
rather than rounded, so it can reach 99.99 and never 100.

### 31. Tonight's sky drew London, and called midnight live

With no location, `/sky/tonight` fell back to London's coordinates under the label "Current
Location", and it drew local midnight under the words "Live celestial sphere". Both were claims the
data did not support, on the home screen's only button. Without a place the view now asks for one;
with one it draws the moment it opened, and the caption names the phone's own clock time, which for
here and now is exact. Decision 70 brings back a fallback place, under its own name.

### 32. Saving a record showed nothing of it

Saving called `router.back()` and dropped the person on the list they came from. The phase, the
tilt, the eclipse search and the rarity walk all ran, and none of it was shown. Saving now plays the
reveal: black, the moon of that night rising at its real phase and tilt, and four lines.

The first version was a `Modal` inside the record screen, and it never appeared. Saving closes the
form's modal and opens the record in the same moment, and iOS will not present a second modal while
the first is still leaving. It is now an absolute overlay mounted after the navigation stack
(`RevealHost`), driven by `useRevealStore`, so it needs no presentation and is simply there when the
form slides away. One consequence to know: a native modal still on screen covers it.

### 33. That night in words, and never a clock time

The record page described the night with a limb tilt in degrees and an offset like ±0.61d.
`nightFacts` says what the moon did instead: when it rose and set, how high it climbed and in which
direction, what it sat in front of, which planets were up, and any lunar eclipse within a day.

Every time is said against sunset or sunrise at that place ("rose 14 min after sunset"), because the
record's offset is estimated from its longitude and ASTRONOMY.md forbids printing a clock time from
an estimate. Sunset and sunrise depend only on the coordinates, so the sentence is exact.

**Tonight's tools are the one exception, and it is not a loophole.** The full and new moon tiles and
moonrise and moonset print clock times, on the phone's own clock, for the phone's own place. Nothing
there is estimated.

Above the Arctic Circle a night can have no sunset or no sunrise, and the first version said "the sun
did not set" for both. In Tromso in December the sun never rose. The sentence now checks which.

### 34. The scrubber turns the camera, not the sky

A night is hours long, and the view showed one instant. Recomputing six thousand star vectors per
scrub step would undo the reason the sphere is precomputed. Between two instants the starry sky turns
rigidly about the celestial pole by the change in sidereal time, so the camera turns the other way
instead: three vectors, not six thousand. The ground, the horizon, the compass points and the bodies
of the solar system use the unturned camera, because they are recomputed at the scrubbed instant.

The sign is the trap. Worked through, the camera takes Rot(p, +ΔLST) about the pole p = (0, cos φ,
sin φ); the other sign runs the sky backwards and looks entirely plausible. A test checks the turned
projection against `equatorialToHorizontal` at Greenwich and Sydney.

### 35. An eclipse night drew a bright full moon

Scrubbing through 28 September 2015 showed a full white moon at the hour the real one was copper.
`skyNight.eclipseShadow` places the Earth's shadow physically: the anti-solar point at the moon's own
distance, seen from the observer, with umbra and penumbra radii widened 2% for the atmosphere. The
view multiplies the two discs over the moon at the same scale as the disc, so a partial eclipse
shows its bite on the correct side. On the 2015 eclipse it falls on the south limb, as the eclipse's
negative gamma says it should.

### 36. Reminders are written ahead, and the sync waits for both stores

A scheduled local notification cannot run code when it fires, so each year's words are written when
it is scheduled, and iOS keeps at most 64 pending. The plan covers three years per record, capped at
60, and is rebuilt on launch and on every change to a record or a bell.

The sync first ran when the records had loaded and the bells had not. It read no bells, cancelled
every reminder on the phone, and scheduled them all again a moment later when the bells arrived, on
every launch. It now waits for both stores.

A tap on a reminder opens its record. It used to open Home.

### 37. A count and its sentence described different sets

The rarity section says "1 in 25 days carry a moon at least 99.5% illuminated" and then "3 of the 12
birthdays so far have had one". The count also took any year within one point of the record's own
moon, so a 98.9% year counted under a 99.5% heading. The count now uses the threshold alone. "So far"
also counted this year's date before it had arrived; it now stops at today.

The reveal had the same problem in one line: "1 in 25 days has a moon this full" named the record's
figure while the frequency was measured at the threshold. It names the threshold now.

**A number and the words around it are one claim.** Checking the number is not enough.

### 38. NASA's API began answering with its logo

APOD moved to science.nasa.gov, and `api.nasa.gov/planetary/apod` kept answering 200 for past dates
with the same object every time: title "NASA Science", a stock blurb, the NASA logo as the image. The
app cached it permanently, because a past date's picture never changes, and every record showed the
logo under "NASA's picture for that day".

The archive URLs still work. `apod.nasa.gov/apod/apYYMMDD.html` redirects to the day's page, which
carries the title, the image, the explanation and the credit. `apodArchive` reads them. Two wrong
answers have to be caught: a date the new site has not filed redirects to the front page, which shows
another day, so the page's own date must match; and some old pages have only a stock thumbnail, so
the image must be one of APOD's own. A video day has the thumbnail and an embedded player, and is
recorded as a video. The cache treats the stored logo as a miss, so phones that cached it heal on
their next visit.

**A 200 is not an answer.** The cache trusted the status code, and the status code was never wrong.

### 39. The share card was the size of its preview

The card is authored at 1080 by 1920, and the PNG came out about 730 pixels wide on an iPhone 17
Pro. A
canvas snapshot is the canvas's own pixels, and the canvas was laid out at preview size. It is now
laid out at exactly 1080 device pixels and scaled down as a view for the preview, so the snapshot is
the full card on every screen density.

### 40. Settings said dates and places never left the phone

They do, each for one purpose the person asked for: a typed place goes to the phone's geocoder, a
GPS fix goes there for its name, and a record's date goes to NASA for that day's picture. The row now
says each of those in those words. A privacy line that is false is worse than none.

### 41. "Returns tonight" was checked against the phone's night

The hero's return check used the phone's offset ahead of the record's, so a Tokyo record viewed in
London was tested against a London night. It also always said "the same as then", and a return is
within a day of the phase, which can sit either side of a name. The check now uses the record's own
place and time, and "the same as then" appears only when the two names match.

### 42. A typed place was dropped on save

Typing in the place field clears the resolved place until "Find place" runs. Save sent whatever was
resolved, so typing "Lisbon" and tapping Save stored no place at all, which removed the tilt, the
night facts and the sky view with nothing on screen to say so. Save now finishes the lookup itself,
and if it finds nothing it asks: change the text, or save without a place.

### 43. A VoiceOver user could not leave the reveal

The reveal was one large "skip" button, and a button's children are not separate accessibility
elements, so the four lines and "Open the record" were unreachable. With the overlay marked modal,
that left nowhere to go. The root is no longer an accessibility element, and a running screen reader
gets the finished frame, as reduced motion does.

### 44. Years before 1995 spent the picture quota

NASA's archive begins on 16 June 1995. The ledger asked for every anniversary anyway, and on the
shared key's thirty requests an hour a 1970 birthday spent twenty-five of them on dates that cannot
have a picture. Dates before the archive, and dates still ahead, are never requested now.

### 45. The moon is the entrance to its sky

Tapping a date's moon opens the sky at the same date, place and illumination sample.
The route carries the moon's measured screen bounds. The sky renderer moves it from those bounds
into the projected sky while widening the view, in the existing frame loop. Closing fades
(decision 69). Reduced motion skips the movement. A saved date without a place still asks for one.

Tonight on Home opens the live sky, `/sky/tonight`. Any other day uses `/sky/preview` with that calendar date. Opening a different date must
never show tonight under that date's label. The carousel stops at thirty days before and after
today. Its arrows and screen-reader actions share those limits.

### 46. Phase names describe what the moon looks like

Display names now use illumination directly. At 99% the label is "Full moon", at 96% it is
"Almost full moon", and from 45% through 55% it is "Half moon". Near a quarter the lit fraction moves about 10 points a day, so a narrower band missed most quarter-day evenings. Below 8% it is a thin crescent,
except at 1% or below, which is a new moon. Other phases say growing or fading using the measured
waxing flag. The percentage stays beside the name and never rounds a near-full moon up to 100%.
The exact phase instant remains separate metadata and cannot override a display threshold.

### 47. Fewer repeated sections, and a closed date picker

Home shows saved dates immediately below the moon. Tonight's extra tools open on demand. The date
page puts sharing beside Edit and opens the sky through the moon. The year grid and NASA pictures
stay in the year page. Planet calculations run only when the return explanation opens.

The form starts with one date row. Tapping it opens the native iOS wheel or the existing Android
wheel. Place follows the date, notes open on demand, and new dates have three type choices.
Existing graduation records keep their stored type when edited. The form has no after-midnight
switch. It states that the selected date means that evening, matching the calculation convention.

The reveal names the saved date and offers Share. Rarity appears only at 99% and above. Its
personal count says years on this calendar date, which includes the source year without calling
the day of birth a first anniversary.

### 48. Mineral colour was too strong for an everyday moon

The shader used 9x saturation while older notes described 5x and 1x. It now uses 2x across the app
and share cards. The map, phase geometry, earthshine and exposure remain the same. The colour comes
from the measured map; its amplification is a display choice.

### 49. One thing per screen, and nothing to decide that the app can work out

The audit's question was what a first-time person has to think about. Each cut below removes a
question or a second way to do the same thing.

- **Home is the moon and your dates.** Tonight's tools (full and new moon tiles, moonrise and
  moonset, the 30-night strip) are gone. The carousel already answers "what will the moon look like
  on night X", and the tools pushed the first saved date below the fold. The arrows under the moon
  went too: the moons either side show that it swipes, and the carousel is an adjustable element
  for a screen reader. The live sky still prints the phone's own clock, which is exact, as decision
  33 allows.
- **One word for what you save: a date.** "Record" is gone from every screen. The sky view says "The
  sky that night", the same shape as "The sky tonight".
- **Rarity is in "The numbers".** It was a second large figure under the moon's own, and the return
  line already says why the night matters. The phase name keeps its percentage beside it, rule 1.
- **The form does not ask the type.** `inferOccasion` reads it from the title ("birthday", "born",
  "wedding", "nikah"). A title that names nothing keeps the start button's type or the saved one,
  and a new date falls back to "Other", whose wording ("30 years on") is true for any occasion.
- **The form fills in the phone's place** when location permission is already granted, read from
  the store without asking, with a line saying to change it if the date happened elsewhere. Its
  offset is the phone's own zone on the date itself, as "Use my location" always did.
- **The sky view shows "Find the moon" only while the moon is off screen,** and the drag tip once per
  install. The frame loop publishes the moon's on-screen state only when it flips.
- **The reveal's one button is Share.** "Done" sits under it as text.

### 50. A spring overshoots, and an overshoot reads as a stutter

The home carousel settled each swipe with a spring started at the finger's velocity. A spring that
fast overshoots its detent and comes back, and on a moon that is a visible hitch at the end of every
swipe. Worse, it handed the new date to the screen the instant the finger lifted, so Home re-rendered
and mounted a new moon at the edge of the window during the first frames of the coast, which is
exactly when a dropped frame shows.

Everything a finger moves now uses one law, `lib/glide.ts`: the shown value closes a fixed fraction
of its gap to the target per unit of time, the motion Lenis gives a web page. Under the finger the
time constant is 45 ms, which evens out touch events that arrive two to a frame and then none; after
release it is 160 ms, Lenis's default lerp at 60 Hz. It is written against elapsed time, not per
frame, because "0.1 of the gap per frame" runs twice as fast on a 120 Hz iPhone as on a 60 Hz phone.

- **The carousel** glides in a Reanimated frame callback on the UI thread, ticks the phone per day
  crossed, and commits the date when the coast is within 0.15 of a day of landing.
- **The sky's drag** moves a target that the view glides toward, and a flick throws the target on by
  0.22 s of the finger's velocity. "Find the moon" glides there instead of cutting.
- **Pinch** wrote the field of view into React state on every event, re-rendering the whole sky
  screen for each one. It now writes a ref; React hears the value once, when the pinch ends.
- **The scrubber's thumb** was placed from its `value` prop, so it moved only after the sky screen
  had re-rendered for the new time. It lives on the UI thread now, follows the finger continuously,
  sends at most one snapped time per frame, and settles onto its ten-minute mark on release.

### 51. A moon painted over a blue sky is a dark coin

The sky moon's offscreen image is opaque across the whole disc, night side included. On black that is
invisible. In twilight or by day, the night side drew as a dark disc on blue. During a lunar eclipse
it was worse: the Earth's shadow was multiplied onto the screen inside a clip 1.35 times the moon's
radius, so it darkened a circle of sky around the disc, and on any sky lighter than black that is a
ring.

What you see on the night side of a real moon is the air in front of it. So the disc first covers
what is behind it (the stars it hides) in the sky's own colour, and the moon is then **added** in its
own layer. At night that is the old picture exactly. By day the dark side disappears and the lit side
reads as pale. The shadow is drawn inside that layer with `Modulate`, which leaves transparent pixels
transparent, so it can only darken the moon. It is also one radial gradient now rather than two flat
discs: the penumbra darkens steadily inward from its outer edge, and drawn flat its edge cut a hard
straight line across the disc.

The layer's colour filter is the air, `skyView.moonSkyLight`: extinction per channel over the extra
air below the zenith, from typical sea-level coefficients, which is why a rising moon draws orange
and an overhead one draws as the shader made it. Daylight takes the lit side down a quarter. None of
it is printed and the phase is untouched.

The sky moon was also flat for a reason unrelated to light: it sampled the 256px thumbnail maps into
a 550px disc, so the relief was blurred out before the disc was shrunk onto the sky. It now uses the
full 1024px maps, the hero glow, and mipmapped sampling.

### 52. The view opens at the eye's lens, not a wide angle

The view opened at 65 degrees across the short side of a portrait phone, which is about 108 degrees
top to bottom. A flat (gnomonic) projection that wide stretches everything near the top and bottom of
the screen, so Orion looked pulled tall. It now opens at the photographer's normal lens, 46.8
degrees across the diagonal, which comes to about 21 degrees across a portrait phone. The zoom range
widened to 6 to 100 degrees so a pinch still has somewhere to go, and "Reset zoom" returns to the
normal lens.

### 53. A glyph is not a galaxy

Twenty-four Messier objects drew as chart glyphs: a dashed oval for a galaxy, a dashed box for a
nebula, a ringed cross for a planetary nebula. On a chart those are a convention a reader knows. In a
view that otherwise draws things as they look, they were shapes with no object behind them. None of
them is a naked-eye sight the way a star is, and drawing their real shapes would need images at
known size and orientation, which is a catalogue this app does not carry. They are gone, with
`messier.json`. The star field stays.

The constellation art went the other way. Fifteen figures carried an illustration and the rest drew
bare lines, so Orion lit up as a hunter while Lepus at his feet lit up as a wireframe. All 85
illustrations in Stellarium's pack ship now; Puppis and Vela are drawn inside Argo Navis, and Serpens
has none. A figure only shows while you are looking at it, so the cost is texture memory: a
3840x3456 greyscale sheet at 384pt tiles, inside the 4096 texture limit.

While a figure is lit, every star its lines pass through is labelled the way a chart labels it:
proper name, else Bayer letter, else Flamsteed number, else HR number. The line data has no star
identity, so `scripts/build-constellation-stars.mjs` matches each vertex to the nearest catalogue
star within 0.1 degrees, and fails the build if any vertex has none. A test checks the other
direction too: every vertex has a label on it, and every label sits on a vertex.

### 54. A sky needs a floor

The view showed stars below the horizon dimmed to 22%, with nothing to say the ground was there. It
now draws a ground, Stellarium's way: solid while the view looks 10 degrees up or more, gone by 2
degrees down, smooth between, so the half of the sky under your feet can still be looked at. The
projection is gnomonic, which draws every great circle as a straight line, so the ground is a
half-plane of the screen and costs one clipped rectangle per frame. Its last 6% before the horizon
fades into the sky's colour, and its colour follows the sun with the sky's. Labels under a solid
ground are not drawn.

### 55. Nothing is drawn bigger than it is

The moon was drawn at `max(9, 420 / fov)` points, six times its size at the eye's field of view,
and the planets at `max(3.4, 210 / fov)`, which made Jupiter a disc the size of a star cluster. Both
were readable and both were claims about the sky that the sky does not make.

Every body now subtends its real angle: radius over distance, through the frame's focal length,
stretched by the projection off the centre of the view. The moon is about ten points across at the
eye's field. A planet is a point of light, sized by its magnitude like a star, until the zoom
resolves its disc; the two cross-fade over the zoom where the true disc overtakes the point. A
resolved disc is phased from the phase angle and the sun's direction on screen, flattened along its
IAU pole, and limb-darkened. Saturn's rings take their opening from astronomy-engine and their
orientation from the pole, and are drawn in two halves round the globe, the far half first.

That only matters if the zoom can resolve anything, so it reaches 0.1 degrees, a small telescope
at about 140x. At half a degree Saturn's rings are four points across, which is right for 28x and
is why the limit went lower.

Opening the sky from a moon used to scale the moon down from the tapped size. It now opens at the
field of view in which the true moon matches the tapped one and zooms out, geometrically so each
frame zooms by the same factor. The moon is never scaled; the field grows round it.

### 56. The Milky Way is a measurement, projected

The band is NASA's Deep Star Maps 2020 background layer: the star map with the Hipparcos and Tycho
stars taken out, which leaves the light of Gaia's faint stars. Two properties made it the right
source. It is in J2000 RA/Dec, the catalogue's own frame, so nothing needs a galactic transform. And
its bright stars are gone, so nothing in it doubles a star the view already draws.

It is not a picture laid on the sky. `skyShader.ts` rebuilds every pixel's ray through the same
camera the stars use, turns it back to RA/Dec through the sphere's inverse rotation (exact, because
`equatorialToHorizontal` has no refraction; a test holds every star to 0.001 degrees), and reads the
map there. So the band turns with the scrubber, bends across the screen as the projection bends the
constellations, and magnifies with the zoom.

**Zoom does not change its brightness, and that is the physics.** An extended source's surface
brightness is the same at any magnification. Zooming spreads the same light per square degree over
more screen: the band grows and its structure opens up, but a patch of it is no brighter. Stars are
points and do brighten with aperture, which is why the star limit deepens as the view narrows and
the band's does not.

The map is luminance only. The band is seen by the rods, which see no colour; the cool grey is the
Purkinje shift observers report. It is stored through a 1/2.2 power so its faint outskirts keep
their levels, and dithered at output, because magnified, the steps between those levels drew as
contour rings.

### 57. The moon hides the Milky Way, and the air hides the horizon

What decides whether the band is visible is the sky behind it. The same shader evaluates
Krisciunas and Schaefer's (1991) model per pixel: moonlight scattered by air molecules and aerosols,
brightest near the moon and grown by the opposition surge at full. The band's contrast is the dark
sky over the dark sky plus the moonlight, so a full moon at 45 degrees takes it under a tenth and a
quarter moon leaves most of it. The moonlight also lights the sky itself, toward `moonlitSky`, so a
full-moon night is a dark blue rather than black.

Extinction applies per pixel to the band and per star to the catalogue, so the horizon thins the
way it does outside. Twilight leaves the band nothing until the sun is 12 degrees down and all of it
at 18, the definition of astronomical night.

The eye adapts to light in a fraction of a second and to the dark over minutes. The view compresses
the second to 2.5 seconds: the band comes up after the sky opens or after a scrub out of twilight,
and goes at once when the sky brightens.

### 58. A star's colour is its B-V, and a faint star has none

8,160 of the catalogue's stars now carry their measured B-V from VizieR V/50. Ballesteros's formula
turns it into a temperature and Mitchell Charity's blackbody table into a colour, the same chain
NASA's star maps use. Cores are binned into nine temperatures so colour costs nine extra fills a
frame; the glow stays one neutral path, because the halo belongs to the air and the eye.

Two choices are print, not measurement, and are named as such. Colours are mixed a third of the way
back to white, because the eye sees a point's colour less saturated than the same light over an
area. And stars fainter than magnitude 4 are white: there the rods do the seeing, and every
observer reports the faint field as colourless whatever its spectra.

### 59. A 120 Hz frame is 8.3 ms, and anything counted in frames runs twice as fast

The sky view was tuned at 60 Hz. On a ProMotion iPhone the frame halves, and an audit replayed the
frame loop in Node with `--jitless` to stand in for Hermes. What it found, and what changed:

- The heading label published every 15 frames on a 1 degree turn, 8 full renders of the sky screen
  a second. It now publishes only when "Facing SE" or "Below the horizon" would change, unless the
  debug panel is open.
- Scrubbing redrew the 2048 px moon each 20 minutes of the night, each one a 16 MB copy off the GPU.
  The redraw now waits until the scrubbed time has rested for 250 ms, so the moon holds its phase
  and tilt during a drag.
- The gyro reads at 120 Hz. At 60 Hz the view jumped on one frame and stalled on the next. The
  accelerometer and magnetometer stay at 60, because their smoothing factors are per reading.
- The figure fade and the compass's drift correction took a fixed fraction per frame. Both are now
  against elapsed time (270 ms and 470 ms), which matches the old feel at 60 Hz. Decision 50 is the
  same bug.
- The scrubber hands a step to the screen at most every 33 ms, not every frame, and the three
  gestures are memoised so a render does not re-register them with Gesture Handler mid-drag.
- `projectSphere` works out airmass after the screen checks: 1.38 ms to 0.70 ms a frame, jitless.
  The sphere build rotates each star by `toEquatorial` instead of calling `equatorialToHorizontal`
  (5.7 ms to 2.0 ms, agreeing to 0.02 arcseconds), and no longer computes planets nobody read.
- Uniform slots and label widths are read from Skia once, not every frame.

If a profiled build on the Pixel 7 Pro still drops frames after this, the next step is moving the
frame loop onto the UI thread.

### 60. The release build sampled every sensor at 5 Hz

Expo Go requests `HIGH_SAMPLING_RATE_SENSORS`; the app's own manifest did not. Without it,
`expo-sensors` registers on Android with `SENSOR_DELAY_NORMAL`, 200 ms, whatever `setUpdateInterval`
asks for (`SensorSubscription.kt`). The first standalone release on the Pixel 7 Pro integrated one
gyro reading per 200 ms, and the accelerometer and magnetometer filters, tuned per reading at 60 Hz,
lagged by seconds. Point mode moved in steps and settled in the wrong place. The permission is now in
`app.json` and in `android/app/src/main/AndroidManifest.xml`. It is granted at install, with no
prompt.

A second fault hid under the first. `useSkyOrientation` timed each gyro reading by `Date.now()` on
arrival. Readings reach JS in bunches, so the later ones in a bunch got a `dt` of 0 or 1 ms and their
rotation was dropped. The view under-turned and the drift correction pulled it the rest of the way.
`dt` now comes from `g.timestamp`, the sensor's own clock in seconds on both platforms
(`GyroscopeModule.kt` divides `SensorEvent.timestamp` by 1e9; iOS uses `CMLogItem.timestamp`).

### 61. The carousel switched its own loop off before the first drag

The frame callback ran only while something moved: touch-down switched it on through JS, and it
switched itself off once settled. Its first frame ran before the pan activated at 10 px, found nothing
moving, and switched itself off. The whole first swipe then moved `target` with no loop to follow it,
and the next touch restarted the loop with `target` a day away, so the moons jumped. The inline
worklet was also a new function on every render, so `useFrameCallback` re-registered it at each date
handover and each location update.

The loop now runs while Home is mounted and returns at once when idle. A `touching` shared value,
set in `onBegin` and cleared in `onFinalize`, holds it while a finger rests short of the threshold.
The worklet is a stable `useCallback`, and `onChange` is reached through a ref. Each `OrbitMoon` is
keyed by its slot (`offset mod 5`), so at a handover the moon leaving one edge becomes the moon
entering the other, both at opacity 0, instead of a Skia canvas being torn down and another built
mid-coast. `activeOffsetX` is 8, Android's touch slop, so a swipe wins against the page's scroll.

### 62. One curve, and haptics only for discrete actions

Every timed animation uses `lenis` from `lib/glide.ts`, Lenis's own easing
(`1.001 - 2^(-10t)`, clamped). Entrances, fades, layout moves, the scrubber settle, the image
viewer and the sky's entrance zoom used five different curves, one of them a spring. Motion a finger
drives keeps `glide()`, which is the same law against elapsed time. Native stack transitions and
native scroll physics stay as the OS draws them.

The carousel, the scrubber and the Android date wheel ticked the haptic motor once per detent. A
flick through a year column on the Pixel buzzed for every row. Haptics now fire on save, the reveal
landing, the bell and the details fold, and nowhere else.

### 63. What is cached, where, and why none of it is on disk

Everything this app computes about a night is a pure function of the date and the place, so it is
cached in memory and rebuilt on the next run. Rebuilding takes milliseconds, and reading a cold file
back takes longer. NASA's pictures are the only disk cache (`cachePolicy="memory-disk"`), because
they come over the network.

- Moon maps, sky images and the sky's label font decode once per run to raster
  (`makeNonTextureImage`, which RN Skia implements with `makeRasterImage`), on the JS thread, not on
  the UI thread at first draw. The sky gets its three assets together, so its frame loop starts once.
  It used to restart as each one arrived, resetting the figure fades and the eye's adaptation.
- The sky's 2048 px moon image: the last four, keyed by place and instant (`skyMoonImage.tsx`).
- The star sphere: the last four, keyed by place and anchor (`hooks/skyCache.ts`).
- `nightFactsFor` and `planetReturnsFor`: small LRUs over the pure functions, results frozen. The
  reveal, the record and the share card ran `getNightFacts` three times for one save.
- The star field behind the moon: one `SkPicture` per size.
- The share cards' fonts: loaded once per run (`components/cardFonts.ts`).

Home, the record screen and the form fill these at idle (`useSkyPrewarm`, the form's 500 ms prewarm),
so the sky's entrance starts on its first frame and the reveal starts as Save is tapped.

**Tonight's moon is drawn for a 20 minute step.** For the cache to hit, the image Home draws ahead of
time and the one the sky asks for must share a key, and "the moment the view opened" never repeats.
So tonight's moon image and star sphere use the 20 minute step around that moment, the step scrubbing
already used. The sphere loses nothing: it is a pure rotation of the catalogue about the pole, and the
sky turns it by `siderealDelta(step, now)` (decision 34). The moon image can be up to 10 minutes of
terminator drift away from exact, on a disc 25 px across at the eye's field of view. The phase label
stays exact. Records and the carousel's other days open on a deterministic night, so they cache as-is.

A GPS refresh that lands within 0.01 degrees, with the same label and offset, keeps the old place
object. A new object for the same spot rebuilt the open sky and re-rendered Home.

The entrance zoom advances at most 20 ms per frame instead of by wall time, so a slow first frame
delays the zoom rather than skipping part of it.

### 64. A black sky, a coloured band, a field to stand in, and fewer figures

Five changes to the sky view, made together, and each one reverses part of an earlier entry.

**The night sky is black.** Decision 57 lit the sky round a bright moon toward `moonlitSky`, the
dark blue a moonlit sky really is. On a phone it read as a grey-blue screen, and most nights have a
moon. The shader no longer paints the ground; the moonlight still takes the band's contrast away,
which is the half of 57 that matters. The map itself had a floor too: Gaia's faint stars are
everywhere, so drawn as it was the whole sky carried a grey wash. The map's median is now the black
point (`milkyWay.json`, `floor`), so the half of the sky away from the band draws black.

**The Milky Way is in colour.** Decision 56 kept luminance only, because the rods do the seeing and
see no colour. That is still true of the eye, and the view now draws the band the way a long
exposure does instead. The colour is the EXR's own, Gaia's measured light: red over green runs from
1.06 in the faint band to 1.5 in the brightest clouds, because dust reddens the core. The build
white-balances on the band's average, as a camera balances on its scene, so the core reads gold, the
arms blue-white and the dust lanes brown; the shader then doubles the chroma about each pixel's
luminance (`MILKY_WAY_SATURATION`). Balance and gain are print decisions, as the moon's mineral
colour is. Neither can put a hue where the map has none. The PNG went from 1.3 MB to 3.8 MB.

**The ground is Stellarium's.** Decision 54's flat ground is replaced by Stellarium's default
landscape, the field at Guéreins: eight 256 px side panels and a top-down ground disc, baked into one
azimuth and altitude panorama (`scripts/build-landscape.mjs`) and read per pixel along the ground
camera's rays (`landscapeShader.ts`), the way the Milky Way is. Its treeline stands a few degrees
above the true horizon and hides the stars behind it, as in Stellarium. It is a picture of a French
field and not of the record's place, so the horizon line at 0 degrees still marks the true horizon,
faded to a trace while the ground is solid because over a photograph it read as a crack. Lighting
follows Stellarium's shape (`landscapeLight`) with a 10% floor where Stellarium's 1% drew black on
black, and the colour goes to grey as the light drops, for the rods. The panels are 6.4 pixels a
degree, so at the eye's 21 degree field the treeline is soft; every Stellarium landscape is within
a few pixels a degree of that. The photographs are GPL-2.0-or-later.

**A small moon has glare.** At the eye's field the true moon is ten points across, and drawn exactly
as the shader made it a full moon was a dull sticker. It now takes a halo scaled by the square root
of its lit fraction and a lift of up to 60% in exposure, both gone by the time the zoom grows the disc
to 120 points, where the image's own limb glow does the job (`moonGlare`). The disc stays its true
size (decision 55); the glare is light round it, as the sun's is.

**25 constellations, not 88.** All of them drew, and the sky read as a net of faint lines through
stars nobody could name; Antlia was as loud as Orion. The view now draws the twelve of the zodiac and
Orion, Ursa Major, Ursa Minor, Cassiopeia, Cygnus, Lyra, Aquila, Andromeda, Perseus,
Pegasus, Canis Major, Crux and Boötes. The list lives in `build-sky-data.mjs`, the art sheet and the
star labels are built from its output, and the sheet went from 3840x3456 to 3840x1152.

### 65. Every Skia shader made in the frame was reported to Hermes as a megabyte

A profile on the Pixel 7 Pro at 120 Hz, against main, after decision 64's ground, coloured band and
glare: frames over the 8.33 ms deadline rose from 12.5% to 70.8%, the median frame from 7.13 ms to
15.20 ms, UI thread recording from 2.38 ms to 8.39 ms a frame, and CPU time on Hermes's collector
thread (`hades`) from 230 ms to 530 ms.

react-native-skia 2.6.2 tells Hermes a native size for every host object it makes, and the size is
fixed by type, not measured: 1 MB for each `SkShader` (`cpp/api/JsiSkShader.h`) and each
`SkPictureRecorder` (`JsiSkPictureRecorder.h`), 2 KB for a colour filter, 256 bytes for a rect. A
night frame with the moon in view and ground on screen made a recorder, the band's shader, the
ground's shader and the moon's glare gradient: four megabytes a frame, 480 MB a second at 120 Hz.
Hermes collects as that number grows, whatever the objects really hold.

The ground cost the GPU as well. It was a full-screen pass that ran whenever any pixel looked below
the treeline, which at the eye's 21 degree field is any view lower than about 40 degrees, and each
pixel above the treeline rebuilt its ray and took an arcsine to draw nothing.

What changed:

- The recorder, the full-screen rect and the moon's image rects are made once per run of the loop.
- `skyShader.uniformShader` keeps one uniform array per effect, written in place by slot, and makes
  a new shader only when a value has changed. What never changes for a sky (screen size, the
  equatorial rotation, the maps' constants) is written once. The ground's opacity moved from a
  uniform to the paint's alpha, so a fade needs no new shader.
- The sun's and the moon's glare and the Earth's shadow are gradients made once at unit size, placed
  with `translate` and `scale`, coloured by a colour filter that is remade only when its colour
  changes, and faded by the paint's alpha.
- `skyView.groundBounds` replaces `lowestAltitude` and returns the rectangle that holds every pixel
  below the treeline, or false. The sky above a positive altitude is a cap narrower than a
  hemisphere, so on a gnomonic screen its share is convex and the ground left over reaches its
  furthest on the screen's border. Sampling the border and widening each run of ground by one
  sample gives a rectangle that cannot miss ground; a test checks that pixel by pixel over 150
  cameras with roll and zoom. At the eye's field with no roll the pass now covers 75% of the screen
  at 10 degrees up, 50% at 20, 31% at 30 and 6% at 40, and is skipped at 50.

What it does not fix. A shader's uniforms are fixed when it is made, and both full-screen passes
carry the camera, so a turning phone still makes two shaders a frame: 240 MB a second of reported
size where there were 480. Taking the camera out of the uniforms (a perspective canvas matrix over
cube faces, so each shader is made once) or moving the frame loop onto the UI thread (decision 59)
is the next step if a new profile still misses frames. A resolved planet's disc and the sun's
(`drawBodies.drawDisc`) still make a gradient each frame they are drawn.

### 66. The sky shook in a resting hand, and Stellarium's filter is the cure

Point mode jittered with the phone held still. Nothing was broken; the filter passed real motion
through. `useSkyOrientation` integrated the raw gyroscope itself, and a gyroscope measures a hand's
8 to 12 Hz tremor faithfully, because the tremor is real. The integrated view was pulled toward the
raw accelerometer and magnetometer over 470 ms, which fed their noise in below the tremor. The last
stage eased over 7 to 16 ms, and it eased lighter as the view narrowed, so at the eye's 20 degree
field, where a tenth of a degree is two points, every shake reached the screen. Roll came straight
off the accelerometer with one average per reading.

Stellarium's answer dates from 2013. The sensor code is in Stellarium Mobile 1.x, Noctua's GPL
source (`src/core/modules/SensorsMgr.mm` for iOS, `SensorsMgr.cpp` for Qt on Android; mirrored on
GitHub as ultrapre/Stellarium-mobile), and the Qt version lived on in the web engine as
`src/modules/sensors.c` until it was removed as unused in September 2018. All three do the same
three things, and the view now does them:

- **The operating system fuses the sensors.** Stellarium's iOS build reads CoreMotion's attitude
  rather than the raw sensors. The view reads expo-sensors' `DeviceMotion`, which is CoreMotion's
  attitude on iOS and `TYPE_ROTATION_VECTOR` on Android: gyroscope, accelerometer and magnetometer
  fused with bias and calibration models.
- **The reading is taken once a frame.** The listener keeps the newest attitude; the frame loop reads
  it, as Stellarium's `update()` reads `manager.deviceMotion`.
- **Each frame moves part of the way to it, and less when zoomed in.** Stellarium's coefficient is
  `0.05 + (fov - 5) * 0.15 / 125` a frame, the field of view clamped to 5 to 130 degrees
  (`attitude.sensorBlendPerFrame`). It is per frame at 60 Hz, so it is applied against elapsed time
  (decision 59). The first reading is shown as it is, as Stellarium's `firstMeasure` is.

One part is not Stellarium's. Stellarium averages the gravity vector for pitch and roll and the
azimuth as an angle. An averaged azimuth swings sideways at the zenith, where it is undefined, and
this view passes through the zenith on purpose. So the same average is taken on the camera's forward
and up vectors (`attitude.smoothAxes`), which carry the same three angles with no seam.

The cost is lag, and it is Stellarium's: the time constant is 234 ms at the eye's field, 325 ms at
5 degrees and closer, 93 ms at 100. A 60 degree turn at 90 degrees a second ends with the view
20 degrees behind, 5 degrees behind a third of a second later, 2 degrees behind at half a second, and
within a degree after 0.8 s. In return a
resting tremor reaches the screen at 7% of its size at the eye's field and 5% zoomed in (tests in
`attitude.test.ts`). The coefficient is one function if a device test says it should be lighter.

**Both platforms' angles were checked against the platforms' own matrices.** expo forwards
CoreMotion's yaw, pitch and roll unchanged, in `CMAttitudeReferenceFrameXMagneticNorthZVertical`.
CoreMotion composes them in the W3C order, which is how WebKit's `WebCoreMotionManager.mm` builds its
matrix, but its X axis is magnetic north, so yaw 0 is the right edge pointing north and W3C alpha is
yaw plus 90 degrees (`COREMOTION_YAW_TO_ALPHA`). Android's module sends `-azimuth, -pitch, roll` from
`SensorManager.getOrientation`, which are the W3C angles as they stand. A test rebuilds each
platform's matrix and holds the camera to it. Neither mapping has been run on a phone yet; the Flip
N/S switch stays in the debug panel.

What went with the old pipeline: the three raw sensors, the gyro integration and its timestamp
handling (decision 60's second half), the accelerometer's per-platform sign and its Flip up/down
switch, since the operating system now owns gravity. On Android, `DeviceMotion.isAvailableAsync`
wants a gyroscope, an accelerometer and the linear acceleration, rotation vector and gravity
sensors; a phone missing any of them, in practice one with no gyroscope, can no longer point and gets
drag only. Location permission now
only adds the declination; without it the view faces magnetic north.

**The release build's settings were not the cause.** R8 full mode, minification and resource
shrinking rewrite Java and Kotlin bytecode, not JavaScript. arm64-only is an ABI choice. Hermes uses
IEEE 754 doubles with or without `-O`. The React Compiler does not compile `useSkyOrientation` at all:
run over the file, `babel-plugin-react-compiler` 1.0.0 bails out on `++` applied to variables a
callback captures, so the hook runs as written. `HIGH_SAMPLING_RATE_SENSORS` is still needed:
`DeviceMotion` registers through the same `SensorSubscription.kt` as the raw sensors (decision 60).

### 67. A lit figure draws itself out of its stars

Stellarium grows constellation lines rather than fading them in (`constellations.c`,
`line_animation_effect`, in the web engine since 2019). Each constellation has its own fader, linear
over 0.5 s, and every segment of its figure grows from its first star toward its second at once,
along the great circle: the two directions are mixed and normalised. Stellarium Mobile's default,
`show_only_pointed`, lights the constellations at the centre of the screen and grows their lines as
one arrives there; looking away runs it backwards.

A lit figure here is the one inside the focus cone, so that is where the growth runs. Each figure
carries a fader of the same length (`FIGURE_GROW_MS`). The resting figure stays whole underneath at
its faint alpha: a growing segment is split at its tip, lit behind and resting ahead, so the two
alphas never stack. Stellarium eases the growth with smoothstep over the fader's first half; the
growth here takes lenis over the whole fader (decision 62), which carries a line 90% of the way in
about 165 ms where smoothstep takes about 200.

Two of Stellarium's line habits were not taken. It stops each line short of its stars by the star's
drawn radius and 0.2 degrees, and it decides "pointed" by which IAU boundary holds the screen's
centre rather than by distance from the figure's centroid.

### 68. Two writers shared the status bar, and Home's clock went black on black

On the Pixel, Home's clock, signal and battery glyphs were black over Home's black plate. Two
mechanisms set the glyphs. The root layout mounted `<StatusBar barStyle="dark-content">`, the sky,
the reveal and the picture viewer each mounted a light one, and Home called `StatusBar.setBarStyle`
directly: light while its plate sits under the bar, dark on focus loss. React Native merges the props
of every mounted `<StatusBar>` and re-applies the result a tick after any of them mounts or unmounts
(`StatusBar.js`, `_updatePropsStack`). Closing the sky unmounted its `<StatusBar>`, and the re-apply
landed after Home's focus had set light glyphs, so the root's dark ones came back. Opening the sky
raced the same way against Home's blur.

Nothing mounts a `<StatusBar>` now. `hooks/statusBar.ts` is the only writer. Each stack screen states
its glyphs when it gains focus, through the root stack's `screenListeners`: dark on paper, light on
the sky, and light for the iOS sheets, whose bar sits over the black gap a page sheet leaves above
itself. Home still picks its own by scroll position, and writes only while it has focus. Nothing
writes on blur, because the screen gaining focus writes next. The reveal and the picture viewer cover
every screen, so they hold a count while they are up and the bar stays light whatever focuses under
them.

Android ignores the bar's colour while the app is edge-to-edge (`StatusBarModule.kt`), so Home's
`setBackgroundColor` calls did nothing there and are gone.

### 69. Closing the sky fades instead of flying the moon back

Decision 45's close reversed the entrance: the field narrowed onto the centre of the view and the moon
flew back to the bounds it was tapped from, turning back from its tilt. That reads as a return only
when the moon sits near the centre, upright and white. With the view pointed away from the moon,
rolled, or with the moon tinted by twilight or an eclipse, the close zoomed into empty sky while a
coloured disc slid in from the edge of the screen. And only the close button ran it. The sky is
pushed with the stack's animation off, because the canvas draws the entrance, so the iOS back swipe
and Android's back button cut straight to the page.

The close is now the native stack's fade. Once the first frame is up, the screen sets its own
`animation` option, and the pop uses it. The button, the swipe and the back button leave the same
way. The entrance is unchanged.

The option differs by platform because the two `"fade"`s differ. iOS's pop holds the page opaque and
takes the sky's alpha to 0, ease-in-out (`RNSScreenStackAnimator.mm`). Android's pop runs
`rns_fade_out` on the sky and `rns_fade_in` on the page at once, both linear over 150 ms, so at the
midpoint each is half transparent and a quarter of whatever sits behind the stack shows through. A
screen recording on the Pixel had the middle frame brighter than both the sky and Home: paper leaking
in, which over a black night sky and Home's black plate is a grey flash. Android uses
`"fade_from_bottom"` instead. Its pop holds the page with `rns_no_animation_250` and fades the sky over
its last 150 ms while dropping it 8% on accelerate_quint, which has moved it 1.3% of the screen by
the time it is half gone. Reduced motion keeps the plain fade on both platforms, since a fade has no
movement.

### 70. Without a place, "here" is a named default

Decision 31 took out the London fallback because it was labelled "Current Location", a claim about
the phone that the data did not support. After that, a phone with no place (before anyone allowed
location, or after a refusal) showed no place on Home and opened tonight's sky on a request for one.

"Here" now falls back to `DEFAULT_PLACE` in `hooks/useCurrentLocation.ts`: a fixed city with its own
coordinates, its own name and its own UTC offset. Home says "Over" and that city's name, with the
location action underneath, so the caption names a city and never claims to be where the phone is.
The sky names it in its header. The fallback lives in the hook and not in the store, so the store
holds only what the phone reported, and the new-date form, which prefills from the store, never
starts a date at a place nobody chose. A saved date without a place still asks for one.

Tonight's sky prints a clock time from the phone's own clock, which decision 33 allows because the
phone's clock is exact for the phone's place. The default place is not where the phone is, so on it
the sky prints that place's time from its fixed offset, which is exact because that zone keeps no
daylight saving. A phone one zone away printed its own hour beside the other city's sky.

## Decisions

**The mineral colour is real, and that is the only reason it is allowed.**

The moon carries LROC WAC colour now, amplified by `MINERAL_SATURATION`. The current amplification is 2x. Decision 48 records the change from the earlier settings.

The Moon's colour differences are genuine and faint. Titanium shifts a mare from red toward blue, so
Mare Tranquillitatis really is cooler than Mare Serenitatis: measured on the bundled map, B/R 0.967
against 0.895, with a mean saturation across the disc of 0.057. The astrophotographs this is modelled
on are made exactly this way, by raising the saturation of a real exposure until a real difference
becomes visible. The shader's operation can only scale a texel away from its own grey, so it cannot
introduce a hue that is not in the map. Pointed at a greyscale map it does nothing.

**The line is the map, not the number.** Raising saturation over measured colour is a print decision.
Raising it over a colourised greyscale would be inventing measurements, and no value of the knob would
make that acceptable. `sources/README.md` carries the two checks that decide which situation you are
in, because the maps come from a mirror and a mirror is somebody's copy.

**Two things had to be got right before the colour showed at all.**

*White balance before saturation.* The map has a mild global warm cast. Saturating around each texel's
own grey amplifies that cast along with everything else, and at the earlier 5x setting the whole disc went uniformly sepia
with the mineral signal buried under it. Dividing by the map's mean chromaticity first makes the
average texel neutral, so what gets amplified afterwards is each region's departure from the Moon's
own average colour, which is the titanium and iron signal.

*The tone curve runs on luminance.* Grading R, G and B independently pulls all three toward the same
output range, which quietly desaturates precisely the differences being sought. Luma is graded and RGB
scaled by the ratio, so exposure moves and chroma does not.

**Relief comes from LOLA, never from the albedo.** It would have been easy to derive a bump map from
brightness, and it would have looked convincing and been false: a dark mare is not a valley, so the
surface would light wrongly everywhere the two disagree. The normals come from real elevation.

Relief fades out toward the limb, which is honesty rather than tidying. An orthographic projection
compresses without limit as r approaches 1, so the last pixels of the disc average hundreds of
kilometres of terrain and the normal stored there is not the normal of anything; applied at full
strength it tipped limb pixels past the terminator condition and scattered black speckle around the
edge. Nothing is lost, because the relief worth seeing is at the terminator, which sweeps the middle
of the disc, and grazing light is what makes it read.

**The moon is shaded, not cut out.**

The glyph was a photograph clipped to a two-arc path with blurred copies of that path stacked
underneath as glow. It could not look like a sphere, because a cutout has no normals, and its
"gradient" was one flat exposure with a 1.5px blur along the terminator. `moon/moonShader.ts` now
lights the disc per pixel and draws the halo in the same pass.

**The terminator did not move.** For a sphere lit from L it is N·L = 0, which projects to an ellipse
of semi-axis |cos g|, and cos g = 2f - 1, the same |2f - 1| the old path used for `b`. The two agree
by derivation, `moonLighting.ts` is the single definition both read, and `moonLighting.test.ts` holds
them to it. `getLitPathRotation` still aims the light and `getLunarNorthRotation` still aims the
photograph, still independently, so decision 18 survives intact.

**The photometry is Lunar-Lambert, not Lambert.** This is the part that decides whether a rendered
moon looks real. A Lambert sphere is brightest at its centre and falls off to the limb; the real full
Moon is flat almost to its edge, because regolith backscatters. Lunar-Lambert blends Lommel-Seeliger
single scattering with Lambert through McEwen's phase coefficient, giving a flat full moon and a
smooth roll-off to the terminator for free. Its one flaw is a singularity at grazing emission, where
it runs to twice full brightness and prints a white wire along the sunward limb, so the result is
capped at 1.35.

**Colour is still never invented.** `MINERAL_SATURATION` pushes each texel away from its own grey and
can only amplify hues the albedo map already contains. The monochrome map originally used 1.0. The current LROC colour map uses 2.0, as recorded in decision 48.

**The lunar photograph is graded. The geometry is not.**

`assets/moon_disc.png` is no longer the raw LRO albedo map. Its opaque pixels ran 58 to 221 with the
median at 123, which puts the maria near 76 against highlands near 177, and at hero size on a dark
plate that spread resolves into a face. The app prints that disc under someone's name on their
birthday.

So `scripts/build-moon-texture.mjs` now ends in a darkroom pass: a small blur mixed back, a lifted
black point, a white point, a tint toward `Colors.moonlight`, and a radial falloff at the limb. The
shipped grade takes the maria-to-highland spread from 101 levels to 80.

**This does not violate rule 1.** Nothing measured moves. The projection, the centring, the crater
positions, the terminator, the bright-limb angle and the pole rotation are all exactly what they
were, and no feature is painted in or removed. What changed is exposure, which was never a
measurement: the raw map is itself a processed product with an arbitrary stretch, so "unedited" was
never one of the app's claims. The line to hold is that the app must not state a false astronomical
claim, and a print that is easier to look at states none.

`--list` prints the available grades and `photograph` reproduces exactly what shipped before, so the
change is always A/B-able.

**Three written rules were reversed on purpose.** "Two gestures
and nothing else" for motion gave way to the reveal, the tonight dial and the scrubber; "no icons"
gave way to a handful of lucide glyphs where a word alone was ambiguous (bell, share, edit, close,
compass, hand); and the tonight surface grew tools that print clock times (decision 33). Each was
picked by clicking a prototype, not argued in prose. Rules 1 to 4 did not move.

**The night card leads, and paper stays one tap away.** It was picked from four in the prototype.
It is black to the edges with the same star grain every plate draws, and every line is a paragraph
that wraps; the optional fact, returns line and dedication are dropped whole, never cut, when the
square format runs out of room.

**A backup adds and never overwrites.** A restore takes only the records whose ids are not already on
the phone, because the copy on the phone may have been edited since the file was made. Every field
in the file is checked before anything reaches the store, and a record that fails is counted and
left out rather than guessed at.

**The icon is drawn by the moon's own maths.** `scripts/build-icon.ts` renders the crescent with the
shader's lighting model, so the app icon and the moons inside the app are the same object.

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
16.7 ms budget, and only about 275 stars are on screen at once after culling. (That was a JIT figure
from before air extinction existed. Decision 59 has the 120 Hz numbers.) A flagship phone
cannot fail to draw 275 dots. The framework was never the bottleneck, the render path was, and
moving it off React fixed it without a rewrite.

**Use impersonal, publicly verifiable fixtures.** Eclipse instants pin illumination against physics.
