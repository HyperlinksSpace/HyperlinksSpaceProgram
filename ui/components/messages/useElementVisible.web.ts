import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

type Options = {
  rootMargin?: string;
  threshold?: number;
  /** When false, observer stays detached (e.g. before data is ready). */
  enabled?: boolean;
};

/** Pause work for off-screen stickers/emojis (telegram-tt only plays visible stickers). */
export function useElementVisible(
  ref: RefObject<Element | null>,
  options?: Options,
): boolean {
  const [visible, setVisible] = useState(false);
  const [observedNode, setObservedNode] = useState<Element | null>(null);
  const enabled = options?.enabled !== false;

  useLayoutEffect(() => {
    setObservedNode(ref.current);
  });

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }

    const node = observedNode ?? ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    let intersecting = false;
    const observer = new IntersectionObserver(
      (entries) => {
        intersecting = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0);
        setVisible(intersecting);
      },
      {
        root: null,
        rootMargin: options?.rootMargin ?? "64px",
        threshold: options?.threshold ?? 0.01,
      },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      setVisible(false);
    };
  }, [enabled, observedNode, options?.rootMargin, options?.threshold, ref]);

  return visible;
}
