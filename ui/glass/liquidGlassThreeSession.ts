import type { ExpoWebGLRenderingContext } from "expo-gl";
import * as THREE from "three";

export type LiquidGlassGlOptions = {
  size: number;
  phaseOffset: number;
  isLightTheme: boolean;
};

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Polar edge wobble + thick-lens shading, dispersion, studio highlight.
 * Low angular harmonics only (smooth lobes, no high-θ ripples). Max |rEdge - 0.5| ≈ EDGE_AMP.
 */
const FRAG = `
uniform float uTime;
uniform float uPhase;
uniform float uIsLight;
uniform float uAspect;
uniform float uChipPx;
varying vec2 vUv;

void main() {
  vec2 pu = vUv - 0.5;
  pu.x *= uAspect;
  float r0 = length(pu);
  float theta = atan(pu.y, pu.x);
  float t = uTime + uPhase * 6.2831853;
  float slow = t * 0.52 + uPhase * 1.15;

  // Smooth liquid boundary: 2–6 lobes only, slow drift + shared swell (no fine θ ripples)
  float w = sin(2.0 * theta + slow * 0.82 + uPhase * 1.35) * 0.58
          + sin(4.0 * theta - slow * 0.62 + uPhase * 0.75) * 0.30
          + sin(6.0 * theta + slow * 0.38 + uPhase * 2.1) * 0.12;
  float swell = sin(slow * 0.78 + uPhase * 2.25) * 0.24;
  w = w * 0.90 + swell;
  float EDGE_AMP = 0.032;
  float rEdge = 0.5 + EDGE_AMP * clamp(w, -1.15, 1.15);

  vec2 flow = vec2(
    sin(pu.y * 5.5 + t * 0.38) * 0.028 + cos(pu.x * 4.8 - t * 0.26) * 0.016,
    cos(pu.x * 5.2 - t * 0.32) * 0.028 + sin(pu.y * 5.0 + t * 0.22) * 0.016
  );
  float flowMask = (1.0 - smoothstep(0.05, 0.42, r0)) * (1.0 - smoothstep(rEdge - 0.08, rEdge + 0.02, r0));
  vec2 pw = pu + flow * flowMask;
  float rw = length(pw);

  float edgeMask = 1.0 - smoothstep(rEdge - 0.030, rEdge + 0.012, r0);

  // Taller, curvier dome → more voluminous liquid bead
  float cap = 0.565;
  float h2 = cap * cap - dot(pw, pw);
  float hz = h2 > 0.0 ? sqrt(h2) : 0.0;
  vec3 N = normalize(vec3(pw * 2.62, hz * 2.22 + 0.001));
  vec3 V = vec3(0.0, 0.0, 1.0);
  float ndv = clamp(dot(N, V), 0.0, 1.0);

  float F0l = 0.02;
  float F0d = 0.052;
  float F0 = mix(F0d, F0l, uIsLight);
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);

  vec2 refr = normalize(pu + vec2(1e-5));
  float px = (1.0 - ndv) * mix(0.145, 0.125, uIsLight);
  float rR = length(pw + refr * px * 0.11 + vec2(0.006 * (1.0 - ndv), 0.0));
  float rG = length(pw + refr * px * 0.11);
  float rB = length(pw + refr * px * 0.11 - vec2(0.006 * (1.0 - ndv), 0.0));

  // Light: colorless clarity — env ≈ white; interior uses scalar blend (no RGB fringing)
  vec3 envInL = vec3(0.998, 0.998, 1.0);
  vec3 envOutL = vec3(0.972, 0.976, 0.985);
  vec3 envInD = vec3(0.148, 0.15, 0.155);
  vec3 envOutD = vec3(0.24, 0.25, 0.29);

  vec3 envIn = mix(envInD, envInL, uIsLight);
  vec3 envOut = mix(envOutD, envOutL, uIsLight);
  float sR = smoothstep(0.0, 0.5, rR);
  float sG = smoothstep(0.0, 0.5, rG);
  float sB = smoothstep(0.0, 0.5, rB);
  float sUni = (sR + sG + sB) / 3.0;
  vec3 envChr = vec3(
    mix(envIn.r, envOut.r, sR),
    mix(envIn.g, envOut.g, sG),
    mix(envIn.b, envOut.b, sB)
  );
  vec3 envFlat = mix(envIn, envOut, sUni);
  vec3 env = mix(envChr, envFlat, uIsLight);

  // Almost no “frost” on light — that milky gray reads cartoon, not clear glass
  vec3 frostC = mix(vec3(0.18, 0.19, 0.22), vec3(0.996, 0.997, 1.0), uIsLight);
  float frostAmt = (1.0 - ndv) * mix(0.44, 0.07, uIsLight);
  env = mix(env, frostC, frostAmt);
  float crown = pow(ndv, 2.2);
  env += mix(vec3(0.02, 0.022, 0.028), vec3(0.008, 0.008, 0.01), uIsLight) * crown;

  float caust = sin(pw.y * 14.0 + t * 0.55) * cos(pw.x * 12.0 - t * 0.42);
  vec3 caustCol =
    vec3(0.48, 0.72, 1.0) * caust * mix(0.036, 0.0, uIsLight) * (1.0 - smoothstep(0.28, 0.52, rw));

  vec3 Lk = normalize(vec3(-0.38, 0.62, 1.0));
  float ndl = max(dot(N, Lk), 0.0);
  float specT = pow(ndl, mix(118.0, 220.0, uIsLight));
  float specB = pow(ndl, 18.0) * mix(0.24, 0.07, uIsLight);
  float specAmt = mix(0.52, 0.42, uIsLight);

  vec3 reflL = vec3(1.0, 1.0, 1.0);
  vec3 reflD = vec3(0.84, 0.91, 1.0);
  vec3 refl = mix(reflD, reflL, uIsLight);

  vec3 body = env + caustCol;
  float fresMix = mix(0.76, 0.58, uIsLight);
  vec3 col = mix(body, refl, fresnel * fresMix);
  col += vec3((specT + specB) * specAmt);

  // Azimuth toward top-left (screen)
  float rPu = length(pu);
  vec2 puN = rPu > 1e-4 ? pu / rPu : vec2(0.0);
  float rimAz = dot(puN, normalize(vec2(-0.72, -0.69)));

  // Sharp optical highlights (reference): small, bright, not broad gray blooms
  vec2 hlUv = vUv - vec2(0.26, 0.19);
  float hl = exp(-dot(hlUv, hlUv) * mix(11.5, 22.0, uIsLight)) * mix(0.11, 0.2, uIsLight);
  col += vec3(hl);
  vec2 glUv = vUv - vec2(0.30, 0.24);
  float glint = exp(-dot(glUv, glUv) * mix(38.0, 58.0, uIsLight)) * mix(0.09, 0.16, uIsLight);
  col += vec3(glint);
  float grazingSpec = pow(1.0 - ndv, mix(5.0, 12.0, uIsLight)) * uIsLight * 0.42;
  col += vec3(grazingSpec) * (0.55 + 0.45 * smoothstep(-0.15, 0.88, rimAz));

  // Very subtle thickness on light (reference inner shadow)
  vec2 brLit = normalize(vec2(0.58, -0.46));
  float innerSh = smoothstep(0.12, 0.5, rw) * max(0.0, dot(puN, brLit));
  col *= 1.0 - innerSh * mix(0.12, 0.045, uIsLight);

  float dEdge = rEdge - r0;
  // Thin silhouette specular — not a thick cartoon stroke
  float bead = smoothstep(0.0, 0.014, dEdge) * (1.0 - smoothstep(0.014, 0.045, dEdge));
  float beadAsym = mix(0.88, 1.0, uIsLight * smoothstep(-0.35, 0.92, rimAz));
  col += vec3(1.0) * bead * beadAsym * mix(0.38, 0.22, uIsLight);

  float rimDef = exp(-dEdge * 58.0) * smoothstep(0.006, 0.042, dEdge) * (1.0 - smoothstep(0.05, 0.11, dEdge));
  float rimBright = rimDef * uIsLight * (0.12 + 0.22 * smoothstep(-0.2, 0.95, rimAz));
  col += vec3(1.0) * rimBright;
  col += vec3(0.07, 0.085, 0.11) * rimDef * (1.0 - uIsLight);

  float dispEdge = (1.0 - smoothstep(0.0, 0.018, dEdge)) * fresnel;
  float disp = dispEdge * mix(1.0, 0.12, uIsLight);
  col.r += disp * 0.055;
  col.b += disp * 0.04;
  col.g -= disp * 0.025;

  float iris = smoothstep(rEdge - 0.16, rEdge - 0.02, r0) * smoothstep(0.2, 0.85, sin(theta * 0.5 + 0.8));
  col += vec3(1.0, 0.85, 0.95) * iris * 0.045 * sin(t * 1.2 + theta * 2.5) * (1.0 - uIsLight);

  float sh = smoothstep(-0.15, 0.35, pu.y) * (1.0 - ndv) * mix(0.075, 0.018, uIsLight);
  col *= (1.0 - sh);

  // Light: mostly edge alpha + low bulk tint — reads clear on white like reference glass
  float fill = mix(0.5, 0.34, uIsLight);
  fill += clamp((46.0 - uChipPx) / 46.0, 0.0, 1.0) * mix(0.085, 0.045, uIsLight);
  float aFres = fresnel * mix(0.19, 0.22, uIsLight);
  float aBody = (1.0 - ndv) * mix(0.058, 0.028, uIsLight);
  float alpha = fill + aFres + aBody;
  alpha *= edgeMask;
  alpha = clamp(alpha, 0.0, mix(0.88, 0.58, uIsLight));

  gl_FragColor = vec4(col, alpha);
}
`;

function createRenderer(gl: ExpoWebGLRenderingContext): THREE.WebGLRenderer {
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;

  const renderer = new THREE.WebGLRenderer({
    context: gl as unknown as WebGLRenderingContext,
    canvas: {
      width,
      height,
      style: {},
      addEventListener: () => {},
      removeEventListener: () => {},
      clientWidth: width,
      clientHeight: height,
    } as unknown as HTMLCanvasElement,
    antialias: true,
    alpha: true,
    premultipliedAlpha: false,
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  return renderer;
}

/**
 * GPU liquid-glass via Three.js + SkSL-style shading in `expo-gl` (web + native).
 */
export function startLiquidGlassGl(
  gl: ExpoWebGLRenderingContext,
  getOpts: () => LiquidGlassGlOptions,
): () => void {
  const renderer = createRenderer(gl);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPhase: { value: 0 },
      uIsLight: { value: 1 },
      uAspect: { value: 1 },
      uChipPx: { value: 50 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  let raf = 0;
  let start = performance.now();
  let active = true;

  const frame = () => {
    if (!active) return;
    raf = requestAnimationFrame(frame);
    const { size, phaseOffset, isLightTheme } = getOpts();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const aspect = w > 0 && h > 0 ? w / h : 1;

    const mat = material.uniforms;
    mat.uTime.value = (performance.now() - start) * 0.001;
    mat.uPhase.value = phaseOffset;
    mat.uIsLight.value = isLightTheme ? 1 : 0;
    mat.uAspect.value = aspect;
    mat.uChipPx.value = size;

    gl.viewport(0, 0, w, h);
    renderer.render(scene, camera);
    gl.endFrameEXP();
  };

  frame();

  return () => {
    active = false;
    cancelAnimationFrame(raf);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  };
}

/** Inner padding: must clear animated edge (see FRAG EDGE_AMP × max |w|, clamp). ~11% of diameter is safe. */
export function liquidGlassContentInsetPx(chipDiameter: number): number {
  return Math.max(4, Math.round(chipDiameter * 0.11));
}
