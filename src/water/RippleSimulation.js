import * as THREE from 'three/webgpu';
import { GPURippleSimulation } from './GPURippleSimulation.js';

export class RippleSimulation {
  constructor(renderer, resolution = 256, preferGPU = true) {
    this.renderer = renderer;
    this.resolution = resolution;
    this.waveSpeed = 0.3;
    this.damping = 0.985;
    this.ripples = [];
    this.preferGPU = preferGPU;
    this.useGPU = false;
    this.gpuSimulation = null;

    // Edge fade configuration - ripples fade out instead of bouncing
    this.edgeFadeWidth = 25;      // Pixels from edge where fade begins
    this.edgeFadeStrength = 0.92; // Extra damping multiplier at edge

    // CPU-based height field simulation
    this.heightCurrent = new Float32Array(resolution * resolution);
    this.heightPrevious = new Float32Array(resolution * resolution);
    this.heightNext = new Float32Array(resolution * resolution);
  }

  /**
   * Check if WebGPU compute shaders are supported
   */
  async checkGPUSupport() {
    if (!navigator.gpu) return false;
    if (!this.renderer.isWebGPURenderer) return false;

    try {
      const adapter = await navigator.gpu.requestAdapter();
      return adapter !== null;
    } catch (e) {
      console.warn('WebGPU compute check failed:', e);
      return false;
    }
  }

  async init() {
    // Check GPU support and initialize appropriate simulation
    if (this.preferGPU) {
      const gpuSupported = await this.checkGPUSupport();
      if (gpuSupported) {
        try {
          this.gpuSimulation = new GPURippleSimulation(this.renderer, this.resolution);
          this.useGPU = true;
          console.log('Using GPU-accelerated ripple simulation');
        } catch (e) {
          console.warn('Failed to initialize GPU simulation, falling back to CPU:', e);
          this.useGPU = false;
        }
      } else {
        console.log('WebGPU compute not supported, using CPU simulation');
      }
    }

    // TEMPORARY: Force CPU mode for debugging TSL material issues
    // TODO: Remove this once TSL StorageTexture sampling is fixed
    if (this.useGPU) {
      console.log('DEBUG: Forcing CPU simulation mode (GPU disabled for testing)');
      this.useGPU = false;
      this.gpuSimulation = null;
    }

    if (!this.useGPU) {
      console.log('Using CPU-based ripple simulation');
    }
    const res = this.resolution;

    // Create data texture for height field
    this.heightTexture = new THREE.DataTexture(
      new Float32Array(res * res * 4),
      res,
      res,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this.heightTexture.minFilter = THREE.LinearFilter;
    this.heightTexture.magFilter = THREE.LinearFilter;
    this.heightTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.heightTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.heightTexture.needsUpdate = true;
  }

  /**
   * Calculate distance from nearest edge, normalized 0-1.
   * 0 = at edge, 1 = inside safe zone (no extra damping)
   */
  getEdgeFactor(x, y, res) {
    const minDist = Math.min(x, res - 1 - x, y, res - 1 - y);
    if (minDist >= this.edgeFadeWidth) return 1.0;
    // Smoothstep for gradual transition
    const t = minDist / this.edgeFadeWidth;
    return t * t * (3 - 2 * t);
  }

  addRipple(x, z, strength = 0.5) {
    // Delegate to GPU simulation if available
    if (this.useGPU && this.gpuSimulation) {
      this.gpuSimulation.addRipple(x, z, strength);
      return;
    }

    // CPU fallback: Convert world position to texture coordinates
    const lakeSize = 20;
    const u = (x / lakeSize) + 0.5;
    const v = (z / lakeSize) + 0.5;

    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
      this.ripples.push({ u, v, strength });
    }
  }

  update(renderer) {
    // Delegate to GPU simulation if available
    if (this.useGPU && this.gpuSimulation) {
      this.gpuSimulation.update(renderer);
      return;
    }

    // CPU fallback simulation
    const res = this.resolution;

    // Inject pending ripples
    for (const ripple of this.ripples) {
      const cx = Math.floor(ripple.u * res);
      const cy = Math.floor(ripple.v * res);
      const radius = 3;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const px = cx + dx;
          const py = cy + dy;

          if (px >= 0 && px < res && py >= 0 && py < res) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= radius) {
              const falloff = 1 - (dist / radius);
              const idx = py * res + px;
              this.heightCurrent[idx] += ripple.strength * falloff * falloff;
            }
          }
        }
      }
    }
    this.ripples = [];

    // Wave equation simulation
    const c2 = this.waveSpeed * this.waveSpeed;

    for (let y = 1; y < res - 1; y++) {
      for (let x = 1; x < res - 1; x++) {
        const idx = y * res + x;

        // Get neighbors
        const current = this.heightCurrent[idx];
        const previous = this.heightPrevious[idx];
        const left = this.heightCurrent[idx - 1];
        const right = this.heightCurrent[idx + 1];
        const up = this.heightCurrent[idx - res];
        const down = this.heightCurrent[idx + res];

        // Laplacian
        const laplacian = left + right + up + down - 4 * current;

        // Wave equation
        let newHeight = 2 * current - previous + c2 * laplacian;

        // Damping
        newHeight *= this.damping;

        // Edge absorption - fade out near boundaries instead of bouncing
        const edgeFactor = this.getEdgeFactor(x, y, res);
        if (edgeFactor < 1.0) {
          const absorption = this.edgeFadeStrength + (1 - this.edgeFadeStrength) * edgeFactor;
          newHeight *= absorption;
        }

        this.heightNext[idx] = newHeight;
      }
    }

    // Swap buffers
    const temp = this.heightPrevious;
    this.heightPrevious = this.heightCurrent;
    this.heightCurrent = this.heightNext;
    this.heightNext = temp;

    // Update texture with height and normals
    // Format: R=height, G=velocity(unused), B=normal.x, A=normal.y
    const data = this.heightTexture.image.data;
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const i = y * res + x;

        // Height
        data[i * 4] = this.heightCurrent[i];

        // Calculate normals from height differences
        const hL = x > 0 ? this.heightCurrent[i - 1] : this.heightCurrent[i];
        const hR = x < res - 1 ? this.heightCurrent[i + 1] : this.heightCurrent[i];
        const hU = y > 0 ? this.heightCurrent[i - res] : this.heightCurrent[i];
        const hD = y < res - 1 ? this.heightCurrent[i + res] : this.heightCurrent[i];

        const nx = (hL - hR) * 2;
        const ny = (hU - hD) * 2;

        data[i * 4 + 1] = 0;   // G: velocity (unused)
        data[i * 4 + 2] = nx;  // B: normal.x
        data[i * 4 + 3] = ny;  // A: normal.y
      }
    }
    this.heightTexture.needsUpdate = true;
  }

  getHeightTexture() {
    if (this.useGPU && this.gpuSimulation) {
      return this.gpuSimulation.getHeightTexture();
    }
    return this.heightTexture;
  }

  /**
   * Check if GPU simulation is active
   */
  isGPUMode() {
    return this.useGPU;
  }

  /**
   * Get current height data for CPU access (for LakeSurface vertex deformation)
   * Returns the CPU height array or empty array if in GPU mode
   */
  getHeightData() {
    if (this.useGPU) {
      // In GPU mode, we don't have CPU access to height data
      // The mesh deformation will be done via shader instead
      return null;
    }
    return this.heightCurrent;
  }
}
