import { Asset } from "expo-asset";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { StyleProp, ViewStyle } from "react-native";

import { SMART_LEAD_HEIGHT_PX } from "../../smart/smartAssets";

type Props = {
  source: number;
  style?: StyleProp<ViewStyle>;
};

function patchSmartLeadSvgMarkup(svgText: string): string {
  return svgText.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    const cleaned = attrs
      .replace(/\swidth="[^"]*"/gi, "")
      .replace(/\sheight="[^"]*"/gi, "")
      .replace(/\spreserveAspectRatio="[^"]*"/gi, "");
    return `<svg${cleaned} width="100%" height="${SMART_LEAD_HEIGHT_PX}" preserveAspectRatio="none">`;
  });
}

const hostStyleBase: CSSProperties = {
  display: "block",
  width: "100%",
  height: SMART_LEAD_HEIGHT_PX,
  overflow: "hidden",
  flexShrink: 0,
};

/**
 * Web: inline SVG with preserveAspectRatio="none" — img/background/expo-image all
 * keep aspect ratio in this stack; only inline SVG honors non-uniform stretch.
 */
export function SmartLeadImage({ source, style }: Props) {
  const uri = Asset.fromModule(source).uri;
  const [markup, setMarkup] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(uri)
      .then((response) => response.text())
      .then((text) => {
        if (!cancelled) setMarkup(patchSmartLeadSvgMarkup(text));
      })
      .catch(() => {
        if (!cancelled) setMarkup(null);
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const hostStyle: CSSProperties = {
    ...hostStyleBase,
    ...(style as CSSProperties | undefined),
  };

  if (!markup) {
    return <div data-smart-lead-host="true" style={hostStyle} aria-hidden />;
  }

  return (
    <div
      data-smart-lead-host="true"
      style={hostStyle}
      role="img"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
