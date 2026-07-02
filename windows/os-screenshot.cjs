const { execFile } = require("child_process");
const path = require("path");

function isPrintScreenKey(input) {
  const key = String(input?.key || "").toLowerCase();
  const code = String(input?.code || "").toLowerCase();
  return key === "printscreen" || code === "printscreen" || key === "snapshot";
}

function ensureWebContentsAllowsOsCapture(contents, log) {
  try {
    if (typeof contents.setContentProtection === "function") {
      contents.setContentProtection(false);
    }
  } catch (e) {
    log?.(`setContentProtection: ${e?.message || e}`);
  }
}

let lastSyntheticPrintScreenAt = 0;

/** Re-inject VK_SNAPSHOT when Chromium intercepts Print Screen on Windows. */
function triggerWindowsPrintScreenOsCapture() {
  const now = Date.now();
  if (now - lastSyntheticPrintScreenAt < 350) return;
  lastSyntheticPrintScreenAt = now;

  const windir = process.env.WINDIR || "C:\\Windows";
  const ps = path.join(windir, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const script = [
    "Add-Type @\"",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public class HspPrintScreen {",
    "  [DllImport(\"user32.dll\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);",
    "}",
    "\"@",
    "[HspPrintScreen]::keybd_event(0x2C, 0, 0, [UIntPtr]::Zero)",
    "[HspPrintScreen]::keybd_event(0x2C, 0, 2, [UIntPtr]::Zero)",
  ].join("; ");

  execFile(ps, ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true }, () => {});
}

/**
 * Allow OS screenshot tools (Print Screen, Snipping Tool) across every BrowserWindow.
 * @param {import("electron").App} electronApp
 * @param {(msg: string) => void} [log]
 */
function registerOsScreenshotPassthrough(electronApp, log) {
  electronApp.on("web-contents-created", (_event, contents) => {
    ensureWebContentsAllowsOsCapture(contents, log);

    if (process.platform !== "win32") return;

    contents.on("before-input-event", (event, input) => {
      if (!input || input.type !== "keyDown" || !isPrintScreenKey(input)) return;
      try {
        event.preventDefault();
      } catch (_) {}
      triggerWindowsPrintScreenOsCapture();
    });
  });
}

module.exports = {
  registerOsScreenshotPassthrough,
  ensureWebContentsAllowsOsCapture,
};
