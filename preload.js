const { contextBridge, ipcRenderer } = require('electron');

// Expose a clean, safe API to the renderer process
contextBridge.exposeInMainWorld('myBrowser', {
  // ── Window Controls ──────────────────────────────────────────────────────
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),

  // ── Bookmarks ────────────────────────────────────────────────────────────
  getBookmarks:   ()         => ipcRenderer.invoke('get-bookmarks'),
  addBookmark:    (bookmark) => ipcRenderer.invoke('add-bookmark', bookmark),
  removeBookmark: (url)      => ipcRenderer.invoke('remove-bookmark', url),
  isBookmarked:   (url)      => ipcRenderer.invoke('is-bookmarked', url),

  // ── History ──────────────────────────────────────────────────────────────
  getHistory:   ()      => ipcRenderer.invoke('get-history'),
  addHistory:   (entry) => ipcRenderer.invoke('add-history', entry),
  clearHistory: ()      => ipcRenderer.invoke('clear-history'),

  // ── Settings ─────────────────────────────────────────────────────────────
  getSettings:  ()         => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // ── Ad Blocker ───────────────────────────────────────────────────────────
  toggleAdBlocker:   (enabled) => ipcRenderer.invoke('toggle-adblocker', enabled),
  getAdBlockerStats: ()        => ipcRenderer.invoke('get-adblocker-stats'),
  clearAdBlockerStats: ()      => ipcRenderer.invoke('clear-adblocker-stats'),

  // ── Utilities ────────────────────────────────────────────────────────────
  openExternal:    (url) => ipcRenderer.send('open-external', url),
  restartAndUpdate: ()   => ipcRenderer.send('restart-and-update'),

  // ── Event Listeners ──────────────────────────────────────────────────────
  on: (channel, callback) => {
    const allowed = ['ad-blocked', 'update-status', 'open-new-tab', 'window-state', 'fullscreen-change'];
    if (allowed.includes(channel)) {
      const handler = (_, data) => callback(data);
      ipcRenderer.on(channel, handler);
      return handler; // return so caller can remove it
    }
  },
  off: (channel, handler) => {
    ipcRenderer.removeListener(channel, handler);
  }
});
