import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import {
  liquidGlassContentInsetPx,
  startLiquidGlassGl,
  type LiquidGlassGlOptions,
} from "../glass/liquidGlassThreeSession";

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
  useEffect(
    () => () => {
      disposeRef.current?.();
      disposeRef.current = null;
    },
    [],
  );

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    disposeRef.current?.();
    disposeRef.current = startLiquidGlassGl(gl, () => optsRef.current);
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
  const outerWrap = {
    width: size,
    height: size,
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

  return (
    <View style={outerWrap} collapsable={false}>
      <View style={clip} collapsable={false}>
        <View style={clip} pointerEvents="none" collapsable={false}>
          <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
        </View>
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
  foreground: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "column",
    zIndex: 2,
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
