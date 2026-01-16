# Vercel Deployment - FAUST Audio Fix

## Problem
FAUST audio was working in local development but falling back to Web Audio synthesis in production (Vercel deployment).

## Root Cause
FAUST WebAssembly files (`.wasm`) and metadata (`.json`) need to be served as static assets from the `public/` directory. When files are in `src/`, Vite bundles them differently during production builds, breaking the runtime `fetch()` calls that load WASM modules.

## Solution Applied

### 1. Moved FAUST Assets to Public Directory
```
Created: public/audio/chord_synth/
├── create-node.js          # FAUST loader (updated paths)
├── dsp-meta.json           # DSP metadata
├── dsp-module.wasm         # Main synthesizer WASM
├── effect-meta.json        # Effect metadata
├── effect-module.wasm      # Reverb/delay effect WASM
├── mixer-module.wasm       # Polyphonic voice mixer WASM
└── manifest.json           # Module manifest
```

### 2. Updated create-node.js
Changed base URL from relative imports to public path:
```javascript
// Before (broken in production):
const baseUrl = new URL('./', import.meta.url).href;

// After (works in dev and production):
const baseUrl = '/audio/chord_synth/';
```

Also updated the faustwasm import to use absolute path from src:
```javascript
const { FaustMonoDspGenerator, FaustPolyDspGenerator } =
  await import('../../../src/audio/faust/faustwasm/index.js');
```

### 3. Updated AudioSystem.js Import
```javascript
// Before:
const { createFaustNode } = await import('./faust/create-node.js');

// After:
const { createFaustNode } = await import('/audio/chord_synth/create-node.js');
```

## How Vite Handles These Files

- **Files in `public/`**: Served as-is, accessible at root path (`/audio/...`)
- **Files in `src/`**: Bundled and transformed, paths change in production
- **WASM files**: Must be accessible via `fetch()` at runtime, so need to be in `public/`

## Verification Steps

1. **Local Development**:
   ```bash
   npm run dev
   ```
   - Click "Audio: OFF" button
   - Console should show: "FAUST module loaded successfully"
   - NOT: "using fallback synth"

2. **Production Build**:
   ```bash
   npm run build
   npm run preview
   ```
   - Test at http://localhost:4173
   - Same verification as above

3. **Vercel Deployment**:
   - Push to GitHub (triggers auto-deploy)
   - Open deployed URL
   - Check browser console for FAUST success message

## Expected Console Output (Success)

```
FAUST baseUrl: /audio/chord_synth/
Fetching DSP meta from: /audio/chord_synth/dsp-meta.json
FAUST node created successfully: [FaustPolyDspNode object]
FAUST module loaded successfully
AudioSystem initialized successfully
```

## Expected Console Output (Failure)

```
FAUST module not available, using fallback synth: [error message]
```

## Files Modified in This Fix

1. `public/audio/chord_synth/create-node.js` - Created new loader
2. `public/audio/chord_synth/*.wasm` - Copied WASM modules
3. `public/audio/chord_synth/*.json` - Copied metadata
4. `src/audio/AudioSystem.js` - Updated import path
5. Removed: `public/audio/bellsynth/` - Old unused files

## Git Commits

1. `d0086c8` - Fix FAUST loading: Move assets to public/
2. `e013ad1` - Remove unused bellsynth FAUST files

## Why This Matters

- **FAUST**: High-quality polyphonic chord synthesis with 11 chord types
- **Fallback**: Simple Web Audio oscillators (less rich sound)
- **User Experience**: FAUST provides the intended audio experience

## Deployment Checklist

- [x] FAUST files in `public/audio/chord_synth/`
- [x] Absolute path imports from public directory
- [x] Verified in local dev mode
- [x] Verified in production build preview
- [x] Pushed to GitHub
- [ ] Verify on Vercel deployment (user should test)

## If Still Using Fallback After Deploy

1. **Check Network Tab** in browser DevTools:
   - Look for 404 errors on `/audio/chord_synth/*.wasm` or `*.json`
   - If found, files didn't deploy correctly

2. **Check Console** for error messages:
   - CORS errors? (shouldn't happen on same domain)
   - Module loading errors? Check import paths

3. **Verify Vercel Build**:
   - Go to Vercel dashboard → Deployments
   - Click on latest deployment → Functions tab
   - Check build logs for errors
   - Verify `public/` files are included in output

4. **Force Rebuild**:
   ```bash
   git commit --allow-empty -m "Trigger Vercel rebuild"
   git push
   ```

## Additional Notes

- The `src/audio/faust/` directory still contains faustwasm libraries (needed for JS imports)
- Only the compiled WASM modules and create-node.js are in `public/`
- This pattern works for any WASM-based libraries in Vite projects
