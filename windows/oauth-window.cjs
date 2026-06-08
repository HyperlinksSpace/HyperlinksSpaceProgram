const { BrowserWindow } = require("electron");

/**
 * OAuth in a modal window sharing the main session so `hs_auth_session` cookies land in Electron,
 * not the user's external browser.
 */
function openOAuthBrowserWindow({ authUrl, apiOrigin, parentWindow, log }) {
  return new Promise((resolve) => {
    if (!parentWindow || parentWindow.isDestroyed()) {
      resolve({ ok: false, error: "parent_window_unavailable" });
      return;
    }

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const authWindow = new BrowserWindow({
      width: 520,
      height: 720,
      parent: parentWindow,
      modal: true,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        spellcheck: false,
        session: parentWindow.webContents.session,
      },
    });

    const notifyMain = (detail) => {
      if (parentWindow.isDestroyed()) return;
      try {
        const payload = JSON.stringify(detail ?? {});
        parentWindow.webContents.executeJavaScript(
          `window.dispatchEvent(new CustomEvent("hsp-oauth-complete", { detail: ${payload} }))`,
        );
      } catch (e) {
        log?.(`oauth notifyMain: ${e?.message || e}`);
      }
    };

    const tryFinishFromUrl = (targetUrl, phase) => {
      let u;
      try {
        u = new URL(targetUrl);
      } catch {
        return false;
      }
      if (u.origin !== apiOrigin) return false;

      if (u.pathname === "/api/auth/google/callback" || u.pathname === "/api/auth/telegram/callback") {
        return false;
      }

      if (u.pathname !== "/") return false;

      const oauthError =
        u.searchParams.get("googleAuthError") || u.searchParams.get("telegramAuthError") || null;
      if (!authWindow.isDestroyed()) authWindow.close();
      notifyMain({ success: !oauthError, error: oauthError, phase });
      finish({ ok: !oauthError, error: oauthError });
      return true;
    };

    authWindow.once("ready-to-show", () => {
      try {
        authWindow.show();
      } catch (_) {}
    });

    authWindow.webContents.on("did-navigate", (_event, targetUrl) => {
      tryFinishFromUrl(targetUrl, "did-navigate");
    });

    authWindow.webContents.on("did-navigate-in-page", (_event, targetUrl) => {
      tryFinishFromUrl(targetUrl, "did-navigate-in-page");
    });

    authWindow.on("closed", () => {
      if (!settled) {
        notifyMain({ success: false, error: "oauth_window_closed", phase: "closed" });
        finish({ ok: false, error: "oauth_window_closed" });
      }
    });

    authWindow.webContents.on("did-fail-load", (_event, code, desc, url) => {
      log?.(`oauth did-fail-load code=${code} ${desc} ${url}`);
    });

    authWindow
      .loadURL(authUrl)
      .catch((e) => {
        log?.(`oauth loadURL failed: ${e?.message || e}`);
        if (!authWindow.isDestroyed()) authWindow.close();
        notifyMain({ success: false, error: "oauth_load_failed", phase: "load" });
        finish({ ok: false, error: "oauth_load_failed" });
      });
  });
}

function registerOAuthIpc({ ipcMain, getMainWindow, log }) {
  ipcMain.handle("hsp-open-oauth-url", async (_event, payload) => {
    const authUrl = payload?.authUrl;
    const apiOrigin = payload?.apiOrigin;
    if (typeof authUrl !== "string" || !authUrl.trim()) {
      return { ok: false, error: "missing_auth_url" };
    }
    if (typeof apiOrigin !== "string" || !apiOrigin.trim()) {
      return { ok: false, error: "missing_api_origin" };
    }
    const parentWindow = getMainWindow?.();
    log?.(`oauth start authUrlHost=${(() => {
      try {
        return new URL(authUrl).host;
      } catch {
        return "?";
      }
    })()} apiOrigin=${apiOrigin}`);
    return openOAuthBrowserWindow({ authUrl, apiOrigin, parentWindow, log });
  });
}

module.exports = { openOAuthBrowserWindow, registerOAuthIpc };
