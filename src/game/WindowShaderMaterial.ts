import * as THREE from "three";

/**
 * Procedural "parallax interior atlas" shader: simulates room depth behind
 * building windows (4 columns x 2 rows per facade section) with warm amber
 * night lighting, without any real interior geometry.
 */
export function createWindowMaterial(opts: {
  baseColor: THREE.ColorRepresentation;
  gridX?: number;
  gridY?: number;
  glow?: number;
}): THREE.ShaderMaterial {
  const uniforms = {
    uTime: { value: 0 },
    uBaseColor: { value: new THREE.Color(opts.baseColor) },
    uGrid: { value: new THREE.Vector2(opts.gridX ?? 4, opts.gridY ?? 2) },
    uGlow: { value: opts.glow ?? 1.0 },
    uSeed: { value: Math.random() * 1000 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vec4 mvPosition = viewMatrix * worldPos;
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uBaseColor;
      uniform vec2 uGrid;
      uniform float uGlow;
      uniform float uSeed;
      varying vec2 vUv;
      varying vec3 vViewDir;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(41.3, 289.1)) + uSeed) * 43758.5453);
      }

      void main() {
        vec2 grid = uGrid;
        vec2 cellId = floor(vUv * grid);
        vec2 cellUv = fract(vUv * grid) - 0.5;

        // fake parallax: offset the interior "room" plane by view angle
        vec2 parallax = vViewDir.xy * 0.18;
        vec2 roomUv = cellUv - parallax;

        float mullion = 1.0 - smoothstep(0.42, 0.46, abs(cellUv.x));
        float mullionY = 1.0 - smoothstep(0.42, 0.46, abs(cellUv.y));
        float frame = min(mullion, mullionY);

        float litChance = hash(cellId);
        float flicker = 0.94 + 0.06 * sin(uTime * (2.0 + litChance * 5.0) + litChance * 30.0);
        bool lit = litChance > 0.4;

        vec3 glassColor = uBaseColor * 0.55;
        vec3 interiorColor = vec3(1.0, 0.72, 0.38) * flicker;
        vec3 darkInterior = uBaseColor * 0.12;

        // pseudo-depth shading inside the "room": darker toward back wall
        float depthShade = 1.0 - length(roomUv) * 0.6;

        vec3 color = glassColor;
        if (frame > 0.5) {
          color = lit ? interiorColor * depthShade * uGlow : darkInterior;
        }

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  return material;
}

export function updateWindowMaterials(materials: THREE.ShaderMaterial[], time: number) {
  for (const m of materials) {
    m.uniforms.uTime.value = time;
  }
}
