# Deploying Raindrop Ripples to Vercel

This guide will help you deploy the WebGPU raindrop ripples application to Vercel.

## Prerequisites

- [Git](https://git-scm.com/) installed and configured
- [GitHub account](https://github.com/)
- [Vercel account](https://vercel.com/) (free tier works great)

## Important: WebGPU Browser Support

**⚠️ Note**: This application requires WebGPU support. As of 2026, WebGPU is supported in:
- Chrome/Edge 113+ (desktop)
- Safari 18+ (macOS)
- Firefox (experimental, flag required)

Mobile support is limited. Users without WebGPU will see an error message.

## Deployment Steps

### Option 1: Deploy via Vercel Dashboard (Recommended for First-Time Users)

1. **Initialize Git Repository** (if not already done):
   ```bash
   cd /c/Users/Mark/Documents/raindrop-ripples
   git init
   git add .
   git commit -m "Initial commit: WebGPU raindrop ripples with FAUST audio"
   ```

2. **Create GitHub Repository**:
   - Go to [github.com](https://github.com/new)
   - Create a new repository named `raindrop-ripples`
   - Don't initialize with README (we already have code)

3. **Push to GitHub**:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/raindrop-ripples.git
   git branch -M main
   git push -u origin main
   ```

4. **Deploy on Vercel**:
   - Go to [vercel.com](https://vercel.com/new)
   - Click "Import Project"
   - Select your GitHub repository
   - Vercel will auto-detect Vite configuration
   - Click "Deploy"

### Option 2: Deploy via Vercel CLI

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   cd /c/Users/Mark/Documents/raindrop-ripples
   vercel
   ```

4. **Follow the prompts**:
   - Set up and deploy? **Y**
   - Which scope? (select your account)
   - Link to existing project? **N**
   - What's your project's name? `raindrop-ripples`
   - In which directory is your code located? `./`
   - Want to override the settings? **N**

5. **Deploy to Production**:
   ```bash
   vercel --prod
   ```

## Build Configuration

Vercel will automatically detect the Vite configuration and use these settings:

- **Build Command**: `npm run build` (or `vite build`)
- **Output Directory**: `dist`
- **Install Command**: `npm install`
- **Development Command**: `npm run dev`

The existing [vite.config.js](vite.config.js) is already configured correctly:
- WASM files are included as assets
- Build target is `esnext` (required for WebGPU)

## Required Files (Already Present)

✅ `package.json` - Dependencies and scripts
✅ `vite.config.js` - Vite configuration with WASM support
✅ `index.html` - Entry point
✅ `public/` - Static assets (HDR textures, FAUST modules)

## Environment Variables

This project doesn't require any environment variables for deployment.

## Testing Deployment Locally

Before deploying, test the production build locally:

```bash
npm run build
npm run preview
```

This will:
1. Build the optimized production bundle in `dist/`
2. Start a local preview server
3. Open http://localhost:4173 to test

## Post-Deployment Checklist

After deployment, verify:

- [ ] WebGPU detection works (shows "Raindrop Ripples - WebGPU" or error message)
- [ ] HDR texture loads (check console for errors)
- [ ] Water surface renders with reflections
- [ ] Raindrop particles spawn and fall
- [ ] Ripple simulation creates waves on impact
- [ ] Audio system initializes when "Audio: OFF" button is clicked
- [ ] FAUST chord synth plays on raindrop impacts
- [ ] All UI sliders work (Frequency, Speed, Volume, Chord, Morph, etc.)

## Troubleshooting

### FAUST Module Not Loading

If you see "FAUST module not available, using fallback synth":

1. Check that `public/audio/` contains all FAUST files:
   - `dsp-meta.json`
   - `dsp-module.wasm`
   - `effect-meta.json`
   - `effect-module.wasm`
   - `mixer-module.wasm`

2. Check browser console for 404 errors on WASM files

3. Verify `vite.config.js` includes: `assetsInclude: ['**/*.wasm']`

### WebGPU Not Available

If users see "WebGPU is not supported on this browser":

- This is expected for older browsers or mobile devices
- Provide users with browser upgrade instructions
- Consider adding a fallback WebGL renderer (major refactor)

### HDR Texture Errors

If you see texture dimension errors:

- Ensure HDR files are ≤8192 pixels wide
- Current `overcast.hdr` should work fine
- If using custom HDR, resize using tools like Photoshop or [HDRIHaven tools](https://polyhaven.com/)

### Build Fails

If `npm run build` fails:

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Try building again
npm run build
```

## Custom Domain (Optional)

To add a custom domain after deployment:

1. Go to your project on Vercel dashboard
2. Click "Settings" → "Domains"
3. Add your custom domain
4. Follow Vercel's DNS configuration instructions

## Continuous Deployment

Once connected to GitHub, Vercel will automatically:

- Deploy on every push to `main` branch
- Create preview deployments for pull requests
- Provide unique URLs for each deployment

To trigger a new deployment, just push changes:

```bash
git add .
git commit -m "Update water shader"
git push
```

## Alternative Platforms

If you prefer other platforms, this Vite app works with:

- **Netlify**: Similar to Vercel, auto-detects Vite
- **Cloudflare Pages**: Fast edge deployment
- **GitHub Pages**: Free static hosting (requires base path config)
- **Railway**: Full-stack platform with automatic HTTPS

For most static Vite apps, the deployment steps are similar:
1. Connect to Git repository
2. Set build command: `npm run build`
3. Set output directory: `dist`
4. Deploy

## GitHub Pages Deployment (Alternative)

If you prefer GitHub Pages:

1. **Install gh-pages**:
   ```bash
   npm install --save-dev gh-pages
   ```

2. **Update vite.config.js**:
   ```js
   export default defineConfig({
     base: '/raindrop-ripples/', // Replace with your repo name
     // ... rest of config
   });
   ```

3. **Add deploy script to package.json**:
   ```json
   {
     "scripts": {
       "deploy": "vite build && gh-pages -d dist"
     }
   }
   ```

4. **Deploy**:
   ```bash
   npm run deploy
   ```

5. **Enable GitHub Pages**:
   - Go to repository settings
   - Pages → Source → `gh-pages` branch
   - Save

Your site will be live at: `https://YOUR_USERNAME.github.io/raindrop-ripples/`

## Cost

- **Vercel Free Tier**: Perfect for this project (100 GB bandwidth/month)
- **Netlify Free Tier**: 100 GB bandwidth/month
- **GitHub Pages**: Unlimited for public repos
- **Cloudflare Pages**: Unlimited bandwidth

All platforms offer free tiers suitable for personal projects.

## Support

For platform-specific issues:
- [Vercel Documentation](https://vercel.com/docs)
- [Netlify Documentation](https://docs.netlify.com/)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)
