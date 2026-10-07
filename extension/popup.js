const bridgeUrl = document.querySelector("#bridgeUrl");
const allowedRules = document.querySelector("#allowedRules");
const guardStatus = document.querySelector("#guardStatus");
const connectionDot = document.querySelector("#connectionDot");
const connectionStatus = document.querySelector("#connectionStatus");
const saveBridge = document.querySelector("#saveBridge");

function send(message) {
  return chrome.runtime.sendMessage(message);
}

async function refresh() {
  const state = await send({ type: "state:get" });
  bridgeUrl.value = state.localState.bridgeUrl || "ws://127.0.0.1:37371";
  allowedRules.textContent = (state.desktopSession.allowedUrlRules || []).join("\n") || "No desktop session rules yet.";
  guardStatus.textContent = state.guardActive ? "Locked" : "Idle";
  connectionStatus.textContent = state.connected ? "Connected" : "Waiting for app";
  connectionDot.classList.toggle("connected", Boolean(state.connected));
}

saveBridge.addEventListener("click", async () => {
  await send({ type: "bridge:save", bridgeUrl: bridgeUrl.value.trim() });
  refresh();
});

refresh();
setInterval(refresh, 1500);
