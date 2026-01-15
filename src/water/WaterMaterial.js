import * as THREE from 'three/webgpu';

/**
 * Custom water shader material inspired by WebTide.
 * Features: Fresnel reflections, sharp specular highlights, dark water color.
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

  void main() {
    vec3 normal = normalize(vNormalW);

    // View direction
    vec3 viewRayW = normalize(vPositionW - cameraPosition);

    // Fresnel - more reflective at grazing angles
    // Using Schlick approximation with higher F0 for more visible reflections
    float fresnel = 0.15 + 0.85 * pow(1.0 - max(0.0, dot(-viewRayW, normal)), 5.0);

    // Diffuse lighting
    float ndl = max(0.0, dot(normal, -lightDirection));

    // Water base color (dark blue-green like WebTide)
    vec3 waterColor = vec3(0.01, 0.06, 0.1);
    vec3 diffuseColor = waterColor * (0.3 + 0.7 * ndl);

    // Reflection
    vec3 viewRayReflectedW = reflect(viewRayW, normal);
    vec3 reflectedColor = textureCube(envMap, viewRayReflectedW).rgb * envMapIntensity;

    // Softer specular highlight (sun glints) - reduced power and intensity
    vec3 reflectDir = reflect(-lightDirection, normal);
    float specular = pow(max(0.0, dot(reflectDir, -viewRayW)), 256.0) * 50.0;

    // Combine: blend between water color and reflection based on fresnel
    vec3 finalColor = mix(diffuseColor, reflectedColor, fresnel) + vec3(specular);

    // Tone mapping to prevent blown highlights
    finalColor = finalColor / (finalColor + vec3(1.0));

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export class WaterMaterial extends THREE.ShaderMaterial {
  constructor(options = {}) {
    const lightDir = options.lightDirection || new THREE.Vector3(-0.5, -0.7, -0.5).normalize();

    super({
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      uniforms: {
        lightDirection: { value: lightDir },
        envMap: { value: options.envMap || null },
        envMapIntensity: { value: options.envMapIntensity || 2.0 }
      },
      side: THREE.DoubleSide
    });

    this.lightDirection = lightDir;
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
