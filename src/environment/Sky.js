import * as THREE from 'three/webgpu';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

/**
 * Load HDR environment map for realistic reflections.
 * @returns {Promise<THREE.Texture>} Environment texture
 */
export async function loadEnvMap() {
  const loader = new RGBELoader();

  return new Promise((resolve, reject) => {
    loader.load(
      '/textures/overcast.hdr',
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        resolve(texture);
      },
      undefined,
      (error) => {
        console.warn('Failed to load HDR, using fallback:', error);
        // Return null to trigger fallback
        resolve(null);
      }
    );
  });
}

/**
 * Create environment cubemap from the sky for water reflections (fallback).
 * @param {THREE.WebGPURenderer} renderer
 * @param {THREE.Scene} scene
 * @returns {THREE.CubeTexture} Environment cubemap texture
 */
export function createEnvMap(renderer, scene) {
  // Create cube render target for environment map
  const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
    format: THREE.RGBAFormat,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter
  });

  // Create cube camera to capture environment
  const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);
  cubeCamera.position.set(0, 0, 0);

  // Render the scene to cubemap (captures the sky)
  cubeCamera.update(renderer, scene);

  return cubeRenderTarget.texture;
}

export function createSky() {
  // Create a simple gradient sky using a large sphere with vertex colors
  const geometry = new THREE.SphereGeometry(500, 32, 32);

  // Add vertex colors for gradient
  const colors = [];
  const positions = geometry.attributes.position.array;

  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1];
    const normalizedY = (y / 500 + 1) / 2; // 0 at bottom, 1 at top

    // Interpolate between horizon and sky colors
    let r, g, b;
    if (normalizedY < 0.5) {
      // Bottom half: dark blue to horizon
      const t = normalizedY * 2;
      r = 0.1 + t * 0.4;
      g = 0.1 + t * 0.5;
      b = 0.2 + t * 0.5;
    } else {
      // Top half: horizon to sky blue
      const t = (normalizedY - 0.5) * 2;
      r = 0.5 - t * 0.4;
      g = 0.6 - t * 0.2;
      b = 0.7 + t * 0.2;
    }

    colors.push(r, g, b);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    depthWrite: false
  });

  const sky = new THREE.Mesh(geometry, material);

  return sky;
}
