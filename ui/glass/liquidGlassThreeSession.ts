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

  float F0l = 0.028;
  float F0d = 0.052;
  float F0 = mix(F0d, F0l, uIsLight);
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - ndv, 4.65);

  vec2 refr = normalize(pu + vec2(1e-5));
  float px = (1.0 - ndv) * 0.145;
  float rR = length(pw + refr * px * 0.11 + vec2(0.006 * (1.0 - ndv), 0.0));
  float rG = length(pw + refr * px * 0.11);
  float rB = length(pw + refr * px * 0.11 - vec2(0.006 * (1.0 - ndv), 0.0));

  // Light: keep center and rim close to white — dark rims read as "dirty" on white UI
  vec3 envInL = vec3(0.97, 0.975, 0.98);
  vec3 envOutL = vec3(0.84, 0.87, 0.92);
  vec3 envInD = vec3(0.148, 0.15, 0.155);
  vec3 envOutD = vec3(0.24, 0.25, 0.29);

  vec3 envIn = mix(envInD, envInL, uIsLight);
  vec3 envOut = mix(envOutD, envOutL, uIsLight);
  float sR = smoothstep(0.0, 0.5, rR);
  float sG = smoothstep(0.0, 0.5, rG);
  float sB = smoothstep(0.0, 0.5, rB);
  vec3 env = vec3(
    mix(envIn.r, envOut.r, sR),
    mix(envIn.g, envOut.g, sG),
    mix(envIn.b, envOut.b, sB)
  );

  vec3 frostC = mix(vec3(0.18, 0.19, 0.22), vec3(0.985, 0.988, 0.992), uIsLight);
  float frostAmt = (1.0 - ndv) * mix(0.44, 0.34, uIsLight);
  env = mix(env, frostC, frostAmt);
  // Center lift: brighter crown (convex bulk)
  float crown = pow(ndv, 2.2);
  env += mix(vec3(0.02, 0.022, 0.028), vec3(0.035, 0.036, 0.039), uIsLight) * crown;

  float caust = sin(pw.y * 14.0 + t * 0.55) * cos(pw.x * 12.0 - t * 0.42);
  float caustWt = mix(0.036, 0.01, uIsLight);
  vec3 caustCol =
    mix(vec3(0.48, 0.72, 1.0), vec3(0.93, 0.95, 0.98), uIsLight) * caust * caustWt * (1.0 - smoothstep(0.28, 0.52, rw));

  vec3 Lk = normalize(vec3(-0.38, 0.62, 1.0));
  float specT = pow(max(dot(N, Lk), 0.0), 118.0);
  float specB = pow(max(dot(N, Lk), 0.0), 18.0) * 0.24;
  float specAmt = mix(0.52, 0.48, uIsLight);

  vec3 reflL = vec3(1.0, 1.0, 1.0);
  vec3 reflD = vec3(0.84, 0.91, 1.0);
  vec3 refl = mix(reflD, reflL, uIsLight);

  vec3 body = env + caustCol;
  float fresMix = mix(0.76, 0.82, uIsLight);
  vec3 col = mix(body, refl, fresnel * fresMix);
  col += vec3((specT + specB) * specAmt);

  // Azimuth toward top-left (screen) — asymmetric rim for WWDC-style light legibility
  float rPu = length(pu);
  vec2 puN = rPu > 1e-4 ? pu / rPu : vec2(0.0);
  float rimAz = dot(puN, normalize(vec2(-0.72, -0.69)));

  // Studio key + tight glint from top-left
  vec2 hlUv = vUv - vec2(0.26, 0.19);
  float hl = exp(-dot(hlUv, hlUv) * 11.5) * (0.11 + 0.16 * uIsLight);
  col += vec3(hl);
  vec2 glUv = vUv - vec2(0.30, 0.24);
  float glint = exp(-dot(glUv, glUv) * 38.0) * (0.09 + 0.14 * uIsLight);
  col += vec3(glint);

  // Soft inner shadow toward bottom-right (thickness)
  vec2 brLit = normalize(vec2(0.58, -0.46));
  float innerSh = smoothstep(0.12, 0.5, rw) * max(0.0, dot(puN, brLit));
  col *= 1.0 - innerSh * mix(0.12, 0.085, uIsLight);

  // Bright edge bead + thin dispersion ring at silhouette
  float dEdge = rEdge - r0;
  float bead = smoothstep(0.0, 0.022, dEdge) * (1.0 - smoothstep(0.022, 0.058, dEdge));
  float beadAsym = mix(0.88, 1.0, uIsLight * smoothstep(-0.35, 0.92, rimAz));
  col += vec3(1.0) * bead * beadAsym * (0.38 + 0.42 * uIsLight);

  // Light: crisp edge via thin bright ring + cool tint (no subtractive gray "smudge")
  float rimDef = exp(-dEdge * 58.0) * smoothstep(0.006, 0.042, dEdge) * (1.0 - smoothstep(0.05, 0.11, dEdge));
  float rimBright = rimDef * uIsLight * (0.22 + 0.35 * smoothstep(-0.2, 0.95, rimAz));
  col += vec3(1.0) * rimBright;
  col += vec3(0.02, 0.028, 0.038) * rimDef * uIsLight;
  col += vec3(0.07, 0.085, 0.11) * rimDef * (1.0 - uIsLight);

  float disp = (1.0 - smoothstep(0.0, 0.028, dEdge)) * fresnel * mix(1.0, 0.32, uIsLight);
  col.r += disp * 0.055;
  col.b += disp * 0.04;
  col.g -= disp * 0.025;

  float iris = smoothstep(rEdge - 0.16, rEdge - 0.02, r0) * smoothstep(0.2, 0.85, sin(theta * 0.5 + 0.8));
  col += vec3(1.0, 0.85, 0.95) * iris * 0.045 * sin(t * 1.2 + theta * 2.5) * mix(1.0, 0.22, uIsLight);

  // Soft ground shadow (depth); light mode stays minimal so the drop stays clean
  float sh = smoothstep(-0.15, 0.35, pu.y) * (1.0 - ndv) * mix(0.075, 0.028, uIsLight);
  col *= (1.0 - sh);

  float fill = mix(0.5, 0.62, uIsLight);
  fill += clamp((46.0 - uChipPx) / 46.0, 0.0, 1.0) * 0.085;
  float aFres = fresnel * mix(0.19, 0.175, uIsLight);
  float aBody = (1.0 - ndv) * mix(0.058, 0.082, uIsLight);
  float alpha = fill + aFres + aBody;
  alpha *= edgeMask;
  alpha = clamp(alpha, 0.0, 0.88);

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
