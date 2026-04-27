import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { layout } from "../theme";

type BottomBarLayoutCtx = {
  barHeight: number;
  setBarHeight: (h: number) => void;
};

const BottomBarLayoutContext = createContext<BottomBarLayoutCtx | null>(null);

export function BottomBarLayoutProvider({ children }: { children: ReactNode }) {
  const [barHeight, setBarHeightState] = useState(layout.bottomBar.barMinHeight);
  const setBarHeight = useCallback((h: number) => {
    setBarHeightState((prev) => (prev === h ? prev : h));
  }, []);
  const value = useMemo(() => ({ barHeight, setBarHeight }), [barHeight, setBarHeight]);
  return <BottomBarLayoutContext.Provider value={value}>{children}</BottomBarLayoutContext.Provider>;
}

export function useBottomBarLayout(): BottomBarLayoutCtx {
  const ctx = useContext(BottomBarLayoutContext);
  if (!ctx) {
    throw new Error("useBottomBarLayout must be used within BottomBarLayoutProvider");
  }
  return ctx;
}

/** Syncs measured footer height so overlays (e.g. FloatingShield) can track the bar top. */
export function BottomBarHeightReporter({ height }: { height: number }) {
  const { setBarHeight } = useBottomBarLayout();
  useEffect(() => {
    setBarHeight(height);
  }, [height, setBarHeight]);
  return null;
}
