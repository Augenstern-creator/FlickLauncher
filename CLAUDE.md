# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install          # Install dependencies
pnpm start            # Run in dev mode (electron .)
pnpm build            # Package for Windows (NSIS installer → build/)
pnpm build:dir        # Package unpacked (for testing without installer)
```

No test runner or linter is configured.

### Manual testing shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Shift+Space` | Toggle window visibility (global, configurable) |
| `Ctrl+F` | Focus search input |
| `ESC` | Close open modals |
| Right-click a shortcut icon | Context menu (edit/move/delete) |
| Right-click a category tab | Rename/delete category |
| Drag a shortcut icon | Reorder within grid |

## Architecture

This is an Electron desktop app (Windows-only target) built with vanilla HTML/CSS/JS — no frontend framework. It uses a standard Electron three-process split:

### Main Process (`main.js`)
Entry point. Creates a frameless `BrowserWindow`, initializes all modules, and registers all IPC handlers. The window hides to the system tray on close instead of quitting (`app.isQuitting` flag controls real exit). Sends `window-state-changed` events to renderer on maximize/unmaximize for toggling window control icons.

### Preload (`preload.js`)
Exposes a whitelisted `window.electronAPI` to the renderer via `contextBridge`. All renderer→main communication goes through this API. `contextIsolation: true`, `nodeIntegration: false`. Includes event listeners for `theme-changed` and `window-state-changed`.

### Renderer (`renderer/`)
Single-page app loaded from `index.html`. All UI logic lives in `renderer.js` — state is held in module-level variables (`shortcuts`, `categories`, `settings`, `recentItems`, `selectedBuiltinIcon`, `currentAddType`) and synced to main via IPC on each mutation. No build step.

### Main-process modules (`src/`)
- `store.js` — wraps `electron-store` with a JSON schema. All persistence goes through this. Supports custom data paths via `cwd` option. Default config: `%APPDATA%/flick-launcher/flick-launcher-config.json`, recommended: `E:\HappySoftCache\flick-launcher`
- `launcher.js` — launches files via `shell.openPath()`, URLs via `shell.openExternal()`. Accepts `type` parameter ('file' or 'url')
- `iconExtractor.js` — extracts `.exe` icons on Windows via PowerShell, caches PNGs in `userData/icon-cache/`
- `autoStart.js` — wraps `app.setLoginItemSettings()`
- `globalShortcut.js` — registers/unregisters the global hotkey that toggles window visibility
- `tray.js` — system tray icon with context menu showing recent launches

### Data flow
Renderer calls `electronAPI.foo()` → IPC → `main.js` handler → `Store`/module method → result returned. Settings changes in main (theme, shortcut, autostart) trigger side effects immediately (re-register shortcut, notify renderer via `theme-changed` event, etc.).

### Key patterns
- IPC uses `ipcMain.handle`/`ipcRenderer.invoke` for request-response, `ipcMain.on`/`ipcRenderer.send` for fire-and-forget (window controls)
- Shortcuts have a `type` field: `'file'` or `'url'` (auto-detected via regex `/^https?:\/\//i`)
- Duplicate detection on add: compares normalized paths (case-insensitive), URLs and files checked separately
- Adding a file shortcut auto-extracts the `.exe` icon asynchronously after the store write
- Category deletion reassigns orphaned shortcuts to the `'folders'` category
- Default categories: `tools`, `web`, `folders`, `notes`
- Reorder uses swap of `order` field values (not array index manipulation)
- Import deduplicates by path (shortcuts) and by id (categories), assigning new UUIDs to imported shortcuts
- File and folder selection are separate IPC handlers (`select-file` vs `select-folder`) — Windows doesn't support both in one dialog
- Built-in icons stored as SVG files in `renderer/icons/builtin/`, referenced by relative path `icons/builtin/{name}.svg`

## Packaging

`electron-builder` targets Windows x64 NSIS only. The build config is inline in `package.json` under `"build"`. Installer icon: `renderer/icons/default-icon.png`.

## Notes

- Font: Outfit (loaded from Google Fonts at runtime via `renderer/index.html`). Offline use falls back to system sans-serif.
- `.claude/skills/frontend-design/` contains a local skill for UI design work — invoke it by path when doing visual changes.
- Window control buttons use inline SVG with `currentColor` for theme compatibility. Maximize button toggles between maximize and restore icons based on window state.
