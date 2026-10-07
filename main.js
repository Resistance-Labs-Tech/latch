const { app, BrowserWindow, Menu, ipcMain, session, shell } = require("electron");
const { execFile, spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const BRIDGE_PORT = 37371;
const APP_NAME = "Latch";

let mainWindow;
let overlayWindow;
let monitorProcess;
let wss;
let lineBuffer = "";
let lastViolationAt = 0;
let endingTimer;
let guardTimer;
let tabRequestTimer;
let returnGraceUntil = 0;

const state = {
  token: "",
  bridgeUrl: `ws://127.0.0.1:${BRIDGE_PORT}`,
  extensionConnected: false,
  browser: {
    activeTabTitle: "",
    activeTabUrl: "",
    openTabs: [],
    tabsLastSeenAt: null,
    tabReportCount: 0,
    lastBlockedUrl: "",
    lastBlockedAt: null
  },
  currentForeground: null,
  lockedWindow: null,
  session: {
    active: false,
    endsAt: null,
    startedAt: null,
    durationMinutes: 25,
    allowedUrlRules: [],
    focusedTabIds: [],
    violations: 0,
    lastViolation: null
  }
};

function getConfigPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function loadConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    state.token = crypto.randomBytes(12).toString("hex");
    saveConfig();
    return;
  }

  try {
    const saved = JSON.parse(fs.readFileSync(configPath, "utf8"));
    state.token = saved.token || crypto.randomBytes(12).toString("hex");
    state.session.durationMinutes = saved.durationMinutes || 25;
    state.session.allowedUrlRules = Array.isArray(saved.allowedUrlRules) ? saved.allowedUrlRules : [];
  } catch {
    state.token = crypto.randomBytes(12).toString("hex");
  }

  saveConfig();
}

function saveConfig() {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        token: state.token,
        durationMinutes: state.session.durationMinutes,
        allowedUrlRules: state.session.allowedUrlRules
      },
      null,
      2
    )
  );
}

function publicState() {
  return {
    bridgeUrl: state.bridgeUrl,
    token: state.token,
    extensionConnected: state.extensionConnected,
    browser: state.browser,
    currentForeground: state.currentForeground,
    lockedWindow: state.lockedWindow,
    session: state.session
  };
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(channel, payload);
  }
}

function broadcastSession() {
  const payload = {
    type: "session:update",
    session: {
      active: state.session.active,
      endsAt: state.session.endsAt,
      allowedUrlRules: state.session.allowedUrlRules,
      focusedTabIds: state.session.focusedTabIds
    }
  };

  if (wss) {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN && client.isPaired) {
        client.send(JSON.stringify(payload));
      }
    }
  }

  sendToRenderer("state:update", publicState());
}

function sendToExtensionClients(message) {
  if (!wss) return;
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN && client.isPaired) {
      client.send(JSON.stringify(message));
    }
  }
}

function requestBrowserTabs() {
  sendToExtensionClients({ type: "tabs:request" });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 700,
    title: APP_NAME,
    backgroundColor: "#f8f5ec",
    icon: path.join(__dirname, "assets", "latch.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "desktop", "index.html"));
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    show: false,
    fullscreen: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    title: `${APP_NAME} Return`,
    backgroundColor: "#111416",
    icon: path.join(__dirname, "assets", "latch.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.loadFile(path.join(__dirname, "desktop", "overlay.html"));
  overlayWindow.on("close", (event) => {
    if (state.session.active) {
      event.preventDefault();
      overlayWindow.hide();
      focusLockedWindow();
    }
  });
}

function startBridge() {
  wss = new WebSocket.Server({ port: BRIDGE_PORT, host: "127.0.0.1" });

  wss.on("connection", (socket, request) => {
    socket.isPaired = request.socket.remoteAddress === "127.0.0.1" || request.socket.remoteAddress === "::1" || request.socket.remoteAddress === "::ffff:127.0.0.1";
    if (!socket.isPaired) {
      socket.close(1008, "Local bridge only");
      return;
    }

    state.extensionConnected = true;
    sendToRenderer("state:update", publicState());
    socket.send(JSON.stringify({ type: "bridge:hello", app: APP_NAME }));
    socket.send(
      JSON.stringify({
        type: "session:update",
        session: {
          active: state.session.active,
          endsAt: state.session.endsAt,
          allowedUrlRules: state.session.allowedUrlRules,
          focusedTabIds: state.session.focusedTabIds
        }
      })
    );
    socket.send(JSON.stringify({ type: "tabs:request" }));

    socket.on("message", (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (message.type === "extension:status") {
        state.extensionConnected = true;
        state.browser.activeTabTitle = message.activeTabTitle || state.browser.activeTabTitle;
        state.browser.activeTabUrl = message.activeTabUrl || state.browser.activeTabUrl;
        sendToRenderer("state:update", publicState());
      }

      if (message.type === "extension:tab") {
        state.browser.activeTabTitle = message.title || "";
        state.browser.activeTabUrl = message.url || "";
        sendToRenderer("state:update", publicState());
      }

      if (message.type === "extension:tabs") {
        state.browser.openTabs = Array.isArray(message.tabs) ? message.tabs : [];
        state.browser.tabsLastSeenAt = Date.now();
        state.browser.tabReportCount += 1;
        const previousFocusedTabIds = state.session.focusedTabIds.join(",");
        state.session.focusedTabIds = state.session.focusedTabIds.filter((tabId) =>
          state.browser.openTabs.some((tab) => Number(tab.id) === Number(tabId))
        );
        const focusedTabIdsChanged = previousFocusedTabIds !== state.session.focusedTabIds.join(",");
        sendToRenderer("state:update", publicState());
        if (state.session.active && focusedTabIdsChanged) broadcastSession();
      }

      if (message.type === "extension:block") {
        state.browser.lastBlockedUrl = message.url || "";
        state.browser.lastBlockedAt = Date.now();
        sendToRenderer("state:update", publicState());
      }
    });

    socket.on("close", () => {
      state.extensionConnected = [...wss.clients].some((client) => client.readyState === WebSocket.OPEN && client.isPaired);
      sendToRenderer("state:update", publicState());
    });
  });
}

function startWindowMonitor() {
  const scriptPath = path.join(__dirname, "windows", "monitor-window.ps1");
  monitorProcess = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
    windowsHide: true
  });

  monitorProcess.stdout.on("data", (chunk) => {
    lineBuffer += chunk.toString();
    const lines = lineBuffer.split(/\r?\n/);
    lineBuffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        handleForeground(JSON.parse(line));
      } catch {
        // Ignore malformed monitor output.
      }
    }
  });

  monitorProcess.on("exit", () => {
    if (!app.isQuiting) {
      setTimeout(startWindowMonitor, 1000);
    }
  });
}

function isElectronOwnWindow(foreground) {
  if (!foreground) return false;
  const title = foreground.title || "";
  return title.includes(APP_NAME);
}

function isLockedWindow(foreground) {
  if (!foreground || !state.lockedWindow) return false;
  if (String(foreground.hwnd) === String(state.lockedWindow.hwnd)) return true;

  const sameProcess = foreground.processName === state.lockedWindow.processName;
  const sameTitle = foreground.title === state.lockedWindow.title;
  return sameProcess && sameTitle;
}

function handleForeground(foreground) {
  state.currentForeground = foreground;
  sendToRenderer("state:update", publicState());
  enforceLock(foreground);
}

function shouldBlockForeground(foreground) {
  if (Date.now() < returnGraceUntil) return false;
  if (!state.session.active) return;
  if (!state.lockedWindow) return;
  if (isElectronOwnWindow(foreground)) return false;
  if (isLockedWindow(foreground)) return false;
  return true;
}

function enforceLock(foreground = state.currentForeground, options = {}) {
  if (!shouldBlockForeground(foreground)) return;

  const now = Date.now();
  if (options.countViolation !== false && now - lastViolationAt >= 1200) {
    lastViolationAt = now;
    state.session.violations += 1;
    state.session.lastViolation = {
      at: now,
      title: foreground?.title || "",
      processName: foreground?.processName || ""
    };
  }

  showOverlay();
  broadcastSession();
}

function showOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) createOverlayWindow();
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.show();
  overlayWindow.focus();
  overlayWindow.moveTop();
}

function hideOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
}

function focusLockedWindow() {
  if (!state.lockedWindow || !state.lockedWindow.hwnd) return;
  const scriptPath = path.join(__dirname, "windows", "focus-window.ps1");
  spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, String(state.lockedWindow.hwnd)], {
    windowsHide: true,
    detached: true,
    stdio: "ignore"
  }).unref();
}

function returnToLockedWindow() {
  returnGraceUntil = Date.now() + 1800;
  hideOverlay();

  for (const delay of [0, 120, 300, 650]) {
    setTimeout(() => focusLockedWindow(), delay);
  }
}

function listWindows() {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, "windows", "list-windows.ps1");
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { windowsHide: true, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve([]);
          return;
        }

        try {
          const parsed = JSON.parse(stdout);
          const windows = Array.isArray(parsed) ? parsed : [parsed];
          resolve(windows.filter((windowInfo) => windowInfo && !isElectronOwnWindow(windowInfo)));
        } catch {
          resolve([]);
        }
      }
    );
  });
}

function startSession(options) {
  const durationMinutes = Number(options.durationMinutes) > 0 ? Number(options.durationMinutes) : 25;
  const allowedUrlRules = Array.isArray(options.allowedUrlRules) ? options.allowedUrlRules.filter(Boolean) : [];
  const focusedTabIds = Array.isArray(options.focusedTabIds) ? options.focusedTabIds.map(Number).filter(Number.isFinite) : [];

  if (!state.lockedWindow && state.currentForeground && !isElectronOwnWindow(state.currentForeground)) {
    state.lockedWindow = state.currentForeground;
  }

  state.session.active = true;
  state.session.startedAt = Date.now();
  state.session.durationMinutes = durationMinutes;
  state.session.endsAt = Date.now() + durationMinutes * 60 * 1000;
  state.session.allowedUrlRules = allowedUrlRules;
  state.session.focusedTabIds = focusedTabIds;
  state.session.violations = 0;
  state.session.lastViolation = null;
  saveConfig();

  clearTimeout(endingTimer);
  endingTimer = setTimeout(() => stopSession(), durationMinutes * 60 * 1000);
  clearInterval(guardTimer);
  guardTimer = setInterval(() => enforceLock(state.currentForeground, { countViolation: false }), 350);
  broadcastSession();
}

function stopSession() {
  state.session.active = false;
  state.session.endsAt = null;
  state.session.startedAt = null;
  hideOverlay();
  clearTimeout(endingTimer);
  clearInterval(guardTimer);
  broadcastSession();
}

ipcMain.handle("state:get", () => publicState());
ipcMain.handle("window:list", () => listWindows());
ipcMain.handle("window:lock", (_event, windowInfo) => {
  if (windowInfo && windowInfo.hwnd) {
    state.lockedWindow = windowInfo;
  }
  sendToRenderer("state:update", publicState());
  return publicState();
});
ipcMain.handle("session:start", (_event, options) => {
  startSession(options || {});
  return publicState();
});
ipcMain.handle("session:stop", () => {
  stopSession();
  return publicState();
});
ipcMain.handle("session:return", () => {
  returnToLockedWindow();
  return publicState();
});
ipcMain.handle("browser:request-tabs", () => {
  requestBrowserTabs();
  return publicState();
});
ipcMain.handle("app:open-extension-folder", () => {
  shell.openPath(path.join(__dirname, "extension"));
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  loadConfig();
  createMainWindow();
  createOverlayWindow();
  startBridge();
  startWindowMonitor();
  tabRequestTimer = setInterval(() => {
    if (state.extensionConnected) requestBrowserTabs();
  }, 2500);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  app.isQuiting = true;
  if (monitorProcess) monitorProcess.kill();
  clearInterval(tabRequestTimer);
  if (wss) wss.close();
});
