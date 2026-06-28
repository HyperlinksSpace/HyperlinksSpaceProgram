import { createElement, useId } from "react";
import { MessageChatArtSignIconSvg } from "./MessageChatArtSignIconSvg";

type Props = {
  size?: number;
};

/** Artist palette badge with CSS 3D orbit (web). */
export function MessageChatArtSignIcon({ size = 20 }: Props) {
  const rawId = useId().replace(/:/g, "");
  const svg = createElement(MessageChatArtSignIconSvg, { size, idSuffix: rawId });

  return createElement(
    "div",
    {
      className: "hsp-art-sign-3d",
      style: { width: size, height: size, flexShrink: 0 },
    },
    createElement(
      "div",
      { className: "hsp-art-sign-3d-scene" },
      createElement("div", { className: "hsp-art-sign-3d-shadow" }),
      createElement("div", { className: "hsp-art-sign-3d-inner" }, createElement("div", { className: "hsp-art-sign-3d-face" }, svg)),
    ),
  );
}
