document.querySelector("#returnTab").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "tab:return" });
});
