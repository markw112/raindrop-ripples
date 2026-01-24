import * as THREE from 'three/webgpu';

/**
 * Natural floor surface beneath the water for caustics to project onto.
 * Can be styled as sand, moss, stone, etc.
 */
export class FloorSurface {
  constructor(options = {}) {
    this.size = options.size || 25;
    this.depth = options.depth || -2;  // How far below water (y = 0)
    this.segments = options.segments || 64;

    // Floor style: 'sand', 'moss', 'stone'
    this.style = options.style || 'sand';

    // Caustics texture (set from CausticsRenderer)
    this.causticsTexture = null;
    this.causticsIntensity = options.causticsIntensity || 0.5;

    this.createGeometry();
    this.createMaterial();

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = this.depth;
    this.mesh.receiveShadow = true;
  }

  createGeometry() {
    this.geometry = new THREE.PlaneGeometry(
      this.size,
      this.size,
      this.segments,
      this.segments
    );

    // Add subtle procedural displacement for organic feel
    const positions = this.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      // Simple noise-like displacement
      const noise = Math.sin(x * 0.5) * Math.cos(y * 0.5) * 0.1 +
                    Math.sin(x * 1.2 + 0.5) * Math.cos(y * 0.8 - 0.3) * 0.05;
      positions[i + 2] = noise;
    }
    this.geometry.computeVertexNormals();
  }

  createMaterial() {
    // Color palettes for different floor styles
    const styles = {
      sand: {
        color: new THREE.Color(0.6, 0.5, 0.35),
        roughness: 0.9,
        metalness: 0.0
      },
      moss: {
        color: new THREE.Color(0.15, 0.3, 0.12),
        roughness: 0.85,
        metalness: 0.0
      },
      stone: {
        color: new THREE.Color(0.35, 0.35, 0.38),
        roughness: 0.7,
        metalness: 0.1
      }
    };

    const styleConfig = styles[this.style] || styles.sand;

    // Apply underwater tinting (things look blue-green underwater)
    const underwaterTint = new THREE.Color(0.6, 0.8, 0.9);
    styleConfig.color.multiply(underwaterTint);

    // Darken due to depth
    const depthDarkening = 0.4;
    styleConfig.color.multiplyScalar(depthDarkening);

    this.material = new THREE.MeshStandardMaterial({
      color: styleConfig.color,
      roughness: styleConfig.roughness,
      metalness: styleConfig.metalness,
      side: THREE.FrontSide,
      fog: true
    });
  }

  /**
   * Set the caustics texture from CausticsRenderer
   * @param {THREE.Texture} tex
   */
  setCausticsTexture(tex) {
    this.causticsTexture = tex;

    // Apply caustics as emissive map for additive blending effect
    if (this.material) {
      this.material.emissiveMap = tex;
      this.material.emissive = new THREE.Color(1, 1, 1);
      this.material.emissiveIntensity = this.causticsIntensity;
      this.material.needsUpdate = true;
    }
  }

  /**
   * Set the caustics intensity (0-1)
   * @param {number} intensity
   */
  setCausticsIntensity(intensity) {
    this.causticsIntensity = intensity;
    if (this.material) {
      this.material.emissiveIntensity = intensity;
    }
  }

  /**
   * Change the floor style
   * @param {string} style - 'sand', 'moss', or 'stone'
   */
  setStyle(style) {
    if (this.style !== style) {
      this.style = style;
      const oldCaustics = this.causticsTexture;
      const oldIntensity = this.causticsIntensity;

      this.createMaterial();
      this.mesh.material = this.material;

      // Restore caustics
      if (oldCaustics) {
        this.setCausticsTexture(oldCaustics);
        this.setCausticsIntensity(oldIntensity);
      }
    }
  }

  /**
   * Set the depth below water surface
   * @param {number} depth - Negative value (e.g., -2)
   */
  setDepth(depth) {
    this.depth = depth;
    this.mesh.position.y = depth;
  }

  /**
   * Set environment map for reflections (if any)
   * @param {THREE.Texture} envMap
   */
  setEnvMap(envMap) {
    if (this.material) {
      this.material.envMap = envMap;
      this.material.envMapIntensity = 0.2;  // Subtle underwater reflections
      this.material.needsUpdate = true;
    }
  }

  /**
   * Update method (for any animated effects)
   * @param {number} time
   */
  update(time) {
    // Floor is static for now, but could add animated moss/seaweed later
  }
}
