import { Platform, type LayoutChangeEvent } from "react-native";

/** RN-web: layout events expose the DOM node; use it for ResizeObserver attachment. */
export function resolveWebLayoutElement(event: LayoutChangeEvent): HTMLElement | null {
  if (Platform.OS !== "web") {
    return null;
  }
  const target = (event.nativeEvent as { target?: unknown }).target;
  return target instanceof HTMLElement ? target : null;
}

export function resolveWebRefElement(node: unknown): HTMLElement | null {
  if (Platform.OS !== "web" || node == null) {
    return null;
  }
  if (node instanceof HTMLElement) {
    return node;
  }
  const maybeNativeRef = node as { getNativeRef?: () => unknown };
  if (typeof maybeNativeRef.getNativeRef === "function") {
    const nativeRef = maybeNativeRef.getNativeRef();
    if (nativeRef instanceof HTMLElement) {
      return nativeRef;
    }
  }
  return null;
}
