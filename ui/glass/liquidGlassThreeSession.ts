import type { ExpoWebGLRenderingContext } from "expo-gl";
import * as THREE from "three";
import { logPageDisplay } from "../pageDisplayLog";

export type LiquidGlassGlOptions = {
  size: number;
  phaseOffset: number;
  isLightTheme: boolean;
};

/** Monotonic ms for GL animation (falls back if `performance.now` is missing). */
function liquidGlNowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

/**
 * Console diagnostics for the liquid-glass loop (paste logs to debug “no animation”).
 * - Metro: on when `__DEV__` is true.
 * - Prod: `EXPO_PUBLIC_LIQUID_GL_DEBUG=1` at build time, **or** open the app with
 *   `liquidGlDebug=1` in the URL **search or hash** (TMA often uses hash-only URLs).
 */
export function liquidGlassDebugLogging(): boolean {
  try {
    if (process.env.EXPO_PUBLIC_LIQUID_GL_DEBUG === "1") return true;
  } catch {
    /* ignore */
  }
  if (typeof __DEV__ !== "undefined" && __DEV__) return true;
  if (typeof window !== "undefined" && typeof window.location !== "undefined") {
    const q = `${window.location.search || ""}${window.location.hash || ""}`;
    if (q.includes("liquidGlDebug=1")) return true;
  }
  return false;
}

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

float ltHash3(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float distSeg3(vec3 p, vec3 a, vec3 b) {
  vec3 ab = b - a;
  float denom = dot(ab, ab);
  float t = denom > 1e-8 ? clamp(dot(p - a, ab) / denom, 0.0, 1.0) : 0.0;
  return length(p - (a + t * ab));
}

vec3 boltPoint3(float u, float seed, float time, float rad) {
  float jig = sin(u * 24.0 + seed * 7.0 + time * 4.8) * 0.095;
  float a = u * 4.5 + time * 0.88 + seed * 1.7 + jig * 3.0;
  float rr = rad * (0.28 + 0.62 * u + 0.12 * sin(u * 16.0 + time * 2.8 + seed));
  float x = cos(a) * rr;
  float y = sin(a * 0.91 + seed * 0.4) * rr;
  float z = rad * (0.12 + 0.58 * sin(3.14159265 * u * 0.92 + seed)
    + 0.11 * sin(time * 3.1 + u * 21.0 + seed * 3.0));
  return vec3(x, y, max(z, 0.0));
}

float lightningPolyDist(vec3 p, float seed, float time, float rad) {
  vec3 p0 = boltPoint3(0.0, seed, time, rad);
  vec3 p1 = boltPoint3(0.34, seed + 1.1, time, rad);
  vec3 p2 = boltPoint3(0.67, seed + 2.2, time, rad);
  vec3 p3 = boltPoint3(1.0, seed + 3.3, time, rad);
  float d = distSeg3(p, p0, p1);
  d = min(d, distSeg3(p, p1, p2));
  d = min(d, distSeg3(p, p2, p3));
  return d;
}

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

  // Light: stay bright but not identical to #fff or src≈dst erases the disc on white web UIs
  vec3 envInL = vec3(0.93, 0.96, 1.0);
  vec3 envOutL = vec3(0.86, 0.91, 0.99);
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

  // Volumetric lightning: electric-blue arcs (wider falloff so strokes stay visible on small chips)
  float ltSeed = ltHash3(vec3(uPhase * 6.18, 2.71, 0.42));
  float ltTime = t * 5.8 + uPhase * 9.0;
  float ltBreathe = 0.68 + 0.32 * sin(uTime * 7.5 + uPhase * 2.1);
  float distOut = max(0.0, rw - rEdge);
  float spillMax = 0.023;
  float spillFade = 1.0 - smoothstep(0.0, spillMax, distOut);
  float zVol = hz * (0.12 + 0.78 * (0.5 + 0.5 * sin(pw.x * 11.0 + pw.y * 8.3 + ltTime * 1.05 + ltSeed * 6.0)));
  float zSpill = cap * 0.11 * spillFade * exp(-distOut * 95.0);
  vec3 ip = vec3(pw.x, pw.y, max(zVol, zSpill));
  float radBolt = cap * 1.02;
  float hzGate = max(step(0.018, hz), 0.56 * spillFade);
  float interiorW = 1.0 - smoothstep(rEdge - 0.12, rEdge + 0.035, rw);
  float outsideRing = spillFade * smoothstep(0.0015, 0.014, distOut) * 0.64;
  float inVol = interiorW * hzGate + outsideRing;
  float dL = lightningPolyDist(ip, ltSeed * 40.0, ltTime, radBolt);
  float dL2 = lightningPolyDist(ip, ltSeed * 40.0 + 19.0, ltTime * 1.07 + 1.8, radBolt * 0.88);
  float dL3 = lightningPolyDist(ip, ltSeed * 40.0 + 37.0, ltTime * 0.91 + 3.4, radBolt * 0.93);
  dL = min(dL, min(dL2 * 1.06, dL3 * 1.04));
  float flick = 0.42 + 0.58 * pow(0.5 + 0.5 * sin(ltTime * 22.0 + ltSeed * 90.0), 2.0);
  flick *= 0.55 + 0.45 * pow(0.5 + 0.5 * sin(ltTime * 35.0 + dL * 95.0), 3.0);
  float thin = exp(-dL * dL * 950.0);
  float halo = exp(-dL * dL * 195.0);
  vec3 blueCore = vec3(0.35, 0.72, 1.0);
  vec3 blueHot = vec3(0.62, 0.88, 1.0);
  vec3 blueIon = vec3(0.12, 0.42, 1.0);
  vec3 coreCol = mix(blueCore, blueHot, pow(thin, 0.35)) * thin * mix(3.4, 4.35, uIsLight);
  vec3 ionCol = blueIon * halo * mix(0.95, 1.05, uIsLight);
  float ltGain = mix(1.15, 1.22, uIsLight);
  col += (coreCol + ionCol) * inVol * flick * ltGain * ltBreathe;
  float ltAlpha = (thin * 2.4 + halo * 0.55) * inVol * flick * ltGain * ltBreathe * spillFade * mix(0.38, 0.42, uIsLight);

  // Light: mostly edge alpha + low bulk tint — reads clear on white like reference glass
  float fill = mix(0.5, 0.46, uIsLight);
  fill += clamp((46.0 - uChipPx) / 46.0, 0.0, 1.0) * mix(0.085, 0.055, uIsLight);
  float aFres = fresnel * mix(0.19, 0.26, uIsLight);
  float aBody = (1.0 - ndv) * mix(0.058, 0.045, uIsLight);
  float alpha = (fill + aFres + aBody) * edgeMask + ltAlpha;
  alpha = clamp(alpha, 0.0, mix(0.88, 0.78, uIsLight));

  col *= mix(vec3(1.0), vec3(0.94, 0.97, 1.04), uIsLight * 0.55);
  gl_FragColor = vec4(col, alpha);
}
`;

function stubCanvasElement(width: number, height: number): HTMLCanvasElement {
  return {
    width,
    height,
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    clientWidth: width,
    clientHeight: height,
  } as unknown as HTMLCanvasElement;
}

/**
 * Bind Three.js to the real HTML canvas on web (expo-gl) so `drawingBuffer` resizes from layout
 * stay in sync. A stub canvas + stale size was yielding 0×0 or wrong viewports → no glass/lightning.
 */
function createRenderer(gl: ExpoWebGLRenderingContext): THREE.WebGLRenderer {
  const g = gl as unknown as WebGLRenderingContext;
  const htmlCanvas =
    typeof HTMLCanvasElement !== "undefined" && g.canvas instanceof HTMLCanvasElement ? g.canvas : null;

  let width = gl.drawingBufferWidth;
  let height = gl.drawingBufferHeight;
  if ((width <= 0 || height <= 0) && htmlCanvas) {
    width = htmlCanvas.width;
    height = htmlCanvas.height;
  }
  width = Math.max(1, width);
  height = Math.max(1, height);

  const renderer = new THREE.WebGLRenderer({
    canvas: (htmlCanvas ?? stubCanvasElement(width, height)) as HTMLCanvasElement,
    context: g as WebGL2RenderingContext,
    antialias: true,
    alpha: true,
    premultipliedAlpha: false,
  });
  renderer.setPixelRatio(1);
  renderer.setDrawingBufferSize(gl.drawingBufferWidth > 0 ? gl.drawingBufferWidth : width, gl.drawingBufferHeight > 0 ? gl.drawingBufferHeight : height, 1);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  return renderer;
}

/**
 * GPU liquid-glass via Three.js + SkSL-style shading in `expo-gl` (web + native).
 *
 * Animation: `uTime` (seconds) is written every frame; the fragment shader uses it for
 * lightning (`ltTime`, `ltBreathe`) and the liquid rim. If lightning looks static, capture
 * `[LiquidGlassGL]` logs (`liquidGlassDebugLogging()`).
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
  const start = liquidGlNowMs();
  let active = true;
  const wantLogs = liquidGlassDebugLogging();
  const logEveryMs = wantLogs ? 2000 : 0;
  if (wantLogs) {
    console.log(
      "[LiquidGlassGL] debug logging enabled: JSON every 2s per chip. Prod: EXPO_PUBLIC_LIQUID_GL_DEBUG=1 or add liquidGlDebug=1 to URL search/hash (TMA).",
    );
  }
  let frameIdx = 0;
  let lastLogWallMs = start;
  let uTimeAtLastLog = 0;
  let lastBufW = -1;
  let lastBufH = -1;
  let loggedBufferZero = false;
  let loggedDrawReady = false;

  const frame = () => {
    if (!active) return;
    raf = requestAnimationFrame(frame);
    frameIdx += 1;
    const wallMs = liquidGlNowMs();
    const { size, phaseOffset, isLightTheme } = getOpts();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;

    if (w <= 0 || h <= 0) {
      if (!loggedBufferZero) {
        loggedBufferZero = true;
        logPageDisplay("liquid_glass_buffer_zero", {
          phaseOffset,
          chipPx: size,
          drawingBuffer: { w, h },
          note: "expo-gl web often gets size after onLayout; loop continues until non-zero.",
        });
      }
      gl.endFrameEXP();
      return;
    }

    if (w !== lastBufW || h !== lastBufH) {
      lastBufW = w;
      lastBufH = h;
      renderer.setDrawingBufferSize(w, h, 1);
      if (!loggedDrawReady) {
        loggedDrawReady = true;
        logPageDisplay("liquid_glass_draw_ready", {
          phaseOffset,
          chipPx: size,
          drawingBuffer: { w, h },
          note: "Three.js drawing buffer synced; glass + lightning should render.",
        });
      }
    }

    const aspect = w > 0 && h > 0 ? w / h : 1;

    const mat = material.uniforms;
    const uTimeSec = (wallMs - start) * 0.001;
    mat.uTime.value = uTimeSec;
    mat.uPhase.value = phaseOffset;
    mat.uIsLight.value = isLightTheme ? 1 : 0;
    mat.uAspect.value = aspect;
    mat.uChipPx.value = size;

    if (logEveryMs > 0 && wallMs - lastLogWallMs >= logEveryMs) {
      const duTime = uTimeSec - uTimeAtLastLog;
      uTimeAtLastLog = uTimeSec;
      lastLogWallMs = wallMs;
      console.log(
        "[LiquidGlassGL]",
        JSON.stringify({
          phaseOffset,
          frameIdx,
          uTimeSec: Math.round(uTimeSec * 1000) / 1000,
          duTimePerLogInterval: Math.round(duTime * 1000) / 1000,
          drawingBuffer: { w, h },
          chipPx: size,
          isLightTheme,
          hint:
            "uTimeSec must grow each frame; duTimePerLogInterval should be ~2.0 when logging every 2s. Lightning uses uniform float uTime in FRAG (ltTime, ltBreathe).",
        }),
      );
    }

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
