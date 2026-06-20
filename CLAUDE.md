# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install          # Install dependencies
pnpm start            # Run in dev mode (electron .)
pnpm build            # Package for Windows (NSIS installer → build/)
pnpm build:dir        # Package unpacked (for testing without installer)
node -c preload.js    # Verify preload.js syntax after editing (critical - see Notes)
```

No test runner or linter is configured. Manual testing is required.

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

Electron desktop app (Windows-only target) built with vanilla HTML/CSS/JS — no frontend framework. Standard Electron three-process split:

### Main Process (`main.js`)
Entry point. Creates a frameless `BrowserWindow`, initializes all modules, and registers all IPC handlers. The window hides to the system tray on close instead of quitting (`app.isQuitting` flag controls real exit). Sends `window-state-changed` events to renderer on maximize/unmaximize for toggling window control icons.

### Preload (`preload.js`)
Exposes a whitelisted `window.electronAPI` to the renderer via `contextBridge`. All renderer→main communication goes through this API. `contextIsolation: true`, `nodeIntegration: false`. Includes event listeners for `theme-changed` and `window-state-changed`.

### Renderer (`renderer/`)
Single-page app loaded from `index.html`. All UI logic lives in `renderer.js` — state is held in module-level variables (`shortcuts`, `categories`, `settings`, `recentItems`, `selectedBuiltinIcon`, `currentAddType`, `editingShortcutId`, `deletingShortcutId`, `currentAppVersion`) and synced to main via IPC on each mutation. No build step. Update status is received via `window.electronAPI.onUpdateStatus()` callback and managed through a state machine (checking → available → downloading → downloaded → install).

### Main-process modules (`src/`)
- `store.js` — wraps `electron-store` with a JSON schema. All persistence goes through this. Supports custom data paths via `cwd` option. Uses `clearInvalidConfig: true` to recover from corrupted configs
- `launcher.js` — launches files via `shell.openPath()`, URLs via `shell.openExternal()`. Accepts `type` parameter ('file' or 'url')
- `iconExtractor.js` — extracts `.exe` icons on Windows via PowerShell, caches PNGs in `userData/icon-cache/`
- `autoStart.js` — wraps `app.setLoginItemSettings()`
- `globalShortcut.js` — registers/unregisters the global hotkey that toggles window visibility
- `tray.js` — system tray icon with context menu showing recent launches
- `updateManager.js` — wraps `electron-updater` for auto-update via GitHub Releases. Sends `update-status` events to renderer with states: checking → available → downloading → downloaded → error. Configured with `autoDownload: false` (user-initiated). Publish config points to GitHub (owner: Augenstern-creator, repo: FlickLauncher)

### Data flow
Renderer calls `electronAPI.foo()` → IPC → `main.js` handler → `Store`/module method → result returned. Settings changes in main (theme, shortcut, autostart) trigger side effects immediately (re-register shortcut, notify renderer via `theme-changed` event, etc.).

## Data Schema

All data persisted via `electron-store` in `flick-launcher-config.json`:

### Shortcut object
```javascript
{
  id: 'uuid-v4',
  name: 'Display name',
  path: 'C:\\path\\to\\file.exe' | 'https://example.com',
  type: 'file' | 'url',           // auto-detected via /^https?:\/\//i
  icon: null | 'path/to/icon',    // null = use default/builtin
  category: 'tools' | 'web' | 'folders' | 'notes' | 'custom-id',
  order: 0,                        // numeric sort order
  addedAt: '2026-01-01T00:00:00.000Z',
  lastUsed: null | 'ISO-timestamp',
  useCount: 0
}
```

### Category object
```javascript
{ id: 'string', name: 'Display name', order: 0 }
```
Default categories: `tools`, `web`, `folders`, `notes` (created on first run).

### Settings object
```javascript
{
  theme: 'dark' | 'light',         // default: 'dark'
  autoStart: boolean,              // default: false
  globalShortcut: 'string',        // default: 'CommandOrControl+Shift+Space'
  recentCount: number,             // default: 10
  dataPath: 'string',              // default: %APPDATA%/flick-launcher
  lastSeenChangelog: 'x.y.z'       // tracks which changelog was last shown
}
```

### Recent usage tracking
Stored as `recentUsage` array: `[{ id: 'shortcut-id', usedAt: 'ISO-timestamp' }]`. Sorted by recency (most recent first). Limited to `recentCount * 2` entries. When a shortcut is launched, it's moved to the top of the list and its `lastUsed`/`useCount` fields are updated on the shortcut itself.

### Data path priority
Store constructor checks if `E:\HappySoftCache\flick-launcher` exists (the recommended path). If yes, uses it. Otherwise falls back to `%APPDATA%\flick-launcher`. Static constants exported as `DataStore.RECOMMENDED_DATA_PATH` and `DataStore.DEFAULT_DATA_PATH`.

## Key patterns

- IPC uses `ipcMain.handle`/`ipcRenderer.invoke` for request-response, `ipcMain.on`/`ipcRenderer.send` for fire-and-forget (window controls)
- Shortcuts have a `type` field: `'file'` or `'url'` (auto-detected via regex `/^https?:\/\//i`)
- Duplicate detection on add: compares normalized paths (case-insensitive), URLs and files checked separately
- Adding a file shortcut auto-extracts the `.exe` icon asynchronously after the store write
- Category deletion reassigns orphaned shortcuts to the `'folders'` category
- Reorder uses swap of `order` field values (not array index manipulation)
- Import deduplicates by path (shortcuts) and by id (categories), assigning new UUIDs to imported shortcuts
- File and folder selection are separate IPC handlers (`select-file` vs `select-folder`) — Windows doesn't support both in one dialog
- Built-in icons stored as SVG files in `renderer/icons/builtin/`, referenced by relative path `icons/builtin/{name}.svg`
- **Custom modals instead of `prompt()`/`confirm()`**: Electron with `contextIsolation: true` makes native dialogs unreliable. All user confirmations use custom modal overlays (`modal-edit`, `modal-confirm-delete`, etc.) with state variables (`editingShortcutId`, `deletingShortcutId`) to track context
- **Changelog management**: `changelog.json` at repo root stores version history. Format: `{ "versions": [{ "version": "x.y.z", "date": "YYYY-MM-DD", "changes": ["...", "..."] }] }`. On startup, app compares `settings.lastSeenChangelog` with current version and shows modal if different. Update this file when releasing new versions
- **Window drag regions**: Titlebar has `-webkit-app-region: drag;` but button containers (`.titlebar-left`, `.titlebar-right`) must have `-webkit-app-region: no-drag;` to remain clickable. Missing this causes buttons to ignore clicks
- **Config export/import format**: JSON with `{ version: '1.0', exportedAt: 'ISO-timestamp', shortcuts: [...], categories: [...], settings: {...} }`. Import checks `version` field and rejects unsupported versions

## Auto-update workflow

When releasing a new version:
1. Update `version` in `package.json`
2. Add entry to `changelog.json` with new version and changes
3. Run `pnpm build` to generate installer
4. Create GitHub Release with tag matching version (e.g., `v1.3.0`)
5. Upload `build/` artifacts: `.exe` installer and `latest.yml`
6. Users running the app will receive update notification on next launch (auto-check after 3s delay)

## Packaging

`electron-builder` targets Windows x64 NSIS only. The build config is inline in `package.json` under `"build"`. Installer icon: `renderer/icons/default-icon.png`. Publish provider: GitHub (Augenstern-creator/FlickLauncher).

## Notes

- Font: Outfit (loaded from Google Fonts at runtime via `renderer/index.html`). Offline use falls back to system sans-serif.
- `.claude/skills/frontend-design/` contains a local skill for UI design work — invoke it by path when doing visual changes.
- Window control buttons use inline SVG with `currentColor` for theme compatibility. Maximize button toggles between maximize and restore icons based on window state.
- **preload.js syntax**: When adding new methods to `contextBridge.exposeInMainWorld()`, ensure proper comma separation between properties. A missing comma causes the entire API object to fail parsing, making `window.electronAPI` undefined and breaking all IPC communication.
- **Testing after preload.js changes**: Always verify syntax with `node -c preload.js` before running the app. If buttons stop responding and categories don't load, check preload.js for syntax errors first.
- **Store path resolution**: The store uses `clearInvalidConfig: true`, which means corrupted config files are silently reset to schema defaults. This is intentional for user-friendliness but means data loss is possible if the config file becomes corrupted.
