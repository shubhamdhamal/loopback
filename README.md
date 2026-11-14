# Auto Refresher

A lightweight browser extension that automatically refreshes the active tab on a user-defined timer.

## Features

- Start or stop auto-refresh from the extension popup
- Set refresh interval in seconds
- Refresh only the currently active tab
- Avoid reloading special browser pages like chrome://
- Saves the settings locally in the browser

## Files

- manifest.json — browser extension manifest
- background.js — timer and tab reload logic
- popup.html — popup UI
- popup.css — popup styling
- popup.js — popup interaction handling

## How to load in Chrome or Edge

1. Open the browser and go to chrome://extensions or edge://extensions.
2. Turn on Developer mode.
3. Click Load unpacked.
4. Select this project folder.
5. Click the extension icon and choose your refresh interval.

## Privacy

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for details about data handling.

## Basic behavior

- When the user clicks Start refresh, the extension schedules a reload loop for the active tab.
- The timer uses the value in the popup and repeats until the user stops it.
- Settings are preserved in browser storage.

## Upload to GitHub

For the empty repository `https://github.com/shubhamdhamal/loopback.git`, open PowerShell in this project folder and run:

```powershell
git init
git add .
git commit -m "Initial Auto Refresher extension"
git branch -M main
git remote add origin https://github.com/shubhamdhamal/loopback.git
git push -u origin main
```

If Git says a remote named `origin` already exists, use `git remote set-url origin https://github.com/shubhamdhamal/loopback.git` instead of the `git remote add` command. GitHub may ask you to authenticate in your browser.
