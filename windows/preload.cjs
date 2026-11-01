const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__HSP_DESKTOP__", {
  openOAuthUrl: (authUrl, apiOrigin) => ipcRenderer.invoke("hsp-open-oauth-url", { authUrl, apiOrigin }),
  fetchSwapCoffee: (url, init) => ipcRenderer.invoke("hsp-swap-coffee-fetch", { url, ...init }),
  fetchProgramApi: (url, init) => ipcRenderer.invoke("hsp-program-api-fetch", { url, ...init }),
  /** True in the packaged Electron shell (screen share / desktop bridges). */
  isElectronShell: true,
});
