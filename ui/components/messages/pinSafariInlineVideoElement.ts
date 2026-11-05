/**
 * iOS Safari plays `<video>` in native fullscreen unless inline playback is pinned on the DOM node.
 * React/RN-web props alone are not always enough — set attributes like message media does.
 */
export function pinSafariInlineVideoElement(video: HTMLVideoElement): () => void {
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("x-webkit-airplay", "deny");
  video.disablePictureInPicture = true;
  video.controls = false;
  video.setAttribute("data-hsp-inline-video", "1");
  try {
    video.setAttribute("controlsList", "nodownload nofullscreen noremoteplayback");
  } catch {
    /* older WebKit */
  }

  const exitNativeFullscreen = () => {
    const exit = (
      video as HTMLVideoElement & { webkitExitFullscreen?: () => void }
    ).webkitExitFullscreen;
    if (typeof exit === "function") {
      try {
        exit.call(video);
      } catch {
        /* ignore */
      }
    }
  };

  video.addEventListener("webkitbeginfullscreen", exitNativeFullscreen);

  return () => {
    video.removeEventListener("webkitbeginfullscreen", exitNativeFullscreen);
  };
}
