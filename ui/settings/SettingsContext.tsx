import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SettingsSheet } from "../components/SettingsSheet";

type SettingsContextValue = {
  settingsSheetVisible: boolean;
  openSettingsSheet: () => void;
  closeSettingsSheet: () => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settingsSheetVisible, setSettingsSheetVisible] = useState(false);

  const openSettingsSheet = useCallback(() => {
    setSettingsSheetVisible(true);
  }, []);

  const closeSettingsSheet = useCallback(() => {
    setSettingsSheetVisible(false);
  }, []);

  const value = useMemo(
    () => ({
      settingsSheetVisible,
      openSettingsSheet,
      closeSettingsSheet,
    }),
    [settingsSheetVisible, openSettingsSheet, closeSettingsSheet],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
      <SettingsSheet />
    </SettingsContext.Provider>
  );
}

export function useSettingsSheet(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettingsSheet must be used within SettingsProvider");
  }
  return ctx;
}
