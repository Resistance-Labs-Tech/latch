const els = {
  sessionStatus: document.querySelector("#sessionStatus"),
  lockedTitle: document.querySelector("#lockedTitle"),
  lockedMeta: document.querySelector("#lockedMeta"),
  foregroundTitle: document.querySelector("#foregroundTitle"),
  foregroundMeta: document.querySelector("#foregroundMeta"),
  themeToggle: document.querySelector("#themeToggle"),
  extensionStatus: document.querySelector("#extensionStatus"),
  browserMeta: document.querySelector("#browserMeta"),
  violations: document.querySelector("#violations"),
  lastViolation: document.querySelector("#lastViolation"),
  bridgeUrl: document.querySelector("#bridgeUrl"),
  duration: document.querySelector("#duration"),
  allowedUrls: document.querySelector("#allowedUrls"),
  refreshTabs: document.querySelector("#refreshTabs"),
  tabList: document.querySelector("#tabList"),
  windowList: document.querySelector("#windowList"),
  refreshWindows: document.querySelector("#refreshWindows"),
  lockSelected: document.querySelector("#lockSelected"),
  startSession: document.querySelector("#startSession"),
  stopSession: document.querySelector("#stopSession"),
  openExtension: document.querySelector("#openExtension")
};

let latestState;
let visibleWindows = [];
let selectedFocusedTabIds = new Set();

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function setTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("latch.theme", next);
  if (els.themeToggle) {
    els.themeToggle.textContent = next === "dark" ? "Light" : "Dark";
    els.themeToggle.setAttribute("aria-label", `Switch to ${next === "dark" ? "light" : "dark"} mode`);
  }
}

function formatWindow(windowInfo) {
  if (!windowInfo) return { title: "None", meta: "" };
  return {
    title: windowInfo.title || "(Untitled window)",
    meta: `${windowInfo.processName || "unknown"} · hwnd ${windowInfo.hwnd}`
  };
}

function render(state) {
  latestState = state;
  const locked = formatWindow(state.lockedWindow);
  const foreground = formatWindow(state.currentForeground);
  const active = state.session.active;

  els.sessionStatus.textContent = active ? "Locked" : "Idle";
  els.sessionStatus.classList.toggle("active", active);
  els.lockedTitle.textContent = state.lockedWindow ? locked.title : "No window selected";
  els.lockedMeta.textContent = state.lockedWindow ? locked.meta : "Pick the desktop surface this session should protect.";
  els.foregroundTitle.textContent = foreground.title;
  els.foregroundMeta.textContent = foreground.meta;
  els.extensionStatus.textContent = state.extensionConnected ? "Connected" : "Not connected";
  els.browserMeta.textContent = state.extensionConnected
    ? browserStatusText(state.browser)
    : "Load the Latch extension; it auto-connects.";
  els.violations.textContent = String(state.session.violations || 0);
  els.bridgeUrl.textContent = state.bridgeUrl;
  els.duration.value = state.session.durationMinutes || 25;

  if (Array.isArray(state.session.allowedUrlRules) && !els.allowedUrls.matches(":focus")) {
    els.allowedUrls.value = state.session.allowedUrlRules.join("\n");
  }

  renderBrowserTabs(state.browser?.openTabs || [], state.session.focusedTabIds || []);

  if (state.session.lastViolation) {
    const date = new Date(state.session.lastViolation.at);
    els.lastViolation.textContent = `${date.toLocaleTimeString()} · ${state.session.lastViolation.processName}`;
  } else {
    els.lastViolation.textContent = "None this session";
  }

  els.startSession.disabled = active;
  els.stopSession.disabled = !active;
  els.refreshTabs.disabled = active;
}

function collectOptions() {
  return {
    durationMinutes: Number(els.duration.value || 25),
    allowedUrlRules: els.allowedUrls.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    focusedTabIds: [...selectedFocusedTabIds]
  };
}

function formatTabUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname + parsed.pathname;
  } catch {
    return url || "No URL";
  }
}

function browserStatusText(browser = {}) {
  if (browser.openTabs?.length) {
    return `${browser.openTabs.length} tabs detected · ${browser.activeTabTitle || browser.activeTabUrl || "Browser guard is listening."}`;
  }
  if (browser.tabReportCount > 0) {
    return "Extension responded, but reported no tabs. Reload the extension if this looks wrong.";
  }
  return browser.activeTabTitle || browser.activeTabUrl || "Connected; waiting for tab report.";
}

function renderBrowserTabs(tabs, activeFocusedTabIds) {
  if (!els.tabList) return;
  const active = latestState?.session?.active;
  const incomingIds = new Set((activeFocusedTabIds || []).map(Number));

  if (active) {
    selectedFocusedTabIds = incomingIds;
  } else {
    for (const tabId of incomingIds) selectedFocusedTabIds.add(Number(tabId));
    selectedFocusedTabIds = new Set([...selectedFocusedTabIds].filter((tabId) => tabs.some((tab) => Number(tab.id) === Number(tabId))));
  }

  els.tabList.innerHTML = "";

  if (!latestState?.extensionConnected) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Load the Latch Chrome extension to see open tabs.";
    els.tabList.append(empty);
    return;
  }

  if (!tabs.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = latestState?.browser?.tabReportCount > 0
      ? "The extension responded, but did not report any tabs. Reload it from chrome://extensions if this looks wrong."
      : "Waiting for the extension to report tabs. Click Refresh Tabs if needed.";
    els.tabList.append(empty);
    return;
  }

  for (const tab of tabs) {
    const tabId = Number(tab.id);
    const row = document.createElement("label");
    row.className = "tab-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedFocusedTabIds.has(tabId);
    checkbox.disabled = active;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedFocusedTabIds.add(tabId);
      else selectedFocusedTabIds.delete(tabId);
    });

    const body = document.createElement("span");
    body.className = "tab-body";

    const title = document.createElement("strong");
    title.textContent = tab.title || "(Untitled tab)";

    const meta = document.createElement("small");
    meta.textContent = `${tab.active ? "Active · " : ""}${formatTabUrl(tab.url)}`;

    body.append(title, meta);
    row.append(checkbox, body);
    els.tabList.append(row);
  }
}

function renderWindowList(windows) {
  visibleWindows = windows;
  els.windowList.innerHTML = "";

  if (!visibleWindows.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No visible windows found";
    els.windowList.append(option);
    els.lockSelected.disabled = true;
    return;
  }

  for (const windowInfo of visibleWindows) {
    const option = document.createElement("option");
    option.value = String(windowInfo.hwnd);
    option.textContent = `${windowInfo.processName || "unknown"} · ${windowInfo.title || "(Untitled window)"}`;
    els.windowList.append(option);
  }

  if (latestState?.lockedWindow?.hwnd) {
    els.windowList.value = String(latestState.lockedWindow.hwnd);
  }

  els.lockSelected.disabled = false;
}

async function refreshWindows() {
  els.refreshWindows.disabled = true;
  els.refreshWindows.textContent = "Refreshing";
  renderWindowList(await window.latch.listWindows());
  els.refreshWindows.textContent = "Refresh";
  els.refreshWindows.disabled = false;
}

els.refreshWindows.addEventListener("click", refreshWindows);

els.lockSelected.addEventListener("click", async () => {
  const selected = visibleWindows.find((windowInfo) => String(windowInfo.hwnd) === els.windowList.value);
  if (!selected) return;
  render(await window.latch.lockWindow(selected));
});

els.startSession.addEventListener("click", async () => {
  render(await window.latch.startSession(collectOptions()));
});

els.stopSession.addEventListener("click", async () => {
  render(await window.latch.stopSession());
});

els.openExtension.addEventListener("click", () => {
  window.latch.openExtensionFolder();
});

els.refreshTabs.addEventListener("click", async () => {
  els.refreshTabs.disabled = true;
  els.refreshTabs.textContent = "Refreshing";
  render(await window.latch.requestBrowserTabs());
  setTimeout(() => {
    els.refreshTabs.textContent = "Refresh Tabs";
    els.refreshTabs.disabled = Boolean(latestState?.session?.active);
  }, 500);
});

els.themeToggle.addEventListener("click", () => {
  setTheme(currentTheme() === "dark" ? "light" : "dark");
});

window.latch.onState(render);
window.latch.getState().then((state) => {
  setTheme(currentTheme());
  render(state);
  refreshWindows();
  window.latch.requestBrowserTabs();
});

setInterval(() => {
  if (!latestState || !latestState.session.active || !latestState.session.endsAt) return;
  const remaining = Math.max(0, latestState.session.endsAt - Date.now());
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  els.sessionStatus.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
}, 1000);
