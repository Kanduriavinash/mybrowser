const { app, BrowserWindow, ipcMain, session, shell, Menu, clipboard, webContents } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

let autoUpdater;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch {
  autoUpdater = null;
}

// ─── Persistent Storage ──────────────────────────────────────────────────────
const DEFAULT_QUICK_LINKS = [
  { title: 'Google',  url: 'https://www.google.com',  icon: 'G',  bg: 'linear-gradient(135deg,#4285f4,#34a853)' },
  { title: 'YouTube', url: 'https://www.youtube.com', icon: '▶',  bg: 'linear-gradient(135deg,#ff0000,#cc0000)' },
  { title: 'GitHub',  url: 'https://github.com',      icon: 'GH', bg: 'linear-gradient(135deg,#333,#555)' },
  { title: 'Reddit',  url: 'https://www.reddit.com',  icon: 'r/', bg: 'linear-gradient(135deg,#ff4500,#e03d00)' },
  { title: 'Twitter', url: 'https://twitter.com',     icon: '𝕏',  bg: 'linear-gradient(135deg,#000,#333)' },
  { title: 'Netflix', url: 'https://www.netflix.com', icon: 'N',  bg: 'linear-gradient(135deg,#e50914,#b20710)' }
];

const store = new Store({
  defaults: {
    bookmarks: [],
    history: [],
    lastSession: { urls: [], activeIndex: 0 },
    settings: {
      homepage: 'https://www.google.com',
      adBlockerEnabled: true,
      searchEngine: 'https://www.google.com/search?q=',
      stripTrackingParams: true,
      httpsOnly: false,
      restoreSession: true,
      verticalTabs: false,
      adBlockAllowlist: [],
      quickLinks: DEFAULT_QUICK_LINKS
    },
    windowBounds: { width: 1400, height: 900 }
  }
});

let mainWindow;
let adBlockerEnabled = store.get('settings.adBlockerEnabled', true);
let blockedCount = 0;
let blockedUrls = [];

// Downloads tracking
const downloadsList = [];
const downloadItems = new Map();
let nextDownloadId = 1;
const configuredSessions = new WeakSet();

const CHROME_VER = process.versions.chrome || '131.0.0.0';
const CHROME_MAJOR = CHROME_VER.split('.')[0];
const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VER} Safari/537.36`;
app.userAgentFallback = CHROME_UA;

// ─── Ad Blocker & Privacy Lists ──────────────────────────────────────────────
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

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid', 'igshid', 'yclid', '_hsenc', '_hsmi'
]);

function getHostname(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

function isHostAllowlisted(pageUrl) {
  const host = getHostname(pageUrl);
  if (!host) return false;
  const allowlist = store.get('settings.adBlockAllowlist', []);
  return allowlist.some(d => host === d || host.endsWith('.' + d));
}

function shouldBlockUrl(url, pageUrl = '') {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    // Allow Google BotGuard (/bg/) scripts so Google Search & Sign-In never degrade
    if (hostname === 'pagead2.googlesyndication.com' && urlObj.pathname.startsWith('/bg/')) {
      return false;
    }
    if (pageUrl && isHostAllowlisted(pageUrl)) {
      return false;
    }
    return AD_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
  } catch {
    return false;
  }
}

function stripUrlTrackingParams(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    let changed = false;
    for (const key of Array.from(u.searchParams.keys())) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        u.searchParams.delete(key);
        changed = true;
      }
    }
    return changed ? u.toString() : null;
  } catch {
    return null;
  }
}

function shouldUpgradeHttps(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'http:') return null;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local') || /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) {
      return null;
    }
    u.protocol = 'https:';
    return u.toString();
  } catch {
    return null;
  }
}

function broadcastToWindows(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

// ─── Session Configuration (Default & Incognito) ────────────────────────────
function configureSession(ses) {
  if (!ses || configuredSessions.has(ses)) return;
  configuredSessions.add(ses);

  ses.setUserAgent(CHROME_UA);

  ses.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
    const headers = details.requestHeaders;
    headers['User-Agent'] = CHROME_UA;
    if (headers['sec-ch-ua'] || headers['Sec-CH-UA']) {
      delete headers['sec-ch-ua'];
      headers['Sec-CH-UA'] = `"Google Chrome";v="${CHROME_MAJOR}", "Chromium";v="${CHROME_MAJOR}", "Not_A Brand";v="24"`;
    }
    if (headers['sec-ch-ua-mobile'] || headers['Sec-CH-UA-Mobile']) {
      delete headers['sec-ch-ua-mobile'];
      headers['Sec-CH-UA-Mobile'] = '?0';
    }
    if (headers['sec-ch-ua-platform'] || headers['Sec-CH-UA-Platform']) {
      delete headers['sec-ch-ua-platform'];
      headers['Sec-CH-UA-Platform'] = '"Windows"';
    }
    callback({ requestHeaders: headers });
  });

  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    // 1. HTTPS-Only & tracking param stripping on mainFrame navigations
    if (details.resourceType === 'mainFrame') {
      let targetUrl = details.url;
      let redirected = false;
      if (store.get('settings.httpsOnly', false)) {
        const upgraded = shouldUpgradeHttps(targetUrl);
        if (upgraded) { targetUrl = upgraded; redirected = true; }
      }
      if (store.get('settings.stripTrackingParams', true)) {
        const cleaned = stripUrlTrackingParams(targetUrl);
        if (cleaned) { targetUrl = cleaned; redirected = true; }
      }
      if (redirected) {
        callback({ redirectURL: targetUrl });
        return;
      }
    }

    // 2. Ad & tracker blocking
    const pageUrl = details.frame?.top?.url || (() => {
      try { return details.webContentsId ? webContents.fromId(details.webContentsId)?.getURL() || '' : ''; } catch { return ''; }
    })();

    if (adBlockerEnabled && shouldBlockUrl(details.url, pageUrl)) {
      blockedCount++;
      const entry = {
        url: details.url,
        domain: getHostname(details.url) || details.url,
        time: new Date().toLocaleTimeString()
      };
      blockedUrls.unshift(entry);
      if (blockedUrls.length > 50) blockedUrls.pop();

      broadcastToWindows('ad-blocked', {
        count: blockedCount,
        recent: blockedUrls.slice(0, 10)
      });
      callback({ cancel: true });
      return;
    }

    callback({});
  });

  // 3. Downloads tracking
  ses.on('will-download', (_, item) => {
    const id = nextDownloadId++;
    const fileName = item.getFilename();
    const downloadsDir = app.getPath('downloads');
    let savePath = path.join(downloadsDir, fileName);
    if (fs.existsSync(savePath)) {
      const parsed = path.parse(fileName);
      savePath = path.join(downloadsDir, `${parsed.name} (${Date.now()})${parsed.ext}`);
    }
    item.setSavePath(savePath);

    const record = {
      id,
      filename: fileName,
      url: item.getURL(),
      savePath,
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      state: 'progressing',
      isPaused: false,
      startTime: new Date().toISOString()
    };
    downloadsList.unshift(record);
    if (downloadsList.length > 100) downloadsList.pop();
    downloadItems.set(id, item);

    const emitUpdate = () => broadcastToWindows('download-updated', { ...record, list: downloadsList.slice(0, 50) });
    emitUpdate();

    item.on('updated', (_, state) => {
      record.receivedBytes = item.getReceivedBytes();
      record.totalBytes = item.getTotalBytes();
      record.isPaused = item.isPaused();
      record.state = state === 'interrupted' ? 'interrupted' : 'progressing';
      emitUpdate();
    });

    item.once('done', (_, state) => {
      record.receivedBytes = item.getReceivedBytes();
      record.totalBytes = item.getTotalBytes() || record.receivedBytes;
      record.isPaused = false;
      record.state = state; // 'completed' | 'cancelled' | 'interrupted'
      downloadItems.delete(id);
      emitUpdate();
    });
  });
}

// ─── Browser Windows ─────────────────────────────────────────────────────────
function createWindow({ incognito = false } = {}) {
  const { width, height } = store.get('windowBounds', { width: 1400, height: 900 });
  const partition = incognito ? `incognito-${Date.now()}-${Math.floor(Math.random() * 1000)}` : '';
  if (partition) {
    configureSession(session.fromPartition(partition));
  }

  const win = new BrowserWindow({
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

  if (!incognito && !mainWindow) {
    mainWindow = win;
  }

  win.loadFile(path.join(__dirname, 'src', 'browser.html'), {
    query: incognito ? { incognito: '1', partition } : {}
  });

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  const saveWinBounds = () => {
    if (!incognito && !win.isDestroyed()) {
      const b = win.getBounds();
      store.set('windowBounds', { width: b.width, height: b.height });
    }
  };

  win.on('resize', saveWinBounds);
  win.on('move', saveWinBounds);
  win.on('maximize', () => !win.isDestroyed() && win.webContents.send('window-state', 'maximized'));
  win.on('unmaximize', () => !win.isDestroyed() && win.webContents.send('window-state', 'normal'));
  win.on('enter-html-full-screen', () => !win.isDestroyed() && win.webContents.send('fullscreen-change', true));
  win.on('leave-html-full-screen', () => !win.isDestroyed() && win.webContents.send('fullscreen-change', false));
  win.on('closed', () => {
    if (win === mainWindow) {
      mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed()) || null;
    }
  });

  return win;
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
function setupIPC() {
  // Window controls (scoped to the exact sender window)
  ipcMain.on('window-minimize', e => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.on('window-maximize', e => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window-close', e => BrowserWindow.fromWebContents(e.sender)?.close());
  ipcMain.on('new-private-window', () => createWindow({ incognito: true }));

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

  // Session tabs (for Restore Previous Session)
  ipcMain.handle('get-session-tabs', () => store.get('lastSession', { urls: [], activeIndex: 0 }));
  ipcMain.handle('save-session-tabs', (_, data) => {
    store.set('lastSession', data);
    return true;
  });

  // Settings & Site Shield Allowlist
  ipcMain.handle('get-settings', () => store.get('settings', {}));
  ipcMain.handle('save-settings', (_, settings) => {
    store.set('settings', { ...store.get('settings', {}), ...settings });
    return store.get('settings');
  });
  ipcMain.handle('toggle-site-allowlist', (_, hostname) => {
    const host = String(hostname || '').toLowerCase().trim();
    const list = store.get('settings.adBlockAllowlist', []);
    const next = list.includes(host) ? list.filter(h => h !== host) : [...list, host];
    store.set('settings.adBlockAllowlist', next);
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

  // Downloads
  ipcMain.handle('get-downloads', () => downloadsList.slice(0, 50));
  ipcMain.handle('pause-download', (_, id) => {
    const item = downloadItems.get(id);
    if (item && !item.isPaused()) item.pause();
    return downloadsList.slice(0, 50);
  });
  ipcMain.handle('resume-download', (_, id) => {
    const item = downloadItems.get(id);
    if (item && item.canResume()) item.resume();
    return downloadsList.slice(0, 50);
  });
  ipcMain.handle('cancel-download', (_, id) => {
    const item = downloadItems.get(id);
    if (item) item.cancel();
    return downloadsList.slice(0, 50);
  });
  ipcMain.handle('open-download', (_, filePath) => {
    if (filePath && fs.existsSync(filePath)) return shell.openPath(filePath);
    return 'File not found';
  });
  ipcMain.handle('show-download-in-folder', (_, filePath) => {
    if (filePath) shell.showItemInFolder(filePath);
    return true;
  });
  ipcMain.handle('clear-downloads', () => {
    for (let i = downloadsList.length - 1; i >= 0; i--) {
      if (downloadsList[i].state !== 'progressing') downloadsList.splice(i, 1);
    }
    return downloadsList.slice(0, 50);
  });

  // Screenshot capture (from active webview or window)
  ipcMain.handle('capture-webview', async (e, wcId) => {
    try {
      const target = wcId ? webContents.fromId(wcId) : e.sender;
      if (!target) return { ok: false, error: 'No target view' };
      const img = await target.capturePage();
      clipboard.writeImage(img);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const outPath = path.join(app.getPath('downloads'), `MyBrowser-Screenshot-${stamp}.png`);
      fs.writeFileSync(outPath, img.toPNG());
      return { ok: true, path: outPath };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });

  // External links & updates
  ipcMain.on('open-external', (_, url) => shell.openExternal(url));
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
    mainWindow?.webContents.send('update-status', { status: 'downloading', percent: Math.round(progress.percent) });
  });
  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update-status', { status: 'ready' });
  });
  autoUpdater.on('error', () => { /* ignore in dev */ });
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    const ver = app.getVersion();
    if (store.get('lastAppVersion') !== ver) {
      await session.defaultSession.clearCache();
      await session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
      store.set('lastAppVersion', ver);
    }
  } catch { /* ignore */ }

  configureSession(session.defaultSession);
  createWindow();
  setupIPC();
  setupAutoUpdater();

  setTimeout(() => {
    try { if (autoUpdater && app.isPackaged) autoUpdater.checkForUpdates(); } catch { /* ignore */ }
  }, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── WebContents Popup, Tab & Context Menu Handling ───────────────────────────
app.on('web-contents-created', (_, contents) => {
  contents.setUserAgent(CHROME_UA);

  contents.setWindowOpenHandler(({ url, disposition, features }) => {
    if ((features && features.length > 0) || url === 'about:blank') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 540,
          height: 680,
          autoHideMenuBar: true,
          backgroundColor: '#0d1117',
          webPreferences: {
            contextIsolation: true,
            sandbox: true
          }
        }
      };
    }
    if (url) {
      const hostWin = BrowserWindow.fromWebContents(contents.hostWebContents || contents) || mainWindow;
      hostWin?.webContents.send('open-new-tab', {
        url,
        background: disposition === 'background-tab'
      });
    }
    return { action: 'deny' };
  });

  if (contents.getType() === 'webview') {
    contents.on('context-menu', (_, params) => {
      const hostWin = BrowserWindow.fromWebContents(contents.hostWebContents) || mainWindow;
      const template = [];
      if (params.linkURL) {
        template.push(
          {
            label: 'Open Link in New Tab',
            click: () => hostWin?.webContents.send('open-new-tab', { url: params.linkURL, background: true })
          },
          {
            label: 'Copy Link Address',
            click: () => clipboard.writeText(params.linkURL)
          },
          { type: 'separator' }
        );
      }
      if (params.isEditable) {
        template.push(
          { role: 'cut', enabled: params.editFlags.canCut },
          { role: 'copy', enabled: params.editFlags.canCopy },
          { role: 'paste', enabled: params.editFlags.canPaste },
          { role: 'selectAll' },
          { type: 'separator' }
        );
      } else if (params.selectionText) {
        template.push({ role: 'copy' }, { type: 'separator' });
      }
      template.push(
        { label: 'Back', enabled: contents.canGoBack(), click: () => contents.goBack() },
        { label: 'Forward', enabled: contents.canGoForward(), click: () => contents.goForward() },
        { label: 'Reload', click: () => contents.reload() },
        { type: 'separator' },
        { label: 'Inspect Element', click: () => contents.inspectElement(params.x, params.y) }
      );
      Menu.buildFromTemplate(template).popup({ window: hostWin || undefined });
    });
  }
});
