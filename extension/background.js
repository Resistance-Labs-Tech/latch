import { isUrlAllowed, normalizeRules } from "./url-rules.mjs";

const DEFAULT_BRIDGE_URL = "ws://127.0.0.1:37371";

let socket;
let reconnectTimer;
let reportTabsTimer;
let snapBackUntil = 0;
let lastToastAt = 0;
let desktopSession = {
  active: false,
  allowedUrlRules: [],
  focusedTabIds: []
};

let localState = {
  bridgeUrl: DEFAULT_BRIDGE_URL,
  lastAllowedTabId: null
};

async function loadState() {
  const saved = await chrome.storage.local.get(localState);
  localState = { ...localState, ...saved };
}

async function saveState(patch) {
  localState = { ...localState, ...patch };
  await chrome.storage.local.set(patch);
}

function activeRules() {
  return normalizeRules(desktopSession.allowedUrlRules);
}

function isGuardActive() {
  return Boolean(desktopSession.active);
}

function allowed(tab) {
  if (!tab) return false;
  if (desktopSession.focusedTabIds.map(Number).includes(Number(tab.id))) return true;
  return isUrlAllowed(tab.url || tab.pendingUrl || "", activeRules());
}

function sendToDesktop(message) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function reportTab(tab) {
  if (!tab) return;
  sendToDesktop({
    type: "extension:tab",
    title: tab.title || "",
    url: tab.url || tab.pendingUrl || ""
  });
}

async function reportTabs() {
  const tabs = await chrome.tabs.query({}).catch((error) => {
    sendToDesktop({
      type: "extension:tabs",
      error: error?.message || "Unable to query tabs",
      tabs: []
    });
    return [];
  });
  sendToDesktop({
    type: "extension:tabs",
    at: Date.now(),
    tabs: tabs.map((tab) => ({
      id: tab.id,
      title: tab.title || "",
      url: tab.url || tab.pendingUrl || "",
      windowId: tab.windowId,
      active: Boolean(tab.active),
      pinned: Boolean(tab.pinned),
      audible: Boolean(tab.audible)
    }))
  });
}

function scheduleReportTabs() {
  clearTimeout(reportTabsTimer);
  reportTabsTimer = setTimeout(reportTabs, 150);
}

function showCommitmentToast() {
  const now = Date.now();
  if (now - lastToastAt < 9000) return;
  lastToastAt = now;

  chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icon.svg"),
    title: "Latch is holding the line",
    message: "Return is the discipline. Keep faith with the task."
  });
}

async function findSnapBackTarget(attemptedTabId) {
  if (localState.lastAllowedTabId && Number(localState.lastAllowedTabId) !== Number(attemptedTabId)) {
    const lastAllowed = await chrome.tabs.get(localState.lastAllowedTabId).catch(() => null);
    if (lastAllowed && allowed(lastAllowed)) return lastAllowed;
  }

  const tabs = await chrome.tabs.query({}).catch(() => []);
  const focused = tabs.find((tab) => Number(tab.id) !== Number(attemptedTabId) && desktopSession.focusedTabIds.map(Number).includes(Number(tab.id)));
  if (focused) return focused;

  return tabs.find((tab) => Number(tab.id) !== Number(attemptedTabId) && allowed(tab));
}

async function guardTab(tabId) {
  if (!isGuardActive()) return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return;

  if (Date.now() < snapBackUntil && allowed(tab)) {
    await saveState({ lastAllowedTabId: tab.id });
    reportTab(tab);
    return;
  }

  if (allowed(tab)) {
    await saveState({ lastAllowedTabId: tab.id });
    reportTab(tab);
    return;
  }

  sendToDesktop({
    type: "extension:block",
    title: tab.title || "",
    url: tab.url || tab.pendingUrl || ""
  });

  const target = await findSnapBackTarget(tab.id);
  showCommitmentToast();

  if (target) {
    snapBackUntil = Date.now() + 650;
    await saveState({ lastAllowedTabId: target.id });
    if (target.windowId) await chrome.windows.update(target.windowId, { focused: true }).catch(() => null);
    await chrome.tabs.update(target.id, { active: true }).catch(() => null);
    reportTab(target);
  }
}

function connectBridge() {
  clearTimeout(reconnectTimer);

  const url = localState.bridgeUrl || DEFAULT_BRIDGE_URL;
  socket = new WebSocket(url);

  socket.addEventListener("open", async () => {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    socket.send(
      JSON.stringify({
        type: "extension:status",
        connected: true,
        activeTabTitle: activeTab?.title || "",
        activeTabUrl: activeTab?.url || activeTab?.pendingUrl || ""
      })
    );
    await reportTabs();
  });

  socket.addEventListener("message", async (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message.type === "session:update") {
      desktopSession = {
        active: Boolean(message.session?.active),
        allowedUrlRules: normalizeRules(message.session?.allowedUrlRules || []),
        focusedTabIds: Array.isArray(message.session?.focusedTabIds) ? message.session.focusedTabIds.map(Number).filter(Number.isFinite) : []
      };

      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab) await guardTab(activeTab.id);
      await reportTabs();
    }

    if (message.type === "tabs:request") {
      await reportTabs();
    }
  });

  socket.addEventListener("close", () => {
    reconnectTimer = setTimeout(connectBridge, 1500);
  });

  socket.addEventListener("error", () => {
    socket.close();
  });
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  guardTab(activeInfo.tabId);
  scheduleReportTabs();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.status === "complete")) {
    guardTab(tabId);
  }
  if (changeInfo.url || changeInfo.title || changeInfo.status === "complete") {
    scheduleReportTabs();
  }
});

chrome.tabs.onCreated.addListener(() => {
  scheduleReportTabs();
});

chrome.tabs.onRemoved.addListener(() => {
  scheduleReportTabs();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "state:get") {
      await loadState();
      await reportTabs();
      sendResponse({ localState, desktopSession, guardActive: isGuardActive(), connected: socket?.readyState === WebSocket.OPEN });
      return;
    }

    if (message.type === "bridge:save") {
      await saveState({
        bridgeUrl: message.bridgeUrl || DEFAULT_BRIDGE_URL
      });
      if (socket) socket.close();
      connectBridge();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "tab:return") {
      if (localState.lastAllowedTabId) {
        await chrome.tabs.update(localState.lastAllowedTabId, { active: true }).catch(() => null);
      }
      sendResponse({ ok: true });
    }
  })();

  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  await loadState();
});

loadState().then(connectBridge);
