import * as THREE from 'three/webgpu';
import {
  vec3, vec4, float, Fn, uniform, texture, uv, normalize, uvec2, uint, int,
  mix, clamp, positionLocal, modelWorldMatrix, floor as tslFloor, storageTexture
} from 'three/tsl';

/**
 * TSL-based water material with advanced refractions and Fresnel.
 * Extends MeshPhysicalNodeMaterial for PBR lighting, adds:
 * - Vertex displacement from height texture
 * - Dynamic normal calculation from height gradients
 * - Enhanced Fresnel for realistic water reflections
 * - Subsurface scattering approximation
 */
/**
 * Create a flat placeholder texture for when no height data is available.
 * Format: RGBA Float32 - R=height(0), G=velocity(0), B=normal.x(0), A=normal.y(0)
 */
function createPlaceholderTexture(resolution = 4) {
  const size = resolution * resolution;
  const data = new Float32Array(size * 4);

  // Initialize with flat water (height=0, velocity=0, normal pointing up)
  for (let i = 0; i < size; i++) {
    data[i * 4 + 0] = 0;  // R: height
    data[i * 4 + 1] = 0;  // G: velocity
    data[i * 4 + 2] = 0;  // B: normal.x
    data[i * 4 + 3] = 0;  // A: normal.y
  }

  const tex = new THREE.DataTexture(
    data,
    resolution,
    resolution,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;

  return tex;
}

export class TSLWaterMaterial extends THREE.MeshPhysicalNodeMaterial {
  constructor(options = {}) {
    super();

    // Water base properties
    this.color = new THREE.Color(0.008, 0.025, 0.05);  // Deep blue
    this.metalness = 0.0;
    this.roughness = 0.02;  // Very smooth for sharp reflections
    this.envMapIntensity = 2.5;
    this.clearcoat = 0.5;
    this.clearcoatRoughness = 0.05;
    this.ior = 1.33;  // Water's index of refraction
    this.transmission = 0.0;  // Set > 0 for transparent water
    this.side = THREE.DoubleSide;
    this.fog = true;

    // Create placeholder texture (required for TSL texture() function)
    this._placeholderTexture = createPlaceholderTexture();

    // Store the actual height texture reference (not wrapped in uniform!)
    // TSL texture() needs direct texture reference
    this._heightTextureRef = this._placeholderTexture;

    // Track if we're using a StorageTexture (GPU mode) vs DataTexture (CPU mode)
    this._isStorageTexture = false;
    this._textureResolution = 256;  // Default resolution for GPU mode

    // Scalar uniforms (these work fine with uniform())
    this.heightScale = uniform(0.5);
    this.normalStrength = uniform(2.0);
    this.lightDirection = uniform(new THREE.Vector3(-0.5, -0.7, -0.5).normalize());
    this.fogColor = uniform(new THREE.Color(0xc04828));
    this.waterDeepColor = uniform(new THREE.Color(0.005, 0.02, 0.04));
    this.waterShallowColor = uniform(new THREE.Color(0.015, 0.06, 0.1));

    // Apply options
    if (options.envMap) this.envMap = options.envMap;
    if (options.envMapIntensity) this.envMapIntensity = options.envMapIntensity;

    // Setup custom vertex and fragment nodes
    this.setupWaterNodes();
  }

  setupWaterNodes() {
    // Build nodes with current texture reference
    this.positionNode = this.createDisplacementNode();
    this.normalNode = this.createNormalNode();

    // Add custom color node for depth-based coloring
    this.colorNode = this.createColorNode();
  }

  createDisplacementNode() {
    const heightTex = this._heightTextureRef;
    const scale = this.heightScale;
    const isStorage = this._isStorageTexture;
    const res = this._textureResolution;

    return Fn(() => {
      const pos = positionLocal.toVar();
      const texCoord = uv();

      // Sample height from texture (R channel)
      // Use different sampling method based on texture type
      let heightSample;
      if (isStorage) {
        // StorageTexture: use storageTexture() with pixel coordinates
        const px = uint(tslFloor(texCoord.x.mul(float(res))));
        const py = uint(tslFloor(texCoord.y.mul(float(res))));
        heightSample = storageTexture(heightTex, uvec2(px, py)).toReadOnly();
      } else {
        // Regular texture: use texture() with UV coordinates
        heightSample = texture(heightTex, texCoord);
      }

      const height = heightSample.r.mul(scale);

      // Displace Z (which becomes Y after rotation)
      pos.z = pos.z.add(height);

      return pos;
    })();
  }

  createNormalNode() {
    const heightTex = this._heightTextureRef;
    const strength = this.normalStrength;
    const isStorage = this._isStorageTexture;
    const res = this._textureResolution;

    return Fn(() => {
      const texCoord = uv();

      // Sample height texture for normal calculation
      let heightSample;
      if (isStorage) {
        // StorageTexture: use storageTexture() with pixel coordinates
        const px = uint(tslFloor(texCoord.x.mul(float(res))));
        const py = uint(tslFloor(texCoord.y.mul(float(res))));
        heightSample = storageTexture(heightTex, uvec2(px, py)).toReadOnly();
      } else {
        // Regular texture: use texture() with UV coordinates
        heightSample = texture(heightTex, texCoord);
      }

      // Get normals from B and A channels (pre-computed in simulation)
      const nx = heightSample.b.mul(strength);
      const ny = heightSample.a.mul(strength);

      // Construct normal (in local space)
      const normal = normalize(vec3(nx, ny, float(1.0)));

      return normal;
    })();
  }

  createColorNode() {
    const shallowColor = this.waterShallowColor;
    const deepColor = this.waterDeepColor;

    return Fn(() => {
      // Depth-based color gradient (distance from center)
      const worldPos = modelWorldMatrix.mul(vec4(positionLocal, 1.0)).xyz;
      const depth = worldPos.xz.length().mul(0.03);

      // Mix between shallow and deep colors
      const waterColor = mix(shallowColor, deepColor, clamp(depth, 0.0, 1.0));

      return vec4(waterColor, 1.0);
    })();
  }

  /**
   * Set the height texture from the ripple simulation
   * Rebuilds shader nodes since TSL texture() needs direct reference
   * @param {THREE.Texture} tex
   */
  setHeightTexture(tex) {
    if (tex && tex !== this._heightTextureRef) {
      this._heightTextureRef = tex;

      // Detect if this is a StorageTexture (GPU mode) vs regular texture (CPU mode)
      this._isStorageTexture = tex.isStorageTexture === true;

      // Get texture resolution for pixel coordinate conversion
      if (tex.image) {
        this._textureResolution = tex.image.width || 256;
      } else if (tex.isStorageTexture) {
        // StorageTextures store size differently
        this._textureResolution = tex.image?.width || 256;
      }

      // Rebuild nodes with new texture
      this.setupWaterNodes();
      this.needsUpdate = true;
    }
  }

  /**
   * Set the height displacement scale
   * @param {number} scale
   */
  setHeightScale(scale) {
    this.heightScale.value = scale;
  }

  /**
   * Set the normal strength for wave normals
   * @param {number} strength
   */
  setNormalStrength(strength) {
    this.normalStrength.value = strength;
  }

  /**
   * Set the light direction for specular calculations
   * @param {THREE.Vector3} dir
   */
  setLightDirection(dir) {
    this.lightDirection.value.copy(dir).normalize();
  }

  /**
   * Set environment map for reflections
   * @param {THREE.Texture} envMap
   */
  setEnvMap(envMap) {
    this.envMap = envMap;
    this.needsUpdate = true;
  }
}

/**
 * Create a simple water material without height displacement
 * (for use when GPU simulation is not available)
 */
export function createSimpleWaterMaterial(options = {}) {
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.008, 0.025, 0.05),
    metalness: 0.0,
    roughness: 0.03,
    envMapIntensity: options.envMapIntensity || 2.0,
    clearcoat: 0.4,
    clearcoatRoughness: 0.08,
    ior: 1.33,
    reflectivity: 0.95,
    side: THREE.DoubleSide,
    fog: true
  });

  if (options.envMap) {
    material.envMap = options.envMap;
  }

  return material;
}
