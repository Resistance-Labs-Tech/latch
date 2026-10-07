const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("latch", {
  getState: () => ipcRenderer.invoke("state:get"),
  listWindows: () => ipcRenderer.invoke("window:list"),
  lockWindow: (windowInfo) => ipcRenderer.invoke("window:lock", windowInfo),
  startSession: (options) => ipcRenderer.invoke("session:start", options),
  stopSession: () => ipcRenderer.invoke("session:stop"),
  returnToTask: () => ipcRenderer.invoke("session:return"),
  requestBrowserTabs: () => ipcRenderer.invoke("browser:request-tabs"),
  openExtensionFolder: () => ipcRenderer.invoke("app:open-extension-folder"),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("state:update", listener);
    return () => ipcRenderer.removeListener("state:update", listener);
  }
});
