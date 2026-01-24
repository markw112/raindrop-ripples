import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LakeSurface } from './water/LakeSurface.js';
import { RippleSimulation } from './water/RippleSimulation.js';
import { RaindropSystem } from './particles/RaindropSystem.js';
import { createSky, createEnvMap, loadEnvMap } from './environment/Sky.js';
import { AudioSystem } from './audio/AudioSystem.js';
import { FloorSurface } from './environment/FloorSurface.js';
import { CausticsRenderer } from './water/CausticsRenderer.js';

class App {
  constructor() {
    this.clock = new THREE.Clock();
    this.audioSystem = new AudioSystem();
    this.init().catch(err => {
      console.error('Initialization error:', err);
      document.getElementById('error').style.display = 'block';
      document.getElementById('error').textContent = 'Error: ' + err.message;
    });
  }

  async init() {
    console.log('Starting initialization...');

    // Check WebGPU support
    if (!navigator.gpu) {
      document.getElementById('error').style.display = 'block';
      document.getElementById('info').style.display = 'none';
      console.error('WebGPU not supported');
      return;
    }
    console.log('WebGPU supported');

    // Create scene
    this.scene = new THREE.Scene();
    // Dramatic dusk - deep orange-red sky
    this.scene.background = new THREE.Color(0xe85a30);

    // Add fog for infinite water horizon effect
    // Using FogExp2 for exponential density falloff - slightly darker for dusk
    this.scene.fog = new THREE.FogExp2(0xc04828, 0.035);

    // Create camera - fixed 45-degree overhead angle
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      200  // Reduced to match fog distance
    );
    this.camera.position.set(0, 15, 15);
    this.camera.lookAt(0, 0, 0);

    // Create WebGPU renderer
    this.renderer = new THREE.WebGPURenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    document.body.appendChild(this.renderer.domElement);

    // Initialize renderer
    console.log('Initializing WebGPU renderer...');
    await this.renderer.init();
    console.log('WebGPU renderer initialized');

    // Add orbit controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2.2;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 50;
    this.controls.target.set(0, 0, 0);

    // Add lighting
    this.setupLighting();
    console.log('Lighting setup complete');

    // Create ripple simulation
    console.log('Creating ripple simulation...');
    this.rippleSimulation = new RippleSimulation(this.renderer, 128);
    await this.rippleSimulation.init();
    console.log('Ripple simulation created');

    // Load HDR environment map for realistic reflections
    console.log('Loading environment map...');
    this.envMap = await loadEnvMap();
    if (this.envMap) {
      // Use HDR for reflections only, set solid color background for fog to work
      this.scene.environment = this.envMap;
      // Background must match fog color for proper fog blending
      this.scene.background = new THREE.Color(0xe85a30);
      console.log('HDR environment map loaded');
    } else {
      // Fallback: add procedural sky and capture it
      console.log('Using fallback sky...');
      this.sky = createSky();
      this.scene.add(this.sky);
      this.envMap = createEnvMap(this.renderer, this.scene);
      this.scene.background = new THREE.Color(0xe85a30);
    }

    // Create lake surface
    console.log('Creating lake surface...');
    this.lake = new LakeSurface(20, 128, this.rippleSimulation);
    this.lake.setEnvMap(this.envMap);
    this.lake.setLightDirection(this.sunDirection);
    this.scene.add(this.lake.mesh);
    this.scene.add(this.lake.outerMesh);  // Add extended water for infinite horizon
    console.log('Lake surface created');

    // Create floor surface for caustics
    console.log('Creating floor surface...');
    this.floor = new FloorSurface({
      size: 25,
      depth: -2,
      style: 'sand',
      causticsIntensity: 0.5
    });
    this.floor.setEnvMap(this.envMap);
    this.scene.add(this.floor.mesh);
    console.log('Floor surface created');

    // Create caustics renderer (only if GPU mode is active)
    if (this.rippleSimulation.isGPUMode && this.rippleSimulation.isGPUMode()) {
      console.log('Creating caustics renderer...');
      this.causticsRenderer = new CausticsRenderer(this.renderer, {
        resolution: 512,
        intensity: 0.6
      });
      this.causticsRenderer.setLightDirection(this.sunDirection);
      this.causticsRenderer.setWaterDepth(2.0);
      // Connect height texture
      const heightTex = this.rippleSimulation.getHeightTexture();
      if (heightTex) {
        this.causticsRenderer.setHeightTexture(heightTex);
        // Connect caustics to floor
        this.floor.setCausticsTexture(this.causticsRenderer.getCausticsTexture());
      }
      console.log('Caustics renderer created');
    } else {
      this.causticsRenderer = null;
      console.log('Caustics disabled (CPU mode)');
    }

    // Create raindrop particle system
    console.log('Creating raindrop system...');
    this.raindrops = new RaindropSystem(this.renderer, {
      maxParticles: 200,
      spawnRate: 2,
      spawnArea: { x: 18, z: 18 },
      spawnHeight: 12,
      gravity: -15
    });
    await this.raindrops.init();
    this.scene.add(this.raindrops.mesh);
    console.log('Raindrop system created');

    // Handle resize
    window.addEventListener('resize', () => this.onResize());

    // Setup settings controls
    this.setupSettings();

    // Setup audio controls
    this.setupAudioControls();

    // Update info
    document.getElementById('info').textContent = 'Raindrop Ripples - WebGPU';

    console.log('Starting animation loop...');
    // Start animation loop
    this.animate();
  }

  setupSettings() {
    const frequencySlider = document.getElementById('frequency');
    const frequencyValue = document.getElementById('frequency-value');
    const speedSlider = document.getElementById('speed');
    const speedValue = document.getElementById('speed-value');

    // Frequency control
    frequencySlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.raindrops.spawnRate = value;
      frequencyValue.textContent = `${value}/s`;
    });

    // Speed control (affects gravity)
    speedSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.raindrops.gravity = -value;
      speedValue.textContent = value;
    });

    // Setup visual controls
    this.setupVisualControls();
  }

  setupVisualControls() {
    // Caustics intensity control
    const causticsSlider = document.getElementById('caustics');
    const causticsValue = document.getElementById('caustics-value');
    if (causticsSlider) {
      causticsSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (this.causticsRenderer) {
          this.causticsRenderer.setIntensity(value);
        }
        if (this.floor) {
          this.floor.setCausticsIntensity(value);
        }
        causticsValue.textContent = Math.round(value * 100) + '%';
      });
    }

    // Floor style control
    const floorNames = ['Sand', 'Moss', 'Stone'];
    const floorStyleSlider = document.getElementById('floor-style');
    const floorValue = document.getElementById('floor-value');
    if (floorStyleSlider) {
      floorStyleSlider.addEventListener('input', (e) => {
        const idx = parseInt(e.target.value);
        const styles = ['sand', 'moss', 'stone'];
        if (this.floor) {
          this.floor.setStyle(styles[idx]);
        }
        floorValue.textContent = floorNames[idx];
      });
    }

    // Floor depth control
    const depthSlider = document.getElementById('floor-depth');
    const depthValue = document.getElementById('depth-value');
    if (depthSlider) {
      depthSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (this.floor) {
          this.floor.setDepth(-value);
        }
        if (this.causticsRenderer) {
          this.causticsRenderer.setWaterDepth(value);
        }
        depthValue.textContent = value.toFixed(1);
      });
    }
  }

  setupAudioControls() {
    const audioToggle = document.getElementById('audio-toggle');
    const volumeSlider = document.getElementById('volume');
    const volumeValue = document.getElementById('volume-value');
    const brightnessSlider = document.getElementById('audio-brightness');
    const brightnessValue = document.getElementById('brightness-value');
    const decaySlider = document.getElementById('decay');
    const decayValue = document.getElementById('decay-value');

    // Audio enable button (requires user gesture)
    audioToggle.addEventListener('click', async () => {
      if (!this.audioSystem.isInitialized) {
        audioToggle.textContent = 'Initializing...';
        const success = await this.audioSystem.init();
        if (success) {
          this.audioSystem.setEnabled(true);
          audioToggle.textContent = 'Audio: ON';
          audioToggle.classList.add('active');
        } else {
          audioToggle.textContent = 'Audio Failed';
        }
      } else {
        const enabled = !this.audioSystem.isEnabled;
        this.audioSystem.setEnabled(enabled);
        audioToggle.textContent = enabled ? 'Audio: ON' : 'Audio: OFF';
        audioToggle.classList.toggle('active', enabled);
      }
    });

    // Volume control
    volumeSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.audioSystem.setMasterGain(value);
      volumeValue.textContent = Math.round(value * 100) + '%';
    });

    // Scale selection control
    const scaleNames = ['Pentatonic', 'Major', 'Minor', 'Dorian', 'Whole Tone', 'Chromatic'];
    const scaleSlider = document.getElementById('scale');
    const scaleValue = document.getElementById('scale-value');
    scaleSlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      this.audioSystem.setScale(value);
      scaleValue.textContent = scaleNames[value];
    });

    // Filter cutoff control
    const cutoffSlider = document.getElementById('filter-cutoff');
    const cutoffValue = document.getElementById('cutoff-value');
    cutoffSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.audioSystem.setFilterCutoff(value);
      cutoffValue.textContent = value + ' Hz';
    });

    // Morph control
    const morphSlider = document.getElementById('morph');
    const morphValue = document.getElementById('morph-value');
    morphSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.audioSystem.setMorph(value);
      morphValue.textContent = Math.round(value * 100) + '%';
    });

    // Brightness control
    brightnessSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.audioSystem.setBrightness(value);
      brightnessValue.textContent = Math.round(value * 100) + '%';
    });

    // Decay control
    decaySlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.audioSystem.setDecayTime(value);
      decayValue.textContent = value.toFixed(1) + 's';
    });

    // Reverb control
    const reverbSlider = document.getElementById('reverb');
    const reverbValue = document.getElementById('reverb-value');
    reverbSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.audioSystem.setReverbMix(value);
      reverbValue.textContent = Math.round(value * 100) + '%';
    });

    // Delay control
    const delaySlider = document.getElementById('delay');
    const delayValue = document.getElementById('delay-value');
    delaySlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.audioSystem.setDelayMix(value);
      delayValue.textContent = Math.round(value * 100) + '%';
    });

    // Attack time control
    const attackSlider = document.getElementById('attack');
    const attackValue = document.getElementById('attack-value');
    attackSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.audioSystem.setAttackTime(value);
      attackValue.textContent = Math.round(value * 1000) + 'ms';
    });
  }

  setupLighting() {
    // Ambient light - purple-tinted for dusk atmosphere
    const ambient = new THREE.AmbientLight(0x553344, 0.5);
    this.scene.add(ambient);

    // Main directional light (sun) - warm orange, lower position for dusk
    this.sun = new THREE.DirectionalLight(0xffaa66, 1.8);
    this.sun.position.set(15, 8, 10);
    this.scene.add(this.sun);

    // Store normalized light direction (pointing FROM sun TO scene)
    this.sunDirection = new THREE.Vector3()
      .copy(this.sun.position)
      .normalize()
      .negate();

    // Fill light - purple complement for dusk
    const fill = new THREE.DirectionalLight(0x442266, 0.4);
    fill.position.set(-5, 10, -5);
    this.scene.add(fill);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = this.clock.getDelta();
    const time = this.clock.getElapsedTime();

    // Update controls
    this.controls.update();

    // Update raindrops and get impact positions
    const impacts = this.raindrops.update(delta, time);

    // Add ripples at impact positions
    for (const impact of impacts) {
      this.rippleSimulation.addRipple(impact.x, impact.z, impact.strength);
    }

    // Trigger audio for impacts
    this.audioSystem.processImpacts(impacts);

    // Update ripple simulation
    this.rippleSimulation.update(this.renderer);

    // Update caustics (if available)
    if (this.causticsRenderer) {
      const heightTex = this.rippleSimulation.getHeightTexture();
      this.causticsRenderer.update(this.renderer, heightTex);
    }

    // Update lake mesh
    this.lake.update(time);

    // Update floor
    if (this.floor) {
      this.floor.update(time);
    }

    // Render
    this.renderer.render(this.scene, this.camera);
  }
}

// Start the app
new App();
