const { contextBridge, ipcRenderer } = require('electron');

// Expose a clean, safe API to the renderer process
contextBridge.exposeInMainWorld('myBrowser', {
  // ── Window Controls ──────────────────────────────────────────────────────
  minimize:         () => ipcRenderer.send('window-minimize'),
  maximize:         () => ipcRenderer.send('window-maximize'),
  close:            () => ipcRenderer.send('window-close'),
  newPrivateWindow: () => ipcRenderer.send('new-private-window'),

  // ── Bookmarks ────────────────────────────────────────────────────────────
  getBookmarks:   ()         => ipcRenderer.invoke('get-bookmarks'),
  addBookmark:    (bookmark) => ipcRenderer.invoke('add-bookmark', bookmark),
  removeBookmark: (url)      => ipcRenderer.invoke('remove-bookmark', url),
  isBookmarked:   (url)      => ipcRenderer.invoke('is-bookmarked', url),

  // ── History & Session ────────────────────────────────────────────────────
  getHistory:      ()      => ipcRenderer.invoke('get-history'),
  addHistory:      (entry) => ipcRenderer.invoke('add-history', entry),
  clearHistory:    ()      => ipcRenderer.invoke('clear-history'),
  getSessionTabs:  ()      => ipcRenderer.invoke('get-session-tabs'),
  saveSessionTabs: (data)  => ipcRenderer.invoke('save-session-tabs', data),

  // ── Settings & Site Shield ───────────────────────────────────────────────
  getSettings:         ()         => ipcRenderer.invoke('get-settings'),
  saveSettings:        (settings) => ipcRenderer.invoke('save-settings', settings),
  toggleSiteAllowlist: (hostname) => ipcRenderer.invoke('toggle-site-allowlist', hostname),

  // ── Ad Blocker ───────────────────────────────────────────────────────────
  toggleAdBlocker:     (enabled) => ipcRenderer.invoke('toggle-adblocker', enabled),
  getAdBlockerStats:   ()        => ipcRenderer.invoke('get-adblocker-stats'),
  clearAdBlockerStats: ()        => ipcRenderer.invoke('clear-adblocker-stats'),

  // ── Downloads & Capture ──────────────────────────────────────────────────
  getDownloads:         ()     => ipcRenderer.invoke('get-downloads'),
  pauseDownload:        (id)   => ipcRenderer.invoke('pause-download', id),
  resumeDownload:       (id)   => ipcRenderer.invoke('resume-download', id),
  cancelDownload:       (id)   => ipcRenderer.invoke('cancel-download', id),
  openDownload:         (path) => ipcRenderer.invoke('open-download', path),
  showDownloadInFolder: (path) => ipcRenderer.invoke('show-download-in-folder', path),
  clearDownloads:       ()     => ipcRenderer.invoke('clear-downloads'),
  captureWebview:       (wcId) => ipcRenderer.invoke('capture-webview', wcId),

  // ── Utilities ────────────────────────────────────────────────────────────
  openExternal:     (url) => ipcRenderer.send('open-external', url),
  restartAndUpdate: ()    => ipcRenderer.send('restart-and-update'),

  // ── Event Listeners ──────────────────────────────────────────────────────
  on: (channel, callback) => {
    const allowed = ['ad-blocked', 'update-status', 'open-new-tab', 'window-state', 'fullscreen-change', 'download-updated'];
    if (allowed.includes(channel)) {
      const handler = (_, data) => callback(data);
      ipcRenderer.on(channel, handler);
      return handler;
    }
  },
  off: (channel, handler) => {
    ipcRenderer.removeListener(channel, handler);
  }
});
