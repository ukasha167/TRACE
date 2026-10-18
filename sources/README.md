# Lunar source maps

The two equirectangular maps `scripts/build-moon-maps.mjs` projects into
`assets/moon_disc.png` and `assets/moon_normal.png`.

They are **not committed**. Together they are about 38 MB, they never ship in the
app bundle, and the derived maps that do ship are committed instead. What is
committed is everything needed to regenerate them: the URLs below, the build
script, and the two measurements that say whether a file is the real thing.

| File | What it is | Size |
|---|---|---|
| `lroc_color_8k.jpg` | LROC WAC colour, 8192x4096 equirectangular | 29.7 MB |
| `ldem_8k.jpg` | LOLA LDEM elevation, 8192x4096, 8-bit | 7.9 MB |
| `2k_moon.jpg` | The old monochrome LRO map. Superseded, kept for reference | 1.1 MB |

## Where they came from

Both originate in NASA's [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720)
(Visualizations by Ernie Wright, NASA Scientific Visualization Studio), which is
public domain.

The colour map is adapted from the Hapke-normalised LROC WAC mosaic, built by the
camera team from over 100,000 Wide Angle Camera images. Red carries the 643 nm
band; green and blue are linear combinations of the 566 and 415 nm bands. The
elevation map comes from the Lunar Orbiter Laser Altimeter team's gridded data.

They were fetched from a mirror at
[MOON-QUAKERS/MOON-QUAKE-PROJECT](https://github.com/MOON-QUAKERS/MOON-QUAKE-PROJECT)
(`lroc_color_poles_8k.jpg`, `ldem_64_uint_8k.jpeg`), because svs.gsfc.nasa.gov
was unreachable from the machine that built these. Prefer NASA directly when you
can reach it.

## Verifying a replacement

A mirror is somebody's copy, so neither file was trusted on the strength of where
it came from. Both were checked against facts about the Moon that a colourised
greyscale or a decorative height field cannot reproduce. Re-run these after
changing either source.

**Colour: the titanium signature.** Titanium shifts a mare from red toward blue,
which is why Mare Tranquillitatis is visibly cooler than Mare Serenitatis. This
is the entire physical basis of the "mineral moon" look, and it is the reason the
shader is allowed to amplify saturation at all.

| Region | Measured B/R |
|---|---|
| Mare Tranquillitatis (high Ti) | 0.967 |
| Mare Serenitatis (low Ti) | 0.895 |

Tranquillitatis must come out bluer. If the two are equal, the file is a
colourised greyscale and `MINERAL_SATURATION` would be amplifying nothing but
JPEG noise.

**Elevation: the shape of the Moon.** The far side is higher than the near side,
and South Pole-Aitken is the deepest basin on it.

| Region | Measured 8-bit level |
|---|---|
| South Pole-Aitken | 49.1 |
| Mare Imbrium | 98.3 |
| Far-side highlands | 161.4 |
| Near-side mean | 114.0 |
| Far-side mean | 135.8 |

## Rebuilding

```bash
node --max-old-space-size=4096 scripts/build-moon-maps.mjs gentle
```

`--list` prints the grades. `photograph` reproduces the map as measured, so the
print is always comparable against it.

## The Milky Way

`milkyway_2020_4k.exr` (4096x2048, 35 MB) is the "Milky Way background" layer of NASA's
[Deep Star Maps 2020](https://svs.gsfc.nasa.gov/4851) (Ernie Wright, NASA Scientific Visualization
Studio, public domain): the star map with the Hipparcos and Tycho stars removed, leaving the light of
Gaia DR2's fainter stars, in J2000 RA/Dec plate carree. Download it from that page into this folder
and run `node scripts/build-milky-way.mjs`. It is gitignored like the lunar maps.

To check a replacement: the galactic centre must land at about RA 17h45m, Dec -29 degrees (three
quarters of the way across the map, RA increasing to the left), and the Large and Small Magellanic
Clouds must show as two bright patches near Dec -70 degrees.
