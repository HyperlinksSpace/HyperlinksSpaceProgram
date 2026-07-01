import type { RefObject } from "react";

type Options = {
  rootMargin?: string;
  threshold?: number;
  enabled?: boolean;
};

/** Native: always visible (no IntersectionObserver). */
export function useElementVisible(
  _ref: RefObject<Element | null>,
  _options?: Options,
): boolean {
  return true;
}
