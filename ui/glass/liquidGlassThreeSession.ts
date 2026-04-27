import type { ExpoWebGLRenderingContext } from "expo-gl";
import * as THREE from "three";
import { logPageDisplay } from "../pageDisplayLog";

export type LiquidGlassGlOptions = {
  size: number;
  phaseOffset: number;
  isLightTheme: boolean;
};

/**
 * Edit this value to tune lightning stroke width on liquid-glass chips. Passed every frame as `uBoltWidthTune`.
 * **1** = baseline. **Larger** → **thicker** bolts (try 1.4–2.0); **smaller** → **thinner** (~0.65–0.9).
 */
export const LIQUID_GLASS_BOLT_WIDTH_TUNE = 2;

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
uniform float uViewPx;
uniform float uBoltWidthTune;
varying vec2 vUv;

float ltHash3(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

/* One chaotic bolt from p relative to wandering origin; maxLen01 scales how far it reaches (chip units).
 * beamThin scales perpendicular distance into Gaussian pe — larger => thinner stroke in pixels. */
void addChaosBolt(vec2 p, float ang, float ltTime, float k, float maxLen01, float weight, float beamThin, inout float sh, inout float gl) {
  float rp = length(p);
  if (rp < 1e-5) return;
  float a = atan(p.y, p.x);
  float da0 = a - ang;
  da0 = da0 - 6.2831853 * floor((da0 + 3.14159265) / 6.2831853);
  float along = cos(da0) * rp;
  if (along < 0.0) return;
  float bend = sin(along * 35.0 + ltTime * (2.05 + fract(k * 0.31) * 2.15) + k * 2.45) * 0.36;
  bend += sin(along * 10.2 - ltTime * 1.22 + k * 1.58) * 0.16;
  bend += along * (0.12 + 0.10 * sin(ltTime * 1.02 + k * 2.75));
  bend += sin(along * 58.0 + ltTime * 4.35 + k * 3.1) * 0.048;
  float angCur = ang + bend;
  float daB = a - angCur;
  daB = daB - 6.2831853 * floor((daB + 3.14159265) / 6.2831853);
  float perp = abs(sin(daB)) * rp;
  float wig = sin(along * 88.0 + ltTime * (6.5 + fract(k * 0.37) * 4.0) + k * 3.4) * 0.0029;
  wig += sin(along * 205.0 - ltTime * (5.1 + fract(k * 0.19) * 3.0) + k * 5.2) * 0.00125;
  wig += sin(along * 47.0 + ltTime * 2.7 + k * 1.9) * 0.0011;
  perp += abs(wig) * clamp(rp, 0.008, 0.16) * 0.9;
  float lenWobble = sin(ltTime * 3.8 + k * 2.6) * 0.034 + sin(ltTime * 7.1 + along * 22.0) * 0.018;
  float lenCap = maxLen01 * 0.51 + lenWobble;
  lenCap = clamp(lenCap, 0.12, 0.58);
  float lenChop = (1.0 - smoothstep(lenCap * 0.82, lenCap * 1.06, along)) * smoothstep(0.012, 0.052, along);
  float br = abs(sin(daB - 0.14 * sin(along * 18.0 + k * 2.1 + ltTime * 1.7))) * rp;
  float w = max(weight, 0.0);
  float uBr1 = along * (84.0 + fract(k * 0.47) * 38.0) + ltTime * (13.8 + fract(k * 0.23) * 10.5) + k * 5.05;
  float uBr2 = along * (31.0 + fract(k * 0.33) * 17.0) - ltTime * (10.3 + fract(k * 0.31) * 7.8) + k * 2.33;
  float uBr3 = along * (118.0 + fract(k * 0.19) * 44.0) + ltTime * (17.5 + fract(k * 0.41) * 12.0) + k * 7.15;
  float uBr4 = along * (9.2 + fract(k * 0.27) * 5.5) + ltTime * 0.88 + k * 1.05;
  float brFine = pow(0.5 + 0.5 * sin(uBr1), 3.05);
  float brMed = pow(0.5 + 0.5 * sin(uBr2 + 0.6 * sin(uBr1 * 0.31)), 1.95);
  float brCoarse = smoothstep(0.12, 0.88, 0.5 + 0.5 * sin(uBr3));
  float brChunk = step(0.44, fract(uBr4)) * step(fract(uBr4 + 0.37), 0.72);
  float broken = clamp(brFine * brMed * (0.18 + 0.82 * brCoarse) * (0.28 + 0.72 * max(brChunk, 0.35 + 0.65 * brFine)), 0.0, 1.0);
  float brokenCore = mix(0.10, 1.0, pow(broken, 0.45));
  float brokenGlow = 0.38 + 0.62 * sqrt(broken);
  float fJ1 = fract(along * 67.0 + k * 8.17 + ltTime * 2.35);
  float fJ2 = fract(along * 131.0 - ltTime * 4.25 + k * 3.94);
  float fJ3 = fract(along * 44.0 + sin(ltTime * 6.8 + k * 2.6) * 0.42);
  float strictSeg =
    smoothstep(0.02, 0.10, fJ1) * (1.0 - smoothstep(0.91, 0.99, fJ1))
    * smoothstep(0.22, 0.38, fJ2) * smoothstep(0.10, 0.22, fJ3);
  float microZig = smoothstep(0.42, 0.58, fract(along * 203.0 + k * 13.2 + ltTime * 1.1));
  float boltJag = strictSeg * (0.52 + 0.48 * microZig);
  boltJag = max(boltJag, 0.42);
  float pe = perp * beamThin;
  float be = br * beamThin;
  /* Single tight Gaussian for core line; wide lobes removed — they stacked into a thick “rope”. */
  sh += exp(-pe * pe * 52000.0) * 1.38 * lenChop * w * 1.42 * brokenCore * boltJag;
  sh += exp(-be * be * 42000.0) * 0.18 * lenChop * w * 1.42 * brokenCore * boltJag;
  gl += (exp(-pe * pe * 2200.0) * 0.09 + exp(-be * be * 1500.0) * 0.03) * lenChop * w * 0.08 * brokenGlow * boltJag;
}

void main() {
  vec2 puFull = vUv - 0.5;
  puFull.x *= uAspect;
  float viewScale = uViewPx / uChipPx;
  vec2 pu = puFull * viewScale;
  float studioHlGate = step(43.0, uChipPx);
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

  float edgeMask = 1.0 - smoothstep(rEdge - 0.030, rEdge + 0.006, r0);

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

  // Light: push toward white — mid-gray envOutL read “muddy” on white marketing backgrounds
  vec3 envInL = vec3(0.992, 0.996, 1.0);
  vec3 envOutL = vec3(0.948, 0.968, 0.992);
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
  vec3 frostC = mix(vec3(0.18, 0.19, 0.22), vec3(0.998, 0.999, 1.0), uIsLight);
  float frostAmt = (1.0 - ndv) * mix(0.44, 0.018, uIsLight);
  env = mix(env, frostC, frostAmt);
  float crown = pow(ndv, 2.2);
  env += mix(vec3(0.02, 0.022, 0.028), vec3(0.004, 0.0045, 0.006), uIsLight) * crown;

  float caust = sin(pw.y * 14.0 + t * 0.55) * cos(pw.x * 12.0 - t * 0.42);
  vec3 caustCol =
    vec3(0.48, 0.72, 1.0) * caust * mix(0.036, 0.0, uIsLight) * (1.0 - smoothstep(0.28, 0.52, rw));

  vec3 Lk = normalize(vec3(-0.38, 0.62, 1.0));
  float ndl = max(dot(N, Lk), 0.0);
  float specT = pow(ndl, mix(118.0, 220.0, uIsLight));
  float specB = pow(ndl, 18.0) * mix(0.24, 0.07, uIsLight);
  float specAmt = mix(0.52, 0.36, uIsLight);

  vec3 reflL = vec3(1.0, 1.0, 1.0);
  vec3 reflD = vec3(0.84, 0.91, 1.0);
  vec3 refl = mix(reflD, reflL, uIsLight);

  vec3 body = env + caustCol;
  float fresMix = mix(0.76, 0.54, uIsLight);
  vec3 col = mix(body, refl, fresnel * fresMix);
  col += vec3((specT + specB) * specAmt) * mix(0.5, 1.0, studioHlGate);

  // Azimuth toward top-left (screen)
  float rPu = length(pu);
  vec2 puN = rPu > 1e-4 ? pu / rPu : vec2(0.0);
  float rimAz = dot(puN, normalize(vec2(-0.72, -0.69)));

  // Sharp optical highlights (reference): small, bright, not broad gray blooms
  vec2 hlUv = vUv - vec2(0.26, 0.19);
  float hl = exp(-dot(hlUv, hlUv) * mix(11.5, 22.0, uIsLight)) * mix(0.11, 0.06, uIsLight) * studioHlGate;
  col += vec3(hl);
  vec2 glUv = vUv - vec2(0.30, 0.24);
  float glint = exp(-dot(glUv, glUv) * mix(38.0, 58.0, uIsLight)) * mix(0.09, 0.05, uIsLight) * studioHlGate;
  col += vec3(glint);
  float grazingSpec = pow(1.0 - ndv, mix(5.0, 12.0, uIsLight)) * (1.0 - uIsLight) * 0.26;
  col += vec3(grazingSpec) * (0.55 + 0.45 * smoothstep(-0.15, 0.88, rimAz));

  // Very subtle thickness on light (reference inner shadow)
  vec2 brLit = normalize(vec2(0.58, -0.46));
  float innerSh = smoothstep(0.12, 0.5, rw) * max(0.0, dot(puN, brLit));
  col *= 1.0 - innerSh * mix(0.12, 0.018, uIsLight);

  float dEdge = rEdge - r0;
  // Thin silhouette specular — not a thick cartoon stroke
  float bead = smoothstep(0.0, 0.014, dEdge) * (1.0 - smoothstep(0.014, 0.045, dEdge));
  float beadAsym = mix(0.88, 1.0, uIsLight * smoothstep(-0.35, 0.92, rimAz));
  col += vec3(1.0) * bead * beadAsym * mix(0.38, 0.14, uIsLight);

  float rimDef = exp(-dEdge * 58.0) * smoothstep(0.006, 0.042, dEdge) * (1.0 - smoothstep(0.05, 0.11, dEdge));
  float rimBright = rimDef * uIsLight * (0.05 + 0.10 * smoothstep(-0.2, 0.95, rimAz));
  col += vec3(1.0) * rimBright;
  col += vec3(0.07, 0.085, 0.11) * rimDef * (1.0 - uIsLight);

  float dispEdge = (1.0 - smoothstep(0.0, 0.018, dEdge)) * fresnel;
  float disp = dispEdge * mix(1.0, 0.05, uIsLight);
  col.r += disp * 0.055;
  col.b += disp * 0.04;
  col.g -= disp * 0.025;

  float iris = smoothstep(rEdge - 0.16, rEdge - 0.02, r0) * smoothstep(0.2, 0.85, sin(theta * 0.5 + 0.8));
  col += vec3(1.0, 0.85, 0.95) * iris * 0.045 * sin(t * 1.2 + theta * 2.5) * (1.0 - uIsLight);

  float sh = smoothstep(-0.15, 0.35, pu.y) * (1.0 - ndv) * mix(0.075, 0.010, uIsLight);
  col *= (1.0 - sh);

  /* Slightly dim the glass shell so bolts read through the “drop” all the way to the chip rim. */
  float ltShell = smoothstep(0.15, 0.41, r0) * (1.0 - smoothstep(0.44, 0.53, r0));
  col *= 1.0 - ltShell * mix(0.32, 0.07, uIsLight);

  vec3 glassCol = col;

  /* pe = perp * ltBeamThin. Larger beamThin => faster falloff => thinner line in px.
   * wTargetPx scaled by uBoltWidthTune (see LIQUID_GLASS_BOLT_WIDTH_TUNE in TS). Core: exp(-pe*pe*52000). */
  float wTargetPx = clamp(clamp(uChipPx * 0.011, 0.34, 0.58) * uBoltWidthTune, 0.18, 2.0);
  float ltBeamThin = (1.0 / sqrt(52000.0)) * uChipPx / max(wTargetPx, 0.22);
  ltBeamThin = clamp(ltBeamThin, 0.22, 0.95);
  float ltSmallChip = clamp((46.0 - uChipPx) / 22.0, 0.0, 1.0);

  // Few chaotic bolts from a wandering micro-origin — no full-disc fan, no big central glow sphere.
  float ltSeed = ltHash3(vec3(uPhase * 6.18, 2.71, 0.42));
  float ltTime = t * 5.2 + uPhase * 9.0;
  float ltBreathe = mix(
    0.55 + 0.45 * sin(uTime * 6.2 + uPhase * 2.4),
    0.82 + 0.18 * sin(uTime * 6.2 + uPhase * 2.4),
    uIsLight
  );
  float R_DROP = 0.5;
  float R_VIEW = 0.5 * viewScale;
  float boltSpillRim = 1.0 - smoothstep(R_VIEW - 0.035, R_VIEW + 0.045, r0);
  float boltSpill = boltSpillRim;
  float piercePastLiquid = 1.0 + 0.55 * smoothstep(rEdge - 0.02, rEdge + 0.09, r0);
  vec2 ltOrig = vec2(
    sin(ltTime * 0.41 + ltSeed * 5.7) * 0.021 + sin(ltTime * 0.11 + uPhase * 3.1) * 0.011,
    cos(ltTime * 0.35 + ltSeed * 4.2) * 0.019 + cos(ltTime * 0.095 + uPhase * 2.7) * 0.010
  );
  vec2 pLt = pu - ltOrig;
  float rLt = length(pLt);
  float flickRaw = 0.42 + 0.58 * pow(0.5 + 0.5 * sin(ltTime * 22.0 + ltSeed * 73.0), 2.4);
  float flick = mix(flickRaw, 0.86 + 0.14 * (flickRaw - 0.42) / 0.58, uIsLight);
  float lenBoost = 1.0 + 0.24 * clamp(viewScale - 1.0, 0.0, 0.55);
  float accSharp = 0.0;
  float accGlow = 0.0;
  float fi = 0.0;
  float hA = ltHash3(vec3(ltSeed, fi * 1.618, 0.413));
  float hB = ltHash3(vec3(ltSeed, fi * 2.718, 9.069));
  float hC = ltHash3(vec3(ltSeed, fi * 4.201, 3.331));
  float ang = hA * 6.2831853 + sin(ltTime * (0.62 + hB * 1.4) + hB * 6.2831853) * 0.42 + sin(ltTime * (0.21 + hA * 0.9) + fi * 1.77) * 0.19 + ltTime * (0.11 + hB * 0.13);
  float maxLen = mix(0.26, 0.98, hB) * (0.88 + 0.24 * sin(ltTime * 2.9 + fi * 1.3 + hA * 12.0)) * lenBoost;
  float w0 = step(0.12, hC) * (0.50 + 0.50 * pow(0.5 + 0.5 * sin(ltTime * (28.0 + hA * 22.0) + fi * 5.1), 1.72)) * (0.52 + 0.48 * pow(0.5 + 0.5 * sin(ltTime * (17.0 + hC * 31.0) + hB * 18.0), 2.05)) * ltBreathe * (0.58 + 0.42 * hC) * 1.22;
  addChaosBolt(pLt, ang, ltTime, fi * 2.17 + ltSeed * 8.3, maxLen, w0, ltBeamThin, accSharp, accGlow);
  fi = 1.0;
  hA = ltHash3(vec3(ltSeed, fi * 1.618, 0.413));
  hB = ltHash3(vec3(ltSeed, fi * 2.718, 9.069));
  hC = ltHash3(vec3(ltSeed, fi * 4.201, 3.331));
  ang = hA * 6.2831853 + sin(ltTime * (0.62 + hB * 1.4) + hB * 6.2831853) * 0.42 + sin(ltTime * (0.21 + hA * 0.9) + fi * 1.77) * 0.19 + ltTime * (0.11 + hB * 0.13);
  maxLen = mix(0.26, 0.98, hB) * (0.88 + 0.24 * sin(ltTime * 2.9 + fi * 1.3 + hA * 12.0)) * lenBoost;
  w0 = step(0.12, hC) * (0.50 + 0.50 * pow(0.5 + 0.5 * sin(ltTime * (28.0 + hA * 22.0) + fi * 5.1), 1.72)) * (0.52 + 0.48 * pow(0.5 + 0.5 * sin(ltTime * (17.0 + hC * 31.0) + hB * 18.0), 2.05)) * ltBreathe * (0.58 + 0.42 * hC) * 1.22;
  addChaosBolt(pLt, ang, ltTime, fi * 2.17 + ltSeed * 8.3, maxLen, w0, ltBeamThin, accSharp, accGlow);
  fi = 2.0;
  hA = ltHash3(vec3(ltSeed, fi * 1.618, 0.413));
  hB = ltHash3(vec3(ltSeed, fi * 2.718, 9.069));
  hC = ltHash3(vec3(ltSeed, fi * 4.201, 3.331));
  ang = hA * 6.2831853 + sin(ltTime * (0.62 + hB * 1.4) + hB * 6.2831853) * 0.42 + sin(ltTime * (0.21 + hA * 0.9) + fi * 1.77) * 0.19 + ltTime * (0.11 + hB * 0.13);
  maxLen = mix(0.26, 0.98, hB) * (0.88 + 0.24 * sin(ltTime * 2.9 + fi * 1.3 + hA * 12.0)) * lenBoost;
  w0 = step(0.12, hC) * (0.50 + 0.50 * pow(0.5 + 0.5 * sin(ltTime * (28.0 + hA * 22.0) + fi * 5.1), 1.72)) * (0.52 + 0.48 * pow(0.5 + 0.5 * sin(ltTime * (17.0 + hC * 31.0) + hB * 18.0), 2.05)) * ltBreathe * (0.58 + 0.42 * hC) * 1.22;
  addChaosBolt(pLt, ang, ltTime, fi * 2.17 + ltSeed * 8.3, maxLen, w0, ltBeamThin, accSharp, accGlow);
  fi = 3.0;
  hA = ltHash3(vec3(ltSeed, fi * 1.618, 0.413));
  hB = ltHash3(vec3(ltSeed, fi * 2.718, 9.069));
  hC = ltHash3(vec3(ltSeed, fi * 4.201, 3.331));
  ang = hA * 6.2831853 + sin(ltTime * (0.62 + hB * 1.4) + hB * 6.2831853) * 0.42 + sin(ltTime * (0.21 + hA * 0.9) + fi * 1.77) * 0.19 + ltTime * (0.11 + hB * 0.13);
  maxLen = mix(0.26, 0.98, hB) * (0.88 + 0.24 * sin(ltTime * 2.9 + fi * 1.3 + hA * 12.0)) * lenBoost;
  w0 = step(0.12, hC) * (0.50 + 0.50 * pow(0.5 + 0.5 * sin(ltTime * (28.0 + hA * 22.0) + fi * 5.1), 1.72)) * (0.52 + 0.48 * pow(0.5 + 0.5 * sin(ltTime * (17.0 + hC * 31.0) + hB * 18.0), 2.05)) * ltBreathe * (0.58 + 0.42 * hC) * 1.22;
  addChaosBolt(pLt, ang, ltTime, fi * 2.17 + ltSeed * 8.3, maxLen, w0, ltBeamThin, accSharp, accGlow);
  fi = 4.0;
  hA = ltHash3(vec3(ltSeed, fi * 1.618, 0.413));
  hB = ltHash3(vec3(ltSeed, fi * 2.718, 9.069));
  hC = ltHash3(vec3(ltSeed, fi * 4.201, 3.331));
  ang = hA * 6.2831853 + sin(ltTime * (0.62 + hB * 1.4) + hB * 6.2831853) * 0.42 + sin(ltTime * (0.21 + hA * 0.9) + fi * 1.77) * 0.19 + ltTime * (0.11 + hB * 0.13);
  maxLen = mix(0.26, 0.98, hB) * (0.88 + 0.24 * sin(ltTime * 2.9 + fi * 1.3 + hA * 12.0)) * lenBoost;
  w0 = step(0.12, hC) * (0.50 + 0.50 * pow(0.5 + 0.5 * sin(ltTime * (28.0 + hA * 22.0) + fi * 5.1), 1.72)) * (0.52 + 0.48 * pow(0.5 + 0.5 * sin(ltTime * (17.0 + hC * 31.0) + hB * 18.0), 2.05)) * ltBreathe * (0.58 + 0.42 * hC) * 1.22;
  addChaosBolt(pLt, ang, ltTime, fi * 2.17 + ltSeed * 8.3, maxLen, w0, ltBeamThin, accSharp, accGlow);
  fi = 5.0;
  hA = ltHash3(vec3(ltSeed, fi * 1.618, 0.413));
  hB = ltHash3(vec3(ltSeed, fi * 2.718, 9.069));
  hC = ltHash3(vec3(ltSeed, fi * 4.201, 3.331));
  ang = hA * 6.2831853 + sin(ltTime * (0.62 + hB * 1.4) + hB * 6.2831853) * 0.42 + sin(ltTime * (0.21 + hA * 0.9) + fi * 1.77) * 0.19 + ltTime * (0.11 + hB * 0.13);
  maxLen = mix(0.26, 0.98, hB) * (0.88 + 0.24 * sin(ltTime * 2.9 + fi * 1.3 + hA * 12.0)) * lenBoost;
  w0 = step(0.12, hC) * (0.50 + 0.50 * pow(0.5 + 0.5 * sin(ltTime * (28.0 + hA * 22.0) + fi * 5.1), 1.72)) * (0.52 + 0.48 * pow(0.5 + 0.5 * sin(ltTime * (17.0 + hC * 31.0) + hB * 18.0), 2.05)) * ltBreathe * (0.58 + 0.42 * hC) * 1.22;
  addChaosBolt(pLt, ang, ltTime, fi * 2.17 + ltSeed * 8.3, maxLen, w0, ltBeamThin, accSharp, accGlow);
  fi = 6.0;
  hA = ltHash3(vec3(ltSeed, fi * 1.618, 0.413));
  hB = ltHash3(vec3(ltSeed, fi * 2.718, 9.069));
  hC = ltHash3(vec3(ltSeed, fi * 4.201, 3.331));
  ang = hA * 6.2831853 + sin(ltTime * (0.62 + hB * 1.4) + hB * 6.2831853) * 0.42 + sin(ltTime * (0.21 + hA * 0.9) + fi * 1.77) * 0.19 + ltTime * (0.11 + hB * 0.13);
  maxLen = mix(0.26, 0.98, hB) * (0.88 + 0.24 * sin(ltTime * 2.9 + fi * 1.3 + hA * 12.0)) * lenBoost;
  w0 = step(0.12, hC) * (0.50 + 0.50 * pow(0.5 + 0.5 * sin(ltTime * (28.0 + hA * 22.0) + fi * 5.1), 1.72)) * (0.52 + 0.48 * pow(0.5 + 0.5 * sin(ltTime * (17.0 + hC * 31.0) + hB * 18.0), 2.05)) * ltBreathe * (0.58 + 0.42 * hC) * 1.22;
  addChaosBolt(pLt, ang, ltTime, fi * 2.17 + ltSeed * 8.3, maxLen, w0, ltBeamThin, accSharp, accGlow);
  accSharp = clamp(accSharp, 0.0, 13.5);
  accGlow = clamp(accGlow, 0.0, 22.0);
  float pin = exp(-dot(pLt, pLt) * 3600.0) * (0.13 + mix(0.10, 0.045, uIsLight) * sin(ltTime * 33.0 + ltSeed * 50.0)) * (1.0 + 0.20 * ltSmallChip);
  vec3 ltCol = mix(vec3(1.0, 1.0, 1.0), vec3(0.0, 0.0, 1.0), uIsLight);
  float pierce = smoothstep(0.006, 0.040, rLt) * smoothstep(0.004, 0.032, r0) * boltSpill * piercePastLiquid;
  float outsideBoost = 1.0 + 0.75 * smoothstep(rEdge + 0.002, rEdge + 0.09, r0) + 0.35 * smoothstep(R_DROP - 0.1, R_DROP - 0.02, r0);
  float rayStretch = 1.0 + 0.88 * smoothstep(0.17, 0.48, r0) + 0.95 * smoothstep(R_DROP + 0.04, R_VIEW - 0.08, r0);
  float sharpVis = accSharp * pierce * flick * outsideBoost * rayStretch * (1.0 + 0.15 * ltSmallChip);
  float glowVis = accGlow * pierce * flick * outsideBoost * rayStretch * (1.0 + 0.15 * ltSmallChip);
  /* Outside the liquid rim: strip diffuse glow (veil) but keep sharp bolts + full reach. */
  float pastDrop = max(0.0, r0 - rEdge);
  float killBroad = exp(-pastDrop * 30.0);
  vec3 ltRgb = ltCol * (sharpVis * 2.45 + pin * 1.22);
  ltRgb += ltCol * glowVis * killBroad * 0.05;
  float ltAlphaBolt = (
    sharpVis * 1.12
    + glowVis * 0.08 * killBroad
    + pin * 0.72
  ) * boltSpill * 0.88;
  float annulusRay = smoothstep(rEdge - 0.02, rEdge + 0.12, r0) * (1.0 - smoothstep(R_VIEW - 0.06, R_VIEW + 0.02, r0));
  float outsideRay = annulusRay * boltSpill * (
    accGlow * 0.055 * killBroad
    + accSharp * 0.14
  ) * flick * piercePastLiquid * rayStretch;
  float ltAlpha = ltAlphaBolt + outsideRay * 0.93;
  float rimAtBoost = smoothstep(R_DROP - 0.14, R_DROP - 0.03, r0) * boltSpill * flick * mix(0.20, 0.20, uIsLight) * killBroad * (1.0 - uIsLight);
  float At = clamp(ltAlpha + rimAtBoost, 0.0, 0.84);

  // Light: mostly edge alpha + low bulk tint — reads clear on white like reference glass
  float fill = mix(0.5, 0.40, uIsLight);
  fill += clamp((46.0 - uChipPx) / 46.0, 0.0, 1.0) * mix(0.085, 0.045, uIsLight);
  float aFres = fresnel * mix(0.19, 0.23, uIsLight);
  float aBody = (1.0 - ndv) * mix(0.058, 0.036, uIsLight);
  float Ag = clamp((fill + aFres + aBody) * edgeMask, 0.0, mix(0.88, 0.78, uIsLight));
  /* Non-premul blend does out = src.rgb * src.a + dst * (1-src.a). Summing glassA + ltAlpha into one a
   * while src.rgb = glass + lightning under-scales bolts when edgeMask → 0. Composite lightning over glass. */
  vec3 premulOut = ltRgb * At + glassCol * Ag * (1.0 - At);
  float alpha = At + Ag * (1.0 - At);
  alpha = clamp(alpha, 0.0, mix(0.88, 0.78, uIsLight));
  col = premulOut / max(alpha, 0.00035);
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
      uViewPx: { value: 50 },
      uBoltWidthTune: { value: 1 },
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
    const rayPad = liquidGlassRayMarginPx(size);
    const viewPx = size + 2 * rayPad;
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
    mat.uViewPx.value = viewPx;
    mat.uBoltWidthTune.value = LIQUID_GLASS_BOLT_WIDTH_TUNE;

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

/**
 * Extra GL canvas margin on each side so lightning can extend past the circular drop without clipping.
 * Layout chip size stays `chipDiameter`; shader uses `chipDiameter + 2 * margin` as `uViewPx`.
 */
export function liquidGlassRayMarginPx(chipDiameter: number): number {
  return chipDiameter >= 45 ? 10 : 5;
}
