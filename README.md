# Latch

Latch is a Windows + Chrome commitment lock for reducing context switching. It is developed by Resistance Labs.

It has two parts:

- an Electron desktop app that latches onto a chosen Windows foreground window;
- a Chrome extension that blocks or returns from disallowed tabs during a focus session.

## Run the desktop app

```powershell
npm install
npm start
```

The desktop app starts a local WebSocket bridge at:

```text
ws://127.0.0.1:37371
```

## Load the Chrome extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the `extension` folder in this project.
5. The extension auto-connects to the desktop app at `ws://127.0.0.1:37371`.

## Use it

1. Open the app or window you want to work in.
2. In Latch, choose it from **Desktop context** and click **Latch Window**.
3. Add allowed URL rules in the desktop app if Chrome is part of the session.
4. Select focused Chrome tabs if needed.
5. Click **Start Latch**.

If you switch away from the locked window, Latch shows a return overlay. If you switch to a disallowed Chrome tab, the extension snaps back to a focused tab.

## Package

```powershell
npm run check
npm test
npm run dist
```

Packaged desktop builds are written to `release`.

## URL rule examples

```text
docs.google.com
https://github.com/*
https://app.example.com/work
```

## Current limitations

- This is a commitment lock, not a kiosk or parental-control system.
- Windows can sometimes refuse foreground focus changes for normal apps.
- The extension must be loaded manually as an unpacked extension.
- The emergency unlock delay is fixed at 30 seconds in this MVP.
