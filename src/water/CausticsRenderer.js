import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, vec4, uvec2, uint, int, texture, textureStore,
  storageTexture, instanceIndex, normalize, dot, max, clamp, abs, sin, cos
} from 'three/tsl';

/**
 * GPU-based caustics renderer that generates underwater light patterns
 * by simulating light refraction through the water surface.
 *
 * Simplified approach: Uses the water height field normals to calculate
 * light intensity patterns based on ray convergence/divergence.
 */
export class CausticsRenderer {
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.resolution = options.resolution || 512;
    this.intensity = options.intensity || 0.6;

    // Light direction (pointing down into water)
    this.lightDirection = new THREE.Vector3(-0.3, -1.0, -0.2).normalize();

    // Water properties for refraction
    this.waterIOR = 1.33;
    this.waterDepth = 2.0;  // Distance from water to floor

    // Create output texture for caustics
    this.causticsTexture = new THREE.DataTexture(
      new Float32Array(this.resolution * this.resolution * 4),
      this.resolution,
      this.resolution,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this.causticsTexture.minFilter = THREE.LinearFilter;
    this.causticsTexture.magFilter = THREE.LinearFilter;
    this.causticsTexture.wrapS = THREE.RepeatWrapping;
    this.causticsTexture.wrapT = THREE.RepeatWrapping;
    this.causticsTexture.needsUpdate = true;

    // Storage texture for GPU compute
    this.causticsStorage = new THREE.StorageTexture(this.resolution, this.resolution);
    this.causticsStorage.type = THREE.FloatType;
    this.causticsStorage.format = THREE.RGBAFormat;

    // Height texture reference (set from RippleSimulation)
    this.heightTexture = null;

    // Build compute shader
    this.computeNode = null;
  }

  /**
   * Build the caustics compute shader
   * @param {THREE.StorageTexture} heightTex - Height texture from ripple simulation
   */
  buildComputeNode(heightTex) {
    const res = this.resolution;
    const intensity = this.intensity;
    const waterDepth = this.waterDepth;

    // Light direction components
    const lightX = this.lightDirection.x;
    const lightY = this.lightDirection.y;
    const lightZ = this.lightDirection.z;

    const causticsOutput = this.causticsStorage;

    this.computeNode = Fn(({ heightMap, output }) => {
      const idx = instanceIndex;
      const x = int(idx.mod(uint(res)));
      const y = int(idx.div(uint(res)));

      // UV coordinates
      const u = float(x).div(float(res));
      const v = float(y).div(float(res));
      const uv = vec2(u, v);

      // Sample height texture for normals (B = nx, A = ny)
      const heightSample = texture(heightMap, uv);
      const nx = heightSample.b;
      const ny = heightSample.a;

      // Construct surface normal
      const normal = normalize(vec3(nx, float(1.0), ny));

      // Light direction vector
      const light = normalize(vec3(float(lightX), float(lightY), float(lightZ)));

      // Refract light through water surface (Snell's law simplified)
      const eta = float(1.0).div(float(1.33));  // Air to water
      const cosI = dot(light.negate(), normal);
      const sinT2 = eta.mul(eta).mul(float(1.0).sub(cosI.mul(cosI)));

      // Refracted ray direction (simplified)
      const cosT = float(1.0).sub(sinT2).sqrt();
      const refracted = light.mul(eta).add(normal.mul(eta.mul(cosI).sub(cosT)));

      // Project refracted ray to floor plane
      // Calculate where ray hits floor (at y = -waterDepth)
      const t = float(waterDepth).div(abs(refracted.y).max(0.001));

      // Offset on floor due to refraction
      const offsetX = refracted.x.mul(t);
      const offsetZ = refracted.z.mul(t);

      // Caustic intensity based on ray convergence
      // Sample neighboring points to estimate area change
      const du = float(1.0).div(float(res));
      const dv = float(1.0).div(float(res));

      const h1 = texture(heightMap, uv.add(vec2(du, float(0)))).b;
      const h2 = texture(heightMap, uv.add(vec2(float(0), dv))).b;
      const h3 = texture(heightMap, uv.sub(vec2(du, float(0)))).b;
      const h4 = texture(heightMap, uv.sub(vec2(float(0), dv))).b;

      // Curvature estimate (second derivative of height)
      const curvature = abs(h1.add(h2).add(h3).add(h4).sub(nx.mul(4))).mul(10.0);

      // Caustic intensity: higher curvature = more light concentration
      // Positive curvature (convex) = light focuses (bright)
      // Negative curvature (concave) = light spreads (dark)
      const laplacian = h1.add(h2).add(h3).add(h4).sub(heightSample.r.mul(4));
      const focusFactor = laplacian.mul(50.0);

      // Base intensity with focusing effect
      const causticValue = float(0.3).add(focusFactor).mul(float(intensity));

      // Clamp to reasonable range
      const finalIntensity = clamp(causticValue, 0.0, 2.0);

      // Add some color variation (warm highlights, cool shadows)
      const warmth = finalIntensity.mul(0.1);
      const r = finalIntensity.add(warmth);
      const g = finalIntensity;
      const b = finalIntensity.sub(warmth.mul(0.5));

      // Write caustics to output texture
      textureStore(output, uvec2(uint(x), uint(y)), vec4(r, g, b, float(1.0)));

    })({ heightMap: heightTex, output: causticsOutput }).compute(res * res);
  }

  /**
   * Set the height texture from ripple simulation
   * @param {THREE.Texture} tex
   */
  setHeightTexture(tex) {
    this.heightTexture = tex;
    if (tex) {
      this.buildComputeNode(tex);
    }
  }

  /**
   * Set caustics intensity
   * @param {number} intensity - 0 to 1
   */
  setIntensity(intensity) {
    this.intensity = intensity;
    // Rebuild compute node with new intensity
    if (this.heightTexture) {
      this.buildComputeNode(this.heightTexture);
    }
  }

  /**
   * Set light direction
   * @param {THREE.Vector3} dir
   */
  setLightDirection(dir) {
    this.lightDirection.copy(dir).normalize();
    // Rebuild compute node with new light direction
    if (this.heightTexture) {
      this.buildComputeNode(this.heightTexture);
    }
  }

  /**
   * Set water depth (distance to floor)
   * @param {number} depth
   */
  setWaterDepth(depth) {
    this.waterDepth = Math.abs(depth);
    if (this.heightTexture) {
      this.buildComputeNode(this.heightTexture);
    }
  }

  /**
   * Update caustics texture
   * @param {THREE.WebGPURenderer} renderer
   * @param {THREE.Texture} heightTexture - Optional, uses stored texture if not provided
   */
  update(renderer, heightTexture = null) {
    // Update height texture if provided
    if (heightTexture && heightTexture !== this.heightTexture) {
      this.setHeightTexture(heightTexture);
    }

    // Run compute shader if available
    if (this.computeNode) {
      renderer.compute(this.computeNode);
    }
  }

  /**
   * Get the caustics texture for material application
   * @returns {THREE.StorageTexture}
   */
  getCausticsTexture() {
    return this.causticsStorage;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    if (this.causticsTexture) {
      this.causticsTexture.dispose();
    }
    if (this.causticsStorage) {
      this.causticsStorage.dispose();
    }
  }
}
