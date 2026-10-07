const detail = document.querySelector("#overlayDetail");
const countdown = document.querySelector("#unlockCountdown");
const returnNow = document.querySelector("#returnNow");
const unlockDelay = document.querySelector("#unlockDelay");

let unlockTimer;

returnNow.addEventListener("click", () => {
  window.latch.returnToTask();
});

unlockDelay.addEventListener("click", () => {
  clearInterval(unlockTimer);
  let remaining = 30;
  unlockDelay.disabled = true;
  countdown.textContent = `Emergency unlock available in ${remaining}s.`;

  unlockTimer = setInterval(async () => {
    remaining -= 1;
    countdown.textContent = remaining > 0 ? `Emergency unlock available in ${remaining}s.` : "Ending session...";
    if (remaining <= 0) {
      clearInterval(unlockTimer);
      await window.latch.stopSession();
      unlockDelay.disabled = false;
      countdown.textContent = "";
    }
  }, 1000);
});

window.latch.onState((state) => {
  const locked = state.lockedWindow;
  detail.textContent = locked ? `Locked to ${locked.processName}: ${locked.title || "(Untitled window)"}` : "This session is still active.";
});
