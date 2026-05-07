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
  /** When false, `GlobalBottomBar` is embedded in split columns — not stacked under the main scroll shell. */
  footerDockedToScreenEdge: boolean;
  setFooterDockedToScreenEdge: (v: boolean) => void;
  /** Draft text in the AI/search field; persisted across breakpoint re-docks (footer ↔ split column). */
  draftText: string;
  setDraftText: (t: string) => void;
};

const BottomBarLayoutContext = createContext<BottomBarLayoutCtx | null>(null);

export function BottomBarLayoutProvider({ children }: { children: ReactNode }) {
  const [barHeight, setBarHeightState] = useState(layout.bottomBar.barMinHeight);
  const setBarHeight = useCallback((h: number) => {
    setBarHeightState((prev) => (prev === h ? prev : h));
  }, []);
  const [footerDockedToScreenEdge, setFooterDockedToScreenEdgeState] = useState(true);
  const setFooterDockedToScreenEdge = useCallback((v: boolean) => {
    setFooterDockedToScreenEdgeState((prev) => (prev === v ? prev : v));
  }, []);
  const [draftText, setDraftTextState] = useState("");
  const setDraftText = useCallback((t: string) => {
    setDraftTextState((prev) => (prev === t ? prev : t));
  }, []);
  const value = useMemo(
    () => ({
      barHeight,
      setBarHeight,
      footerDockedToScreenEdge,
      setFooterDockedToScreenEdge,
      draftText,
      setDraftText,
    }),
    [barHeight, setBarHeight, footerDockedToScreenEdge, setFooterDockedToScreenEdge, draftText, setDraftText],
  );
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
