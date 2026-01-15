import * as THREE from 'three/webgpu';

export class LakeSurface {
  constructor(size = 20, segments = 128, rippleSimulation = null) {
    this.size = size;
    this.segments = segments;
    this.rippleSimulation = rippleSimulation;

    this.createGeometry();
    this.createMaterial();
    this.createOuterWater();

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;
  }

  createOuterWater() {
    // Extended water plane for infinite horizon effect
    // Must be large enough that edges are fully hidden by fog (fog far = 60)
    const outerGeometry = new THREE.PlaneGeometry(500, 500, 16, 16);
    this.outerMesh = new THREE.Mesh(outerGeometry, this.material);
    this.outerMesh.rotation.x = -Math.PI / 2;
    this.outerMesh.position.y = -0.01; // Prevent z-fighting with inner plane
    this.outerMesh.receiveShadow = true;
  }

  createGeometry() {
    this.geometry = new THREE.PlaneGeometry(
      this.size,
      this.size,
      this.segments,
      this.segments
    );

    // Store original positions for displacement
    const positions = this.geometry.attributes.position.array;
    this.originalPositions = new Float32Array(positions.length);
    this.originalPositions.set(positions);
  }

  createMaterial() {
    // WebTide-inspired water using MeshPhysicalMaterial (WebGPU compatible)
    // Dark blue-green water color matching WebTide's vec3(0.01, 0.06, 0.1)
    this.material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0.01, 0.06, 0.1),
      metalness: 0.0,
      roughness: 0.05,        // Very smooth for sharp reflections
      envMapIntensity: 1.5,   // Strong environment reflections
      clearcoat: 0.3,         // Subtle clearcoat for extra gloss
      clearcoatRoughness: 0.1,
      ior: 1.33,              // Water index of refraction
      reflectivity: 0.9,      // High reflectivity for Fresnel-like effect
      side: THREE.DoubleSide,
      fog: true               // Explicitly enable fog on this material
    });
  }

  /**
   * Set environment map for reflections.
   * @param {THREE.Texture} envMap
   */
  setEnvMap(envMap) {
    this.material.envMap = envMap;
    this.material.needsUpdate = true;
  }

  /**
   * Set light direction for specular highlights.
   * @param {THREE.Vector3} direction
   */
  setLightDirection(direction) {
    // MeshPhysicalMaterial uses scene lights, so we just store this for reference
    this.lightDirection = direction;
  }

  update(time) {
    if (!this.rippleSimulation) return;

    const heightData = this.rippleSimulation.heightCurrent;
    const res = this.rippleSimulation.resolution;
    const positions = this.geometry.attributes.position.array;
    const normals = this.geometry.attributes.normal.array;

    // Update vertex positions based on height field
    for (let i = 0; i < this.segments + 1; i++) {
      for (let j = 0; j < this.segments + 1; j++) {
        const vertexIndex = i * (this.segments + 1) + j;

        // Map vertex to height field
        const u = j / this.segments;
        const v = i / this.segments;

        const hx = Math.floor(u * (res - 1));
        const hy = Math.floor(v * (res - 1));
        const heightIndex = hy * res + hx;

        const height = heightData[heightIndex] || 0;

        // Update Z position (which is Y in world space after rotation)
        positions[vertexIndex * 3 + 2] = height * 0.5;

        // Calculate normal from neighboring heights
        const hL = heightData[hy * res + Math.max(0, hx - 1)] || 0;
        const hR = heightData[hy * res + Math.min(res - 1, hx + 1)] || 0;
        const hU = heightData[Math.max(0, hy - 1) * res + hx] || 0;
        const hD = heightData[Math.min(res - 1, hy + 1) * res + hx] || 0;

        const nx = (hL - hR) * 2;
        const ny = (hU - hD) * 2;
        const nz = 1;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

        normals[vertexIndex * 3] = nx / len;
        normals[vertexIndex * 3 + 1] = ny / len;
        normals[vertexIndex * 3 + 2] = nz / len;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
  }
}
