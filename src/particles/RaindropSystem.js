import * as THREE from 'three/webgpu';

export class RaindropSystem {
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.maxParticles = options.maxParticles || 200;
    this.spawnRate = options.spawnRate || 2; // particles per second
    this.spawnArea = options.spawnArea || { x: 18, z: 18 };
    this.spawnHeight = options.spawnHeight || 12;
    this.gravity = options.gravity || -15;

    this.spawnTimer = 0;
    this.impacts = [];
  }

  async init() {
    // Create particle data buffers
    this.createBuffers();

    // Create particle mesh
    this.createMesh();
  }

  createBuffers() {
    // Particle data: position (xyz) + velocity (xyz) + life (w)
    // Using Float32Array for positions/velocities
    this.positions = new Float32Array(this.maxParticles * 3);
    this.velocities = new Float32Array(this.maxParticles * 3);
    this.lifetimes = new Float32Array(this.maxParticles);

    // Initialize particles as inactive (lifetime <= 0)
    for (let i = 0; i < this.maxParticles; i++) {
      this.positions[i * 3] = 0;
      this.positions[i * 3 + 1] = -100; // Below water, inactive
      this.positions[i * 3 + 2] = 0;
      this.velocities[i * 3] = 0;
      this.velocities[i * 3 + 1] = 0;
      this.velocities[i * 3 + 2] = 0;
      this.lifetimes[i] = -1;
    }

    this.nextParticleIndex = 0;
  }

  createMesh() {
    // Create instanced geometry for raindrops
    // Teardrop shape: pointed at top (radiusTop=0), wider at bottom
    const dropGeometry = new THREE.CylinderGeometry(0, 0.03, 0.4, 6);
    // No rotateX - keep cylinder's natural Y-axis orientation
    // Quaternion will align Y-axis to velocity direction

    // Create instanced mesh
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = dropGeometry.index;
    this.geometry.attributes.position = dropGeometry.attributes.position;
    this.geometry.attributes.normal = dropGeometry.attributes.normal;

    // Add instance attributes
    this.instancePositions = new THREE.InstancedBufferAttribute(
      this.positions,
      3
    );
    this.instancePositions.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('instancePosition', this.instancePositions);

    this.instanceLifetimes = new THREE.InstancedBufferAttribute(
      this.lifetimes,
      1
    );
    this.instanceLifetimes.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('instanceLife', this.instanceLifetimes);

    // Glowing material with additive blending for ethereal look
    const material = new THREE.MeshBasicMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false  // Prevent sorting artifacts with additive blending
    });

    // Create instanced mesh
    this.mesh = new THREE.InstancedMesh(
      dropGeometry,
      material,
      this.maxParticles
    );

    // Initialize matrices
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < this.maxParticles; i++) {
      matrix.setPosition(0, -100, 0);
      this.mesh.setMatrixAt(i, matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.frustumCulled = false;
  }

  spawnParticle() {
    const i = this.nextParticleIndex;

    // Random position in spawn area
    const x = (Math.random() - 0.5) * this.spawnArea.x;
    const z = (Math.random() - 0.5) * this.spawnArea.z;
    const y = this.spawnHeight + Math.random() * 2;

    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;

    // Initial velocity (slight random drift)
    this.velocities[i * 3] = (Math.random() - 0.5) * 0.5;
    this.velocities[i * 3 + 1] = -2; // Initial downward velocity
    this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;

    // Reset lifetime
    this.lifetimes[i] = 1.0;

    // Move to next particle slot (circular buffer)
    this.nextParticleIndex = (this.nextParticleIndex + 1) % this.maxParticles;
  }

  update(delta, time) {
    this.impacts = [];

    // Spawn new particles based on spawn rate
    this.spawnTimer += delta;
    const spawnInterval = 1.0 / this.spawnRate;

    while (this.spawnTimer >= spawnInterval) {
      this.spawnParticle();
      this.spawnTimer -= spawnInterval;
    }

    // Update all particles
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    const quaternion = new THREE.Quaternion();

    for (let i = 0; i < this.maxParticles; i++) {
      if (this.lifetimes[i] <= 0) continue;

      // Apply gravity
      this.velocities[i * 3 + 1] += this.gravity * delta;

      // Update position
      this.positions[i * 3] += this.velocities[i * 3] * delta;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * delta;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * delta;

      // Check for water collision (y = 0)
      if (this.positions[i * 3 + 1] <= 0) {
        // Record impact
        this.impacts.push({
          x: this.positions[i * 3],
          z: this.positions[i * 3 + 2],
          strength: Math.min(Math.abs(this.velocities[i * 3 + 1]) * 0.03, 0.8)
        });

        // Deactivate particle
        this.lifetimes[i] = -1;
        this.positions[i * 3 + 1] = -100;
      }

      // Decay lifetime slightly (for fade effect if needed)
      this.lifetimes[i] -= delta * 0.1;

      // Update instance matrix
      position.set(
        this.positions[i * 3],
        this.positions[i * 3 + 1],
        this.positions[i * 3 + 2]
      );

      // Orient along velocity
      const vel = new THREE.Vector3(
        this.velocities[i * 3],
        this.velocities[i * 3 + 1],
        this.velocities[i * 3 + 2]
      );

      if (vel.lengthSq() > 0.01) {
        // Align cylinder's Y-axis (default axis) to velocity direction
        const defaultDir = new THREE.Vector3(0, 1, 0);
        quaternion.setFromUnitVectors(defaultDir, vel.normalize());
      }

      // Scale based on velocity (stretch effect)
      const speed = vel.length();
      scale.set(1, Math.max(1, speed * 0.1), 1);

      matrix.compose(position, quaternion, scale);
      this.mesh.setMatrixAt(i, matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;

    return this.impacts;
  }
}
