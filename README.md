# TRACE

An offline-first astronomy app about recurrence. Enter any date and location meaningful to you, and TRACE reconstructs the exact night sky as it appeared that evening, calculates the rarity of that moon, and discovers the future and past anniversary years when that sky returns.

Built with Expo, React Native, and TypeScript. All astronomical calculations and planetarium renders run entirely on-device without requiring a backend.

---

## Features

- **Moon Recurrence**: Searches 60 years in either direction to identify anniversary dates when the moon returns to the exact same phase (based on astronomical cycles like the 19-year Metonic cycle).
- **Measured Rarity**: Calculates the statistical uniqueness of any given moon phase and illumination level against a 29,220-day historical baseline.
- **Life Ledger**: A year-by-year chronological timeline across an entire life, pairing each birthday's true lunar phase and tilt with NASA's Astronomy Picture of the Day (APOD).
- **Immersive Planetarium**: Real-time 3D sky view tracking phone movement (compass & gyro) or touch gestures. Features 8,404 stars, 89 constellations, 110 Messier objects, planets, and the moon accurately positioned for any historical date and location.
- **Topocentric Lunar Rendering**: Real-time moon shader rendering true limb illumination, realistic Earthshine, and local observer tilt.
- **Shareable Export Cards**: High-resolution Skia-rendered summary cards (1080x1920 or 1080x1080) for sharing milestones.
- **Privacy & Offline First**: Zero tracking, zero ads, no accounts, and no telemetry. Location data never leaves the device.

---

## How It's Built

### Tech Stack

- **Framework**: [Expo](https://expo.dev) (~57) with [Expo Router](https://docs.expo.dev/router/introduction/) (file-based routing) and React Native (0.86). Fully compatible with Expo Go.
- **Rendering & Shaders**: [@shopify/react-native-skia](https://shopify.github.io/react-native-skia/) & [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/) for 60 FPS celestial projection and SkSL custom lunar surface shaders.
- **Astronomical Math**: Client-side coordinate transforms, ephemeris calculations, and celestial mechanics using pure TypeScript, [`astronomy-engine`](https://github.com/cosinekitty/astronomy), and [`suncalc`](https://github.com/mourner/suncalc).
- **State Management**: [Zustand](https://github.com/pmndrs/zustand) with `@react-native-async-storage/async-storage` persistence.
- **Data Caching**: NASA APOD imagery cached locally in AsyncStorage for offline access.

### Project Structure

```
src/
├── app/            # File-based routes (Expo Router)
├── components/     # UI components, Skia canvas renderers, and lunar shaders
├── hooks/          # Custom hooks (device orientation, sensors, animations)
├── lib/
│   ├── astronomy/  # Pure astronomical math and algorithms (100% test-covered)
│   └── apod/       # NASA APOD client and response normalization
├── store/          # Zustand store with persistence
└── data/           # Pre-compiled Yale star catalog, constellations, and Messier data
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [Expo Go](https://expo.dev/go) app on your mobile device, or an iOS Simulator / Android Emulator

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ukasha167/TRACE.git
   cd TRACE
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running the App

Start the Expo development server:

```bash
npx expo start
```

- Press **`i`** to launch in the iOS Simulator.
- Press **`a`** to launch in the Android Emulator.
- Scan the QR code with your camera (iOS) or the Expo Go app (Android) to test on a physical device.

### NASA API Key (Optional)

The app queries NASA's Astronomy Picture of the Day (APOD) for the Life Ledger and milestone records. A fallback `DEMO_KEY` is included out-of-the-box, but is rate-limited to 30 requests per hour.

For unrestricted use (1,000 requests/hour):
1. Obtain a free API key at [api.nasa.gov](https://api.nasa.gov).
2. Create a `.env` file in the project root:
   ```env
   EXPO_PUBLIC_NASA_API_KEY=your_api_key_here
   ```
3. Restart the Expo development server. Alternatively, you can paste your key in the in-app Settings screen.

---

## Development & Testing

TRACE uses `tsx` with Node's built-in test runner for unit tests:

```bash
# Run unit test suite (155 tests)
npm test

# Type check with TypeScript
npx tsc --noEmit
```

---

## Data & Attribution

- **Stars (8,404 to mag 6.5)**: Yale Bright Star Catalog (5th Revised Ed., Public Domain)
- **Proper Star Names (333)**: IAU Working Group on Star Names (IAU-CSN)
- **Constellations & Messier Objects**: [d3-celestial](https://github.com/ofrohn/d3-celestial) (BSD-3-Clause)
- **Constellation Illustrations**: Johan Meuris for Stellarium (Free Art License 1.3)
- **Astronomy Picture of the Day**: NASA (Public Domain / respective authors)

---

## License

This project is licensed under the [MIT License](LICENSE).
