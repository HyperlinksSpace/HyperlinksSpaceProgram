import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type CompactChatOverlayGateCtx = {
  /** True while narrow home shows full-screen open chat (must hide root {@link GlobalBottomBar}). */
  compactChatOpen: boolean;
  setCompactChatOpen: (open: boolean) => void;
};

const CompactChatOverlayContext = createContext<CompactChatOverlayGateCtx | null>(null);

export function CompactChatOverlayProvider({ children }: { children: ReactNode }) {
  const [compactChatOpen, setCompactChatOpenState] = useState(false);
  const setCompactChatOpen = useCallback((open: boolean) => {
    setCompactChatOpenState((prev) => (prev === open ? prev : open));
  }, []);
  const value = useMemo(
    () => ({ compactChatOpen, setCompactChatOpen }),
    [compactChatOpen, setCompactChatOpen],
  );
  return (
    <CompactChatOverlayContext.Provider value={value}>{children}</CompactChatOverlayContext.Provider>
  );
}

export function useCompactChatOverlayGate(): CompactChatOverlayGateCtx {
  const ctx = useContext(CompactChatOverlayContext);
  if (!ctx) {
    throw new Error("useCompactChatOverlayGate must be used within CompactChatOverlayProvider");
  }
  return ctx;
}
