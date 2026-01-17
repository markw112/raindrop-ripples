import * as THREE from 'three/webgpu';

/**
 * Enhanced water shader material for dramatic dusk atmosphere.
 * Features: Depth-based color, subsurface scattering, Fresnel reflections,
 * sharp specular highlights, horizon rim glow.
 */

const waterVertexShader = `
  varying vec3 vNormalW;
  varying vec3 vPositionW;

  void main() {
    vNormalW = normalize(normalMatrix * normal);
    vPositionW = (modelMatrix * vec4(position, 1.0)).xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const waterFragmentShader = `
  precision highp float;

  varying vec3 vNormalW;
  varying vec3 vPositionW;

  uniform vec3 cameraPosition;
  uniform vec3 lightDirection;
  uniform samplerCube envMap;
  uniform float envMapIntensity;
  uniform vec3 fogColor;
  uniform float time;

  // Subsurface scattering approximation - light passing through water
  vec3 subsurfaceScatter(vec3 L, vec3 V, vec3 N) {
    // Forward scattering when looking toward the light
    float scatter = pow(max(0.0, dot(V, -L)), 3.0) * 0.2;
    // Teal-ish subsurface color
    return vec3(0.05, 0.15, 0.2) * scatter;
  }

  void main() {
    vec3 normal = normalize(vNormalW);

    // View direction
    vec3 viewRayW = normalize(vPositionW - cameraPosition);

    // Enhanced Fresnel - more dramatic at grazing angles
    float fresnel = 0.08 + 0.92 * pow(1.0 - max(0.0, dot(-viewRayW, normal)), 4.0);

    // Depth-based color (distance from center creates depth gradient)
    float depth = length(vPositionW.xz) * 0.03;
    vec3 shallowColor = vec3(0.015, 0.06, 0.1);   // Lighter near center
    vec3 deepColor = vec3(0.005, 0.02, 0.04);     // Darker at edges
    vec3 waterColor = mix(shallowColor, deepColor, clamp(depth, 0.0, 1.0));

    // Diffuse lighting with depth
    float ndl = max(0.0, dot(normal, -lightDirection));
    vec3 diffuseColor = waterColor * (0.2 + 0.8 * ndl);

    // Add subsurface scattering
    diffuseColor += subsurfaceScatter(lightDirection, -viewRayW, normal);

    // Environment reflection
    vec3 viewRayReflectedW = reflect(viewRayW, normal);
    vec3 reflectedColor = textureCube(envMap, viewRayReflectedW).rgb * envMapIntensity;

    // Sharp specular highlight (sun glints)
    vec3 reflectDir = reflect(-lightDirection, normal);
    float spec1 = pow(max(0.0, dot(reflectDir, -viewRayW)), 512.0) * 100.0;
    // Secondary softer specular for realism
    float spec2 = pow(max(0.0, dot(reflectDir, -viewRayW)), 64.0) * 3.0;

    // Combine: blend between water color and reflection based on fresnel
    vec3 finalColor = mix(diffuseColor, reflectedColor, fresnel);
    finalColor += vec3(spec1 + spec2);

    // Horizon rim glow - adds warm glow at horizon
    float rim = pow(1.0 - max(0.0, dot(-viewRayW, vec3(0.0, 1.0, 0.0))), 4.0);
    finalColor += fogColor * rim * 0.15;

    // Tone mapping to prevent blown highlights
    finalColor = finalColor / (finalColor + vec3(1.0));

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export class WaterMaterial extends THREE.ShaderMaterial {
  constructor(options = {}) {
    const lightDir = options.lightDirection || new THREE.Vector3(-0.5, -0.7, -0.5).normalize();
    const fogCol = options.fogColor || new THREE.Color(0xc04828); // Dusk orange

    super({
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      uniforms: {
        lightDirection: { value: lightDir },
        envMap: { value: options.envMap || null },
        envMapIntensity: { value: options.envMapIntensity || 2.5 },
        fogColor: { value: fogCol },
        time: { value: 0 }
      },
      side: THREE.DoubleSide
    });

    this.lightDirection = lightDir;
  }

  /**
   * Update time uniform for animated effects.
   * @param {number} time - Elapsed time in seconds
   */
  update(time) {
    this.uniforms.time.value = time;
  }

  /**
   * Set the environment map for reflections.
   * @param {THREE.Texture} envMap
   */
  setEnvMap(envMap) {
    this.uniforms.envMap.value = envMap;
  }

  /**
   * Set environment map intensity.
   * @param {number} intensity
   */
  setEnvMapIntensity(intensity) {
    this.uniforms.envMapIntensity.value = intensity;
  }

  /**
   * Set light direction.
   * @param {THREE.Vector3} direction
   */
  setLightDirection(direction) {
    this.uniforms.lightDirection.value.copy(direction).normalize();
  }
}
