# Raindrop Ripples

An interactive WebGPU-based raindrop and water ripple simulation with real-time audio synthesis.

![WebGPU](https://img.shields.io/badge/WebGPU-Enabled-blue)
![Three.js](https://img.shields.io/badge/Three.js-0.170-green)
![FAUST](https://img.shields.io/badge/FAUST-Audio-orange)

## Features

- **WebGPU Rendering**: Hardware-accelerated graphics using Three.js WebGPU renderer
- **Realistic Water Simulation**: Custom shader with Fresnel reflections and HDR environment mapping
- **GPU-Accelerated Ripples**: Compute shader-based wave propagation using WebGPU
- **FAUST Audio Synthesis**: Polyphonic chord synthesizer inspired by Mutable Instruments Plaits
- **Spatial Audio**: Position-based audio with reverb and delay effects
- **Interactive Controls**: Adjust raindrop frequency, speed, chord type, and audio parameters
- **Atmospheric Visuals**: Warm sunset fog, glowing particles, and dynamic reflections

## Demo

[Live Demo](https://your-deployment-url.vercel.app) (requires WebGPU-compatible browser)

## Browser Requirements

This application requires **WebGPU support**. Compatible browsers include:

- Chrome/Edge 113+ (desktop)
- Safari 18+ (macOS)
- Firefox with `dom.webgpu.enabled` flag

**Note**: Mobile browsers have limited WebGPU support as of 2026.

## Technology Stack

- **Graphics**: Three.js (WebGPU renderer)
- **Audio**: FAUST WebAssembly + Web Audio API
- **Build Tool**: Vite
- **Language**: JavaScript (ES Modules)

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/raindrop-ripples.git
   cd raindrop-ripples
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

4. **Open browser**:
   - Vite will automatically open http://localhost:5174
   - Or manually navigate to the URL shown in terminal

## Usage

### Visual Controls

- **Frequency**: Adjust raindrop spawn rate (drops per second)
- **Speed**: Control raindrop fall speed (gravity)
- **Camera**: Click and drag to orbit, scroll to zoom

### Audio Controls

1. Click **"Audio: OFF"** button to initialize audio (requires user gesture)
2. Adjust parameters:
   - **Volume**: Master audio level
   - **Chord**: Select from 11 chord types (Octave, Fifth, Sus4, Minor, etc.)
   - **Morph**: Blend between sine/triangle/saw/square waveforms
   - **Brightness**: Filter cutoff frequency
   - **Decay**: Note envelope length
   - **Reverb**: Spatial reverb amount
   - **Delay**: Echo effect mix

## Project Structure

```
raindrop-ripples/
├── src/
│   ├── main.js                 # Application entry point
│   ├── audio/
│   │   ├── AudioSystem.js      # FAUST + Web Audio integration
│   │   ├── NoteMapper.js       # Spatial position to MIDI note mapping
│   │   └── faust/              # Compiled FAUST WebAssembly modules
│   ├── water/
│   │   ├── LakeSurface.js      # Water mesh with custom shader
│   │   ├── RippleSimulation.js # WebGPU compute shader for waves
│   │   └── WaterMaterial.js    # Custom water shader material
│   ├── particles/
│   │   └── RaindropSystem.js   # Instanced raindrop particles
│   └── environment/
│       └── Sky.js              # HDR environment map loading
├── faust/
│   └── chord-synth.dsp         # FAUST source code for chord synth
├── public/
│   ├── textures/               # HDR environment maps
│   └── audio/                  # Compiled FAUST modules (WASM)
├── index.html                  # HTML entry point
├── vite.config.js              # Vite build configuration
└── package.json                # Dependencies and scripts
```

## Audio Architecture

The audio system uses **FAUST (Functional Audio Stream)** compiled to WebAssembly:

- **Chord Engine**: 11 chord types with semitone intervals
- **Morphable Oscillators**: Blend between 4 waveforms per voice
- **Polyphonic**: Up to 16 simultaneous voices
- **Effects Chain**: Stereo delay → Freeverb reverb
- **Spatial Mapping**: X/Z position → note selection + stereo panning

### Chord Types

0. Octave (0, 12)
1. Fifth (0, 7, 12)
2. Sus4 (0, 5, 7, 12)
3. Minor (0, 3, 7, 12)
4. Minor 7th (0, 3, 7, 10)
5. Minor 9th (0, 3, 10, 14) ← **default**
6. Minor 11th (0, 3, 10, 17)
7. 6/9 (0, 2, 9, 16)
8. Major 9th (0, 4, 11, 14)
9. Major 7th (0, 4, 7, 11)
10. Major (0, 4, 7, 12)

## Graphics Techniques

- **Custom Water Shader**: Fresnel reflections, environment mapping, specular highlights
- **WebGPU Compute Shaders**: Wave equation solver for ripple propagation
- **Instanced Rendering**: Efficient raindrop particle system
- **HDR Environment Mapping**: Realistic reflections using RGBE format
- **Exponential Fog**: Atmospheric depth with warm sunset color palette
- **Additive Blending**: Glowing particle effects

## Building for Production

```bash
npm run build
```

This creates an optimized build in the `dist/` directory.

Preview the production build locally:

```bash
npm run preview
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions on deploying to:

- Vercel (recommended)
- Netlify
- GitHub Pages
- Cloudflare Pages

Quick deploy to Vercel:

```bash
npm install -g vercel
vercel
```

## Performance Notes

- **GPU Compute**: Ripple simulation runs entirely on GPU
- **Instanced Meshes**: Efficient rendering of up to 200 particles
- **Audio Throttling**: Limits note triggers to prevent overload at high spawn rates
- **WASM Audio**: FAUST compiled to WebAssembly for low-latency synthesis

## Credits

- **Three.js**: WebGPU rendering framework
- **FAUST**: Audio DSP language by GRAME
- **Mutable Instruments**: Chord engine inspiration from Plaits module
- **HDR Environment Maps**: [Poly Haven](https://polyhaven.com/)

## License

MIT

## Development

To recompile the FAUST audio DSP:

1. Install [FAUST](https://faust.grame.fr/downloads/)
2. Compile to WebAssembly:
   ```bash
   faust2wasm -poly faust/chord-synth.dsp -o public/audio/chord_synth
   ```
3. Copy generated files to `src/audio/faust/`

## Troubleshooting

### "WebGPU is not supported on this browser"

Update to Chrome 113+, Edge 113+, or Safari 18+.

### FAUST audio not working

Check browser console for errors. Ensure all files in `public/audio/` are present:
- dsp-meta.json
- dsp-module.wasm
- effect-meta.json
- effect-module.wasm
- mixer-module.wasm

### HDR texture too large

WebGPU texture limit is 8192 pixels. Resize HDR files using image editing software.

## Contributing

Contributions welcome! Areas for improvement:

- Additional chord progressions or scales
- More water shader effects (caustics, foam, underwater view)
- Mobile WebGPU support when available
- Alternative audio synthesis (granular, FM, wavetable)
- Save/load preset system

## Acknowledgments

Built with modern web technologies and inspired by:
- WebTide water rendering techniques
- Mutable Instruments Eurorack modules
- Shadertoy procedural shaders
- Web Audio API best practices
