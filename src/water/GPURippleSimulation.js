import * as THREE from 'three/webgpu';
import { Fn, float, vec4, uvec2, int, uint, If, textureStore, storageTexture, instanceIndex } from 'three/tsl';

/**
 * GPU-accelerated ripple simulation using WebGPU compute shaders.
 * Uses ping-pong textures for wave equation simulation.
 * Data packing: R=height, G=velocity, B=normal.x, A=normal.y
 */
export class GPURippleSimulation {
  constructor(renderer, resolution = 256) {
    this.renderer = renderer;
    this.resolution = resolution;
    this.waveSpeed = 0.3;
    this.damping = 0.995;

    // Pending impacts to inject
    this.pendingImpacts = [];

    // Track which texture is current (for ping-pong)
    this.pingPong = 0;

    // Create ping-pong storage textures
    this.textureA = new THREE.StorageTexture(resolution, resolution);
    this.textureA.type = THREE.FloatType;
    this.textureA.format = THREE.RGBAFormat;
    this.textureA.minFilter = THREE.LinearFilter;
    this.textureA.magFilter = THREE.LinearFilter;

    this.textureB = new THREE.StorageTexture(resolution, resolution);
    this.textureB.type = THREE.FloatType;
    this.textureB.format = THREE.RGBAFormat;
    this.textureB.minFilter = THREE.LinearFilter;
    this.textureB.magFilter = THREE.LinearFilter;

    // Create a readable DataTexture for the material to sample from
    this.outputTexture = new THREE.DataTexture(
      new Float32Array(resolution * resolution * 4),
      resolution,
      resolution,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this.outputTexture.minFilter = THREE.LinearFilter;
    this.outputTexture.magFilter = THREE.LinearFilter;
    this.outputTexture.needsUpdate = true;

    // Build compute nodes
    this.buildComputeNodes();
  }

  buildComputeNodes() {
    const res = this.resolution;
    const waveSpeed = this.waveSpeed;
    const damping = this.damping;

    // Wave simulation compute function
    // Reads from source texture, writes to dest texture
    this.waveSimulationFn = (srcTex, dstTex) => {
      return Fn(({ src, dst }) => {
        const idx = instanceIndex;
        const x = int(idx.mod(uint(res)));
        const y = int(idx.div(uint(res)));

        // Skip boundary pixels
        const isBoundary = x.lessThanEqual(int(0))
          .or(x.greaterThanEqual(int(res - 1)))
          .or(y.lessThanEqual(int(0)))
          .or(y.greaterThanEqual(int(res - 1)));

        If(isBoundary, () => {
          // Write zero at boundaries
          textureStore(dst, uvec2(uint(x), uint(y)), vec4(0, 0, 0, 1));
        }).Else(() => {
          // Sample current and neighbor values
          const current = storageTexture(src, uvec2(uint(x), uint(y))).toReadOnly();
          const left = storageTexture(src, uvec2(uint(x.sub(1)), uint(y))).toReadOnly();
          const right = storageTexture(src, uvec2(uint(x.add(1)), uint(y))).toReadOnly();
          const up = storageTexture(src, uvec2(uint(x), uint(y.sub(1)))).toReadOnly();
          const down = storageTexture(src, uvec2(uint(x), uint(y.add(1)))).toReadOnly();

          // R = height, G = velocity
          const height = current.r;
          const velocity = current.g;

          // Laplacian: sum of neighbors - 4*center
          const laplacian = left.r.add(right.r).add(up.r).add(down.r).sub(height.mul(4));

          // Wave equation: velocity += laplacian * c^2
          const c2 = float(waveSpeed * waveSpeed);
          const newVelocity = velocity.add(laplacian.mul(c2)).mul(float(damping));

          // Update height
          const newHeight = height.add(newVelocity);

          // Calculate normals from height differences
          const nx = left.r.sub(right.r).mul(2);
          const ny = up.r.sub(down.r).mul(2);

          // Store: R=height, G=velocity, B=normal.x, A=normal.y
          textureStore(dst, uvec2(uint(x), uint(y)), vec4(newHeight, newVelocity, nx, ny));
        });

      })({ src: srcTex, dst: dstTex }).compute(res * res);
    };

    // Impact injection compute function
    this.impactFn = (tex, impactX, impactY, impactStrength) => {
      return Fn(({ target, cx, cy, strength }) => {
        const idx = instanceIndex;
        const x = int(idx.mod(uint(res)));
        const y = int(idx.div(uint(res)));

        // Distance from impact center
        const dx = float(x).sub(cx);
        const dy = float(y).sub(cy);
        const dist = dx.mul(dx).add(dy.mul(dy)).sqrt();

        // Radius of impact
        const radius = float(3.0);

        // Only affect pixels within radius
        If(dist.lessThan(radius), () => {
          const current = storageTexture(target, uvec2(uint(x), uint(y))).toReadOnly();

          // Gaussian falloff
          const falloff = float(1.0).sub(dist.div(radius));
          const impulse = strength.mul(falloff).mul(falloff);

          // Add impulse to height
          const newHeight = current.r.add(impulse);

          textureStore(target, uvec2(uint(x), uint(y)), vec4(newHeight, current.g, current.b, current.a));
        });

      })({ target: tex, cx: float(impactX), cy: float(impactY), strength: float(impactStrength) }).compute(res * res);
    };

    // Build the simulation compute nodes for both directions
    this.computeAtoB = this.waveSimulationFn(this.textureA, this.textureB);
    this.computeBtoA = this.waveSimulationFn(this.textureB, this.textureA);
  }

  /**
   * Add a ripple at world position
   * @param {number} x - World X coordinate
   * @param {number} z - World Z coordinate
   * @param {number} strength - Impact strength (0-1)
   */
  addRipple(x, z, strength = 0.5) {
    const lakeSize = 20;
    const u = (x / lakeSize) + 0.5;
    const v = (z / lakeSize) + 0.5;

    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
      this.pendingImpacts.push({
        x: u * this.resolution,
        y: v * this.resolution,
        strength: strength
      });
    }
  }

  /**
   * Run one step of the simulation
   * @param {THREE.WebGPURenderer} renderer
   */
  async update(renderer) {
    // Inject pending impacts into current texture (source for this frame)
    const currentTexture = this.pingPong === 0 ? this.textureA : this.textureB;

    for (const impact of this.pendingImpacts) {
      const impactNode = this.impactFn(currentTexture, impact.x, impact.y, impact.strength);
      renderer.compute(impactNode);
    }
    this.pendingImpacts = [];

    // Run wave simulation (ping-pong)
    // After compute, the destination texture has the new data
    if (this.pingPong === 0) {
      renderer.compute(this.computeAtoB);
      // textureB now has new data
      this._lastComputedTexture = this.textureB;
      this.pingPong = 1;
    } else {
      renderer.compute(this.computeBtoA);
      // textureA now has new data
      this._lastComputedTexture = this.textureA;
      this.pingPong = 0;
    }
  }

  /**
   * Get the current height texture for material sampling
   * Always returns the same texture reference to avoid shader rebuilds
   * @returns {THREE.StorageTexture}
   */
  getHeightTexture() {
    // Return the texture that was last computed (destination of last ping-pong)
    // Use textureA as default/initial value
    return this._lastComputedTexture || this.textureA;
  }

  /**
   * Get the current storage texture (alias for compatibility)
   * @returns {THREE.StorageTexture}
   */
  getStorageTexture() {
    return this.getHeightTexture();
  }

  /**
   * Get current height data for CPU access (e.g., for vertex deformation)
   * Note: This requires GPU readback which is slow - use sparingly
   * @returns {Float32Array}
   */
  getHeightData() {
    // For now, return empty - we'll update the mesh via shader instead
    return new Float32Array(this.resolution * this.resolution);
  }
}
