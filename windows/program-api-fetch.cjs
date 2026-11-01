const SESSION_COOKIE = "hs_auth_session";

function resolveApiOrigin(getApiOrigin) {
  try {
    const raw = typeof getApiOrigin === "function" ? getApiOrigin() : "";
    const origin = new URL(String(raw || "https://program.hyperlinks.space").trim()).origin;
    return origin;
  } catch {
    return "https://program.hyperlinks.space";
  }
}

function isAllowedProgramApiUrl(raw, apiOrigin) {
  try {
    const u = new URL(String(raw || "").trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (u.origin !== apiOrigin) return false;
    return u.pathname.includes("/api");
  } catch {
    return false;
  }
}

function mergeSessionCookieHeader(existingCookie, sessionCookieValue) {
  if (!sessionCookieValue) return existingCookie || undefined;
  const pair = `${SESSION_COOKIE}=${sessionCookieValue}`;
  if (!existingCookie) return pair;
  if (existingCookie.includes(`${SESSION_COOKIE}=`)) return existingCookie;
  return `${existingCookie}; ${pair}`;
}

/**
 * Renderer fetch from app:// to program.hyperlinks.space cannot rely on Cookie headers
 * (cross-site) and may lose Authorization if a net filter strips it. Main-process
 * net.fetch with the default session sends OAuth cookies reliably.
 */
function registerProgramApiFetchIpc({ ipcMain, net, session, log, getApiOrigin }) {
  ipcMain.handle("hsp-program-api-fetch", async (_event, payload) => {
    const apiOrigin = resolveApiOrigin(getApiOrigin);
    const url = payload?.url;
    if (!isAllowedProgramApiUrl(url, apiOrigin)) {
      return { ok: false, error: "blocked_url" };
    }

    const timeoutMs = Math.min(Math.max(Number(payload?.timeoutMs) || 60_000, 5_000), 120_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers = { ...(payload?.headers || {}) };
    const bearer = typeof payload?.bearerToken === "string" ? payload.bearerToken.trim() : "";
    if (bearer && !Object.keys(headers).some((k) => k.toLowerCase() === "authorization")) {
      headers.Authorization = `Bearer ${bearer}`;
    }

    let sessionCookieValue = null;
    try {
      const cookies = await session.defaultSession.cookies.get({
        url: `${apiOrigin}/`,
        name: SESSION_COOKIE,
      });
      sessionCookieValue = cookies[0]?.value ?? null;
    } catch (_) {
      sessionCookieValue = null;
    }

    const existingCookieKey = Object.keys(headers).find((k) => k.toLowerCase() === "cookie");
    const existingCookie = existingCookieKey ? headers[existingCookieKey] : null;
    const merged = mergeSessionCookieHeader(existingCookie, sessionCookieValue);
    if (merged) {
      if (existingCookieKey) delete headers[existingCookieKey];
      headers.Cookie = merged;
    }

    const pathForLog = (() => {
      try {
        return new URL(url).pathname;
      } catch {
        return "?";
      }
    })();

    try {
      const res = await net.fetch(url, {
        method: payload?.method || "GET",
        headers,
        body: payload?.body,
        signal: controller.signal,
        session: session.defaultSession,
      });
      const contentType = res.headers.get("content-type") || "";
      const wantBinary =
        payload?.responseType === "arrayBuffer" ||
        payload?.binary === true ||
        /^audio\//i.test(contentType) ||
        /\/api\/telegram-messages-(profile-audio|media)/i.test(pathForLog);

      if (wantBinary) {
        const ab = await res.arrayBuffer();
        const bodyBase64 = Buffer.from(ab).toString("base64");
        try {
          log(
            `[program-api-fetch] ${payload?.method || "GET"} ${pathForLog} status=${res.status} binary=${ab.byteLength}B bearer=${Boolean(bearer)} sessionCookie=${Boolean(sessionCookieValue)}`,
          );
        } catch (_) {}
        return {
          ok: true,
          status: res.status,
          bodyBase64,
          contentType,
          debug: {
            bearer: Boolean(bearer),
            sessionCookie: Boolean(sessionCookieValue),
            bytes: ab.byteLength,
          },
        };
      }

      const body = await res.text();
      try {
        log(
          `[program-api-fetch] ${payload?.method || "GET"} ${pathForLog} status=${res.status} bearer=${Boolean(bearer)} sessionCookie=${Boolean(sessionCookieValue)}`,
        );
      } catch (_) {}
      return {
        ok: true,
        status: res.status,
        body,
        debug: {
          bearer: Boolean(bearer),
          sessionCookie: Boolean(sessionCookieValue),
        },
      };
    } catch (e) {
      const msg =
        e?.name === "AbortError"
          ? `API request timed out after ${timeoutMs}ms`
          : e?.message || String(e);
      try {
        log(`[program-api-fetch] ${pathForLog} error=${msg}`);
      } catch (_) {}
      return { ok: false, error: msg };
    } finally {
      clearTimeout(timer);
    }
  });
}

/** Runs after the Expo bundle so it wraps installDesktopAuthFetch. */
const PROGRAM_API_FETCH_SHIM = `(function(){try{var d=window.__HSP_DESKTOP__;if(!d||typeof d.fetchProgramApi!=="function"||window.__HSP_PROGRAM_API_FETCH_SHIM__)return;window.__HSP_PROGRAM_API_FETCH_SHIM__=true;var API_ORIGIN=(function(){try{var m=document.querySelector('meta[name="hsp-api-origin"]');if(m&&m.content)return m.content.replace(/\\/$/,"");}catch(e){}return"https://program.hyperlinks.space";})();function isOurApi(url){try{var u=new URL(url);return u.origin===API_ORIGIN&&u.pathname.indexOf("/api")!==-1}catch(e){return false}}function plainHeaders(h){var out={Accept:"application/json"};if(!h)return out;if(typeof Headers!=="undefined"&&h instanceof Headers){h.forEach(function(v,k){out[k]=v});return out}if(typeof h==="object"){for(var k in h){if(Object.prototype.hasOwnProperty.call(h,k))out[k]=h[k]}}return out}function readDesktopToken(){try{var t=localStorage.getItem("hs_desktop_session_token_v1");return t&&t.trim?t.trim():""}catch(e){return""}}var prevFetch=globalThis.fetch.bind(globalThis);globalThis.fetch=function(input,init){var url=typeof input==="string"?input:(input instanceof URL?input.href:(input&&input.url?input.url:String(input)));if(url&&isOurApi(url)){var token=readDesktopToken();return d.fetchProgramApi(url,{method:(init&&init.method)||"GET",headers:plainHeaders(init&&init.headers),body:init&&typeof init.body==="string"?init.body:void 0,bearerToken:token||void 0,timeoutMs:60000}).then(function(result){if(!result||!result.ok){var err=result&&result.error?result.error:"program API fetch failed";return Promise.reject(new Error(err))}return new Response(result.body||"",{status:result.status||200,headers:{"Content-Type":"application/json"}})})}return prevFetch(input,init)};console.log("[hsp] program API fetch shim installed",API_ORIGIN)}catch(e){console.error("[hsp] program API fetch shim failed",e)}})();`;

function installProgramApiRendererFetchShim(webContents, log, getApiOrigin) {
  if (!webContents || webContents.isDestroyed()) return;
  const apiOrigin = resolveApiOrigin(getApiOrigin);
  const inject = () => {
    if (webContents.isDestroyed()) return;
    webContents
      .executeJavaScript(
        `(function(){try{var m=document.querySelector('meta[name="hsp-api-origin"]');if(!m){m=document.createElement("meta");m.name="hsp-api-origin";m.content=${JSON.stringify(apiOrigin)};document.head.appendChild(m);}else{m.content=${JSON.stringify(apiOrigin)};}}catch(e){}})();`,
        true,
      )
      .catch(() => {});
    webContents
      .executeJavaScript(PROGRAM_API_FETCH_SHIM, true)
      .catch((e) => {
        try {
          log(`[program-api-fetch] shim inject failed: ${e?.message || e}`);
        } catch (_) {}
      });
  };
  webContents.on("dom-ready", inject);
  webContents.on("did-finish-load", inject);
}

module.exports = {
  registerProgramApiFetchIpc,
  installProgramApiRendererFetchShim,
  resolveApiOrigin,
};
