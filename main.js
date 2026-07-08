const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');

let autoUpdater;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
  autoUpdater = null;
}

// ─── Persistent Storage ──────────────────────────────────────────────────────
const store = new Store({
  defaults: {
    bookmarks: [],
    history: [],
    settings: {
      homepage: 'https://www.google.com',
      adBlockerEnabled: true,
      searchEngine: 'https://www.google.com/search?q='
    },
    windowBounds: { width: 1400, height: 900 }
  }
});

let mainWindow;
let adBlockerEnabled = store.get('settings.adBlockerEnabled', true);
let blockedCount = 0;
let blockedUrls = [];

// ─── Ad Blocker Domain List ───────────────────────────────────────────────────
const AD_DOMAINS = [
  'doubleclick.net','googleadservices.com','googlesyndication.com',
  'google-analytics.com','googletagmanager.com','googletagservices.com',
  'adservice.google.com','pagead2.googlesyndication.com',
  'facebook.net','connect.facebook.net',
  'ads.yahoo.com','advertising.com','adbrite.com',
  'adcolony.com','adform.net','adnxs.com','adroll.com',
  'ads.twitter.com','amazon-adsystem.com','media.net',
  'outbrain.com','taboola.com','revcontent.com','sharethrough.com',
  'criteo.com','criteo.net','rubiconproject.com',
  'pubmatic.com','openx.net','openx.com',
  'adsafeprotected.com','moatads.com','doubleverify.com',
  'adsrvr.org','bidswitch.net','casalemedia.com',
  'contextweb.com','demdex.net','lijit.com',
  'sovrn.com','triplelift.com','yieldmo.com',
  'zergnet.com','ads.linkedin.com','ads.pinterest.com',
  'scorecardresearch.com','comscore.com','quantserve.com',
  'hotjar.com','fullstory.com','mixpanel.com',
  'amplitude.com','segment.com','chartbeat.com',
  'adskeeper.co.uk','popads.net','popcash.net',
  'propellerads.com','adcash.com','trafficjunky.net',
  'exoclick.com','juicyads.com','adsterra.com'
];

function shouldBlockUrl(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    return AD_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

// ─── Ad Blocker Setup ─────────────────────────────────────────────────────────
function setupAdBlocker() {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    if (adBlockerEnabled && shouldBlockUrl(details.url)) {
      blockedCount++;
      const entry = {
        url: details.url,
        domain: (() => { try { return new URL(details.url).hostname; } catch { return details.url; } })(),
        time: new Date().toLocaleTimeString()
      };
      blockedUrls.unshift(entry);
      if (blockedUrls.length > 50) blockedUrls.pop();

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ad-blocked', {
          count: blockedCount,
          recent: blockedUrls.slice(0, 10)
        });
      }
      callback({ cancel: true });
    } else {
      callback({});
    }
  });
}

// ─── Main Window ─────────────────────────────────────────────────────────────
function createWindow() {
  const { width, height } = store.get('windowBounds', { width: 1400, height: 900 });

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 650,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      sandbox: false
    },
    backgroundColor: '#0d1117',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'browser.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);
  mainWindow.on('maximize', () => mainWindow.webContents.send('window-state', 'maximized'));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-state', 'normal'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function saveBounds() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const b = mainWindow.getBounds();
    store.set('windowBounds', { width: b.width, height: b.height });
  }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
function setupIPC() {
  // Window controls
  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window-close', () => mainWindow?.close());

  // Bookmarks
  ipcMain.handle('get-bookmarks', () => store.get('bookmarks', []));
  ipcMain.handle('add-bookmark', (_, bookmark) => {
    const bookmarks = store.get('bookmarks', []);
    if (!bookmarks.some(b => b.url === bookmark.url)) {
      bookmarks.unshift({ ...bookmark, id: Date.now(), addedAt: new Date().toISOString() });
      store.set('bookmarks', bookmarks);
    }
    return bookmarks;
  });
  ipcMain.handle('remove-bookmark', (_, url) => {
    const bookmarks = store.get('bookmarks', []).filter(b => b.url !== url);
    store.set('bookmarks', bookmarks);
    return bookmarks;
  });
  ipcMain.handle('is-bookmarked', (_, url) => store.get('bookmarks', []).some(b => b.url === url));

  // History
  ipcMain.handle('get-history', () => store.get('history', []));
  ipcMain.handle('add-history', (_, entry) => {
    const history = store.get('history', []);
    const recent = history.slice(0, 3);
    if (!recent.some(h => h.url === entry.url)) {
      history.unshift({ ...entry, id: Date.now(), visitedAt: new Date().toISOString() });
      if (history.length > 1000) history.splice(1000);
      store.set('history', history);
    }
    return history;
  });
  ipcMain.handle('clear-history', () => { store.set('history', []); return []; });

  // Settings
  ipcMain.handle('get-settings', () => store.get('settings', {}));
  ipcMain.handle('save-settings', (_, settings) => {
    store.set('settings', { ...store.get('settings', {}), ...settings });
    return store.get('settings');
  });

  // Ad Blocker
  ipcMain.handle('toggle-adblocker', (_, enabled) => {
    adBlockerEnabled = enabled;
    store.set('settings.adBlockerEnabled', enabled);
    return { enabled: adBlockerEnabled, count: blockedCount };
  });
  ipcMain.handle('get-adblocker-stats', () => ({
    enabled: adBlockerEnabled,
    count: blockedCount,
    recent: blockedUrls.slice(0, 10)
  }));
  ipcMain.handle('clear-adblocker-stats', () => {
    blockedCount = 0;
    blockedUrls = [];
    return { enabled: adBlockerEnabled, count: 0, recent: [] };
  });

  // External links
  ipcMain.on('open-external', (_, url) => shell.openExternal(url));

  // Update: restart & install
  ipcMain.on('restart-and-update', () => {
    if (autoUpdater) autoUpdater.quitAndInstall();
  });
}

// ─── Auto Updater ─────────────────────────────────────────────────────────────
function setupAutoUpdater() {
  if (!autoUpdater) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('update-available', info => {
    mainWindow?.webContents.send('update-status', { status: 'available', version: info.version });
  });
  autoUpdater.on('download-progress', progress => {
    mainWindow?.webContents.send('update-status', {
      status: 'downloading',
      percent: Math.round(progress.percent)
    });
  });
  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update-status', { status: 'ready' });
  });
  autoUpdater.on('error', () => { /* silently ignore in dev */ });
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  setupAdBlocker();
  createWindow();
  setupIPC();
  setupAutoUpdater();

  // Check for updates after 5 seconds (won't work in dev without GitHub publish config)
  setTimeout(() => {
    try { if (autoUpdater && app.isPackaged) autoUpdater.checkForUpdates(); } catch (e) { /* ignore */ }
  }, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Open new-window requests as new tabs instead
app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    mainWindow?.webContents.send('open-new-tab', url);
    return { action: 'deny' };
  });
});
