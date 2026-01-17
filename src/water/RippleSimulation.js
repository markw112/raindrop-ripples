import * as THREE from 'three/webgpu';

export class RippleSimulation {
  constructor(renderer, resolution = 256) {
    this.renderer = renderer;
    this.resolution = resolution;
    this.waveSpeed = 0.3;
    this.damping = 0.985;
    this.ripples = [];

    // Edge fade configuration - ripples fade out instead of bouncing
    this.edgeFadeWidth = 25;      // Pixels from edge where fade begins
    this.edgeFadeStrength = 0.92; // Extra damping multiplier at edge

    // CPU-based height field simulation
    this.heightCurrent = new Float32Array(resolution * resolution);
    this.heightPrevious = new Float32Array(resolution * resolution);
    this.heightNext = new Float32Array(resolution * resolution);
  }

  async init() {
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
    // Convert world position to texture coordinates
    const lakeSize = 20;
    const u = (x / lakeSize) + 0.5;
    const v = (z / lakeSize) + 0.5;

    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
      this.ripples.push({ u, v, strength });
    }
  }

  update(renderer) {
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

    // Update texture
    const data = this.heightTexture.image.data;
    for (let i = 0; i < res * res; i++) {
      data[i * 4] = this.heightCurrent[i];
      data[i * 4 + 1] = 0;
      data[i * 4 + 2] = 0;
      data[i * 4 + 3] = 1;
    }
    this.heightTexture.needsUpdate = true;
  }

  getHeightTexture() {
    return this.heightTexture;
  }
}
