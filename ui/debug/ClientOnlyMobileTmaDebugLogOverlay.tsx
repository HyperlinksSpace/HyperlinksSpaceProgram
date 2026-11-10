import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { installMobileTmaDebugLogCapture } from "./appLogRingBuffer";
import { MobileTmaDebugLogOverlay } from "./MobileTmaDebugLogOverlay";

/** Mount log capture only in the browser — keeps static export from touching console. */
export function ClientOnlyMobileTmaDebugLogOverlay() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    installMobileTmaDebugLogCapture();
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return <MobileTmaDebugLogOverlay />;
}
