import { Asset } from "expo-asset";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { StyleProp, ViewStyle } from "react-native";

import { logPageDisplay } from "../../pageDisplayLog";
import { useSmartLeadLayout } from "../../smart/useSmartLeadLayout";

type Props = {
  source: number;
  style?: StyleProp<ViewStyle>;
  layoutWidthPx?: number;
};

function patchSmartLeadSvgMarkup(svgText: string, heightPx: number): string {
  return svgText.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    const cleaned = attrs
      .replace(/\swidth="[^"]*"/gi, "")
      .replace(/\sheight="[^"]*"/gi, "")
      .replace(/\spreserveAspectRatio="[^"]*"/gi, "");
    return `<svg${cleaned} width="100%" height="${heightPx}" preserveAspectRatio="none">`;
  });
}

/**
 * Web: inline SVG with preserveAspectRatio="none" — img/background/expo-image all
 * keep aspect ratio in this stack; only inline SVG honors non-uniform stretch.
 */
export function SmartLeadImage({ source, style, layoutWidthPx = 0 }: Props) {
  const uri = Asset.fromModule(source).uri;
  const [rawSvg, setRawSvg] = useState<string | null>(null);
  const { height, onProbeRef } = useSmartLeadLayout({ layoutWidthPx });

  useEffect(() => {
    let cancelled = false;
    void fetch(uri)
      .then((response) => response.text())
      .then((text) => {
        if (!cancelled) setRawSvg(text);
      })
      .catch(() => {
        if (!cancelled) setRawSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const markup = useMemo(
    () => (rawSvg ? patchSmartLeadSvgMarkup(rawSvg, height) : null),
    [rawSvg, height],
  );
  const lastLoggedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${layoutWidthPx}|${height}|${Boolean(markup)}`;
    if (lastLoggedKeyRef.current === key) {
      return;
    }
    lastLoggedKeyRef.current = key;
    logPageDisplay("smart_lead_image_web", {
      layoutWidthPx: layoutWidthPx > 0 ? layoutWidthPx : null,
      heightPx: height,
      hasMarkup: Boolean(markup),
    });
  }, [height, layoutWidthPx, markup]);

  const probeStyle: CSSProperties = {
    display: "block",
    width: "100%",
  };

  const hostStyle: CSSProperties = {
    display: "block",
    width: "100%",
    height,
    overflow: "hidden",
    flexShrink: 0,
    ["--smart-lead-height-px" as string]: `${height}px`,
    ...(style as CSSProperties | undefined),
  };

  if (!markup) {
    return (
      <div ref={onProbeRef} data-smart-lead-probe="true" style={probeStyle}>
        <div data-smart-lead-host="true" style={hostStyle} aria-hidden />
      </div>
    );
  }

  return (
    <div ref={onProbeRef} data-smart-lead-probe="true" style={probeStyle}>
      <div
        data-smart-lead-host="true"
        style={hostStyle}
        role="img"
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    </div>
  );
}
