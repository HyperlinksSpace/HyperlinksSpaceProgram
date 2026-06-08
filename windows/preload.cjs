const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__HSP_DESKTOP__", {
  openOAuthUrl: (authUrl, apiOrigin) => ipcRenderer.invoke("hsp-open-oauth-url", { authUrl, apiOrigin }),
});
