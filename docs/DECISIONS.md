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
hemisphere was drawn. Once the view rendered the full sphere it became a bug: on 2004-10-27 over
Lahore, Saturn was the only planet above the horizon, and the other four silently vanished instead
of appearing below the horizon where they belong.

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
as `useMilestonesStore((s) => s.getMilestone(id))` — the call **inside** the selector — and was
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
way paper grain does not claim to be paper. Seeding it per record — which is the obvious next idea,
and the reason this entry exists — would make it say that this night's sky differed from that one,
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
rather than one scaled by brightness** — a point spread function belongs to the air and the lens, not
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

## Decisions

**The mineral colour is real, and that is the only reason it is allowed.**

The moon carries LROC WAC colour now, amplified by `MINERAL_SATURATION`. The amplification is large
(5x) and the result is striking, so it is worth being exact about why it is not a lie.

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
own grey amplifies that cast along with everything else, and at 5x the whole disc went uniformly sepia
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
of semi-axis |cos g|, and cos g = 2f - 1 — the same |2f - 1| the old path used for `b`. The two agree
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
can only amplify hues the albedo map already contains. It sits at exactly 1.0, a no-op, because the
bundled map is monochrome to within its JPEG noise. Raising it without a real colour map would be
inventing measurements, which is rule 1.

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
measurement — the raw map is itself a processed product with an arbitrary stretch, so "unedited" was
never one of the app's claims. The line to hold is that the app must not state a false astronomical
claim, and a print that is easier to look at states none.

`--list` prints the available grades and `photograph` reproduces exactly what shipped before, so the
change is always A/B-able.

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
