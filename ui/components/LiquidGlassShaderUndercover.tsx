import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import {
  liquidGlassContentInsetPx,
  liquidGlassDebugLogging,
  liquidGlassRayMarginPx,
  startLiquidGlassGl,
  type LiquidGlassGlOptions,
} from "../glass/liquidGlassThreeSession";
import { logPageDisplay } from "../pageDisplayLog";

type Props = {
  size: number;
  phaseOffset?: number;
  isLightTheme: boolean;
  /** `center` = single icon (settings). `top` = icon + label column like original FloatingShield circle. */
  contentAlign?: "center" | "top";
  children: ReactNode;
};

/**
 * Liquid-glass chip: Three.js GLSL inside `expo-gl` (same path for web, iOS, Android, Electron webview).
 */
export function LiquidGlassShaderUndercover({
  size,
  phaseOffset = 0,
  isLightTheme,
  contentAlign = "center",
  children,
}: Props) {
  const optsRef = useRef<LiquidGlassGlOptions>({ size, phaseOffset, isLightTheme });
  optsRef.current = { size, phaseOffset, isLightTheme };

  const disposeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    logPageDisplay("liquid_glass_chip_mount", {
      platform: Platform.OS,
      size,
      phaseOffset,
      isLightTheme,
    });
  }, [size, phaseOffset, isLightTheme]);

  useEffect(
    () => () => {
      disposeRef.current?.();
      disposeRef.current = null;
    },
    [],
  );

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    disposeRef.current?.();
    if (liquidGlassDebugLogging()) {
      console.log(
        "[LiquidGlassGL] onContextCreate",
        JSON.stringify({
          size: optsRef.current.size,
          phaseOffset: optsRef.current.phaseOffset,
          isLightTheme: optsRef.current.isLightTheme,
          note: "If you never see this, GLView did not create a context (web/TMA block or zero-size view).",
        }),
      );
    }
    disposeRef.current = startLiquidGlassGl(gl, () => optsRef.current);
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    logPageDisplay("liquid_glass_context_created", {
      phaseOffset: optsRef.current.phaseOffset,
      chipPx: optsRef.current.size,
      drawingBuffer: { w, h },
      note: "If w/h are 0 on web, the next onLayout should resize the canvas; see liquid_glass_draw_ready.",
    });
  }, []);

  // Shadow on outer wrapper only — `overflow: hidden` on the same view clips iOS shadows.
  const outerLift = isLightTheme
    ? {
        // Neutral, soft — blue-gray shadows read "muddy" on white
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: Math.max(5, size * 0.11),
        elevation: 4,
      }
    : {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.22,
        shadowRadius: Math.max(4, size * 0.1),
        elevation: 4,
      };
  const rayPad = liquidGlassRayMarginPx(size);
  const viewSize = size + 2 * rayPad;
  const outerWrap = {
    width: size,
    height: size,
    overflow: "visible" as const,
    borderRadius: size / 2,
    ...outerLift,
  };
  const clip = {
    width: size,
    height: size,
    borderRadius: size / 2,
    overflow: "hidden" as const,
  };
  const inset = liquidGlassContentInsetPx(size);
  // Top-aligned shield: preserve original 6px icon offset from circle top — inset sides + bottom only.
  const safePad =
    contentAlign === "top"
      ? { paddingHorizontal: inset, paddingBottom: inset }
      : { paddingHorizontal: inset, paddingVertical: inset };

  const glLayerStyle =
    Platform.OS === "web"
      ? [StyleSheet.absoluteFill, styles.glLayerWeb]
      : StyleSheet.absoluteFill;

  const glExpand = {
    position: "absolute" as const,
    left: -rayPad,
    top: -rayPad,
    width: viewSize,
    height: viewSize,
    zIndex: 0,
  };

  return (
    <View style={outerWrap} collapsable={false}>
      <View style={[glExpand, styles.glUnderlay]} pointerEvents="none" collapsable={false}>
        <GLView style={glLayerStyle} onContextCreate={onContextCreate} />
      </View>
      <View style={clip} collapsable={false}>
        <View
          style={[
            styles.foreground,
            contentAlign === "top" ? styles.foregroundTop : styles.foregroundCenter,
            clip,
            safePad,
          ]}
          pointerEvents="box-none"
        >
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glUnderlay: {
    zIndex: 0,
  },
  /** RN-web: promote canvas compositing above default stacking quirks in overflow clips. */
  glLayerWeb: {
    zIndex: 0,
    opacity: 1,
  },
  foreground: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "column",
    zIndex: 2,
    backgroundColor: "transparent",
  },
  foregroundCenter: {
    alignItems: "center",
    justifyContent: "center",
  },
  foregroundTop: {
    alignItems: "center",
    justifyContent: "flex-start",
  },
});
