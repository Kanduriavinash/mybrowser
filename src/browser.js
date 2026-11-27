/* ═══════════════════════════════════════════════════════════════
   MyBrowser — Core Renderer Logic
   Tabs · Split View · Navigation · Bookmarks · History · Settings
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const urlParams = new URLSearchParams(window.location.search);
const isIncognito = urlParams.get('incognito') === '1';
const incognitoPartition = urlParams.get('partition') || '';

const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];

// ── State ─────────────────────────────────────────────────────
const state = {
  tabs: [],        // [{ id, webview, tab, titleEl, favEl, loader, audioBtn, url, title, favicon, isNewTab, webviewReady, pendingUrl, pinned, muted, group, zoomFactor }]
  closedTabs: [],  // stack for Ctrl+Shift+T
  activeTab: null,
  nextTabId: 1,
  settings: {},
  adBlockerEnabled: true,
  blockedCount: 0,
  isIncognito,
  splitView: { enabled: false, leftId: null, rightId: null, ratio: 0.5 }
};

// ── DOM references ─────────────────────────────────────────────
const $ = id => document.getElementById(id);
const tabBar           = $('tab-bar');
const content          = $('browser-content');
const addressBar       = $('address-bar');
const btnBack          = $('btn-back');
const btnForward       = $('btn-forward');
const btnReload        = $('btn-reload');
const btnHome          = $('btn-home');
const btnBookmark      = $('btn-bookmark');
const btnBookPanel     = $('btn-bookmarks-panel');
const btnHistPanel     = $('btn-history-panel');
const btnDownloads     = $('btn-downloads-panel');
const btnWebPanel      = $('btn-web-panel');
const btnExtension     = $('btn-extension');
const blockedBadge     = $('blocked-badge');
const loadingInd       = $('loading-indicator');
const btnClearAddr     = $('btn-clear-address');
const zoomPill         = $('zoom-pill');
const newTabPage       = $('new-tab-page');
const newtabSearch     = $('newtab-search');
const quickLinks       = $('quick-links');
const splitResizer     = $('split-resizer');

// Sidebars
const downloadsSidebar = $('downloads-sidebar');
const bookmarksSidebar = $('bookmarks-sidebar');
const historySidebar   = $('history-sidebar');
const webPanelSidebar  = $('web-panel-sidebar');
const bookmarksList    = $('bookmarks-list');
const historyList      = $('history-list');
const bookmarkSearch   = $('bookmark-search');
const historySearch    = $('history-search');
const overlay          = $('overlay');

// Extension panel
const extPanel        = $('extension-panel');
const adToggle        = $('adblocker-toggle');
const blockedCountEl  = $('blocked-count');
const protStatus      = $('protection-status');
const blockedFeed     = $('blocked-feed');
const clearStatsBtn   = $('clear-stats-btn');

// Update toast
const updateToast      = $('update-toast');
const toastTitle       = $('toast-title');
const toastMsg         = $('toast-msg');
const toastRestart     = $('toast-restart-btn');
const toastDismiss     = $('toast-dismiss-btn');
const toastProgress    = $('toast-progress-wrap');
const toastProgressBar = $('toast-progress-bar');

// ══════════════════════════════════════════════════════════════
//  INITIALISATION
// ══════════════════════════════════════════════════════════════
async function init() {
  try {
    state.settings = await window.myBrowser.getSettings();
    const adStats  = await window.myBrowser.getAdBlockerStats();
    state.adBlockerEnabled = adStats.enabled;
    state.blockedCount     = adStats.count;

    if (isIncognito) {
      $('incognito-badge')?.classList.remove('hidden');
      const sub = $('newtab-sub');
      if (sub) sub.textContent = 'Private Window — history & cookies clear on close.';
    }

    if (state.settings.verticalTabs) {
      document.body.classList.add('vertical-tabs');
    }

    adToggle.checked = state.adBlockerEnabled;
    updateAdBlockerUI(adStats);

    setupWindowControls();
    setupToolbar();
    setupNewTabPage();
    setupSidebars();
    setupSettings();
    setupExtensionPanel();
    setupUpdateToast();
    setupGlobalEvents();
    setupSplitResizer();

    if (typeof window.initMyBrowserFeatures === 'function') {
      await window.initMyBrowserFeatures();
    }

    setupKeyboardShortcuts();

    // Restore previous session (non-incognito) or open homepage
    let openedInitial = false;
    if (!isIncognito && state.settings.restoreSession !== false) {
      const last = await window.myBrowser.getSessionTabs();
      if (last?.urls?.length > 0) {
        const validUrls = last.urls.filter(u => typeof u === 'string');
        if (validUrls.length > 0) {
          validUrls.forEach((u, idx) => createTab(u, idx !== (last.activeIndex || 0)));
          const active = state.tabs[Math.min(last.activeIndex || 0, state.tabs.length - 1)];
          if (active) switchTab(active.id);
          openedInitial = true;
        }
      }
    }
    if (!openedInitial) {
      createTab(isIncognito ? '' : (state.settings.homepage || 'https://www.google.com'));
    }

    requestAnimationFrame(() => resizeWebviews());
    window.addEventListener('resize', resizeWebviews);
    window.addEventListener('beforeunload', saveSessionState);
  } catch (err) {
    console.error('MyBrowser failed to start:', err);
    document.body.innerHTML = `
      <div style="padding:40px;color:#e6edf3;font-family:Inter,sans-serif;text-align:center">
        <h1 style="color:#f85149;margin-bottom:12px">MyBrowser failed to start</h1>
        <p style="color:#8b949e">${escHtml(err.message || err)}</p>
      </div>`;
  }
}

// ══════════════════════════════════════════════════════════════
//  WINDOW CONTROLS
// ══════════════════════════════════════════════════════════════
function setupWindowControls() {
  $('btn-close').addEventListener('click',    () => window.myBrowser.close());
  $('btn-minimize').addEventListener('click', () => window.myBrowser.minimize());
  $('btn-maximize').addEventListener('click', () => window.myBrowser.maximize());
  $('btn-vertical-tabs')?.addEventListener('click', toggleVerticalTabs);

  window.myBrowser.on('window-state', windowState => {
    const icon = $('maximize-icon');
    if (!icon) return;
    if (windowState === 'maximized') {
      icon.innerHTML = '<rect x="3.5" y="1.5" width="5" height="5" rx="0.5"/><rect x="1.5" y="3.5" width="5" height="5" rx="0.5"/>';
    } else {
      icon.innerHTML = '<rect x="1.8" y="1.8" width="6.4" height="6.4" rx="0.5"/>';
    }
  });
}

function toggleVerticalTabs() {
  const active = document.body.classList.toggle('vertical-tabs');
  state.settings.verticalTabs = active;
  window.myBrowser.saveSettings({ verticalTabs: active });
  requestAnimationFrame(() => resizeWebviews());
}

// ══════════════════════════════════════════════════════════════
//  TAB MANAGEMENT
// ══════════════════════════════════════════════════════════════
function createTab(url = '', background = false, opts = {}) {
  const id = state.nextTabId++;

  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.dataset.tabId = id;
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', 'false');

  const favWrap = document.createElement('div');
  favWrap.style.cssText = 'width:14px;height:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0';

  const fav = document.createElement('img');
  fav.className = 'tab-favicon';
  fav.src = opts.favicon || getDefaultFavicon();
  fav.onerror = () => { fav.src = getDefaultFavicon(); };

  const loader = document.createElement('div');
  loader.className = 'tab-loading hidden';
  favWrap.append(fav, loader);

  const title = document.createElement('span');
  title.className = 'tab-title';
  title.textContent = opts.title || 'New Tab';

  const audioBtn = document.createElement('button');
  audioBtn.className = 'tab-audio hidden';
  audioBtn.textContent = '🔊';
  audioBtn.title = 'Mute tab';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Close Tab';
  closeBtn.addEventListener('click', e => { e.stopPropagation(); closeTab(id); });

  tab.append(favWrap, title, audioBtn, closeBtn);
  tab.addEventListener('click', () => switchTab(id));

  const wv = document.createElement('webview');
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('webpreferences', 'contextIsolation=true');
  if (incognitoPartition) {
    wv.setAttribute('partition', incognitoPartition);
  }
  wv.src = 'about:blank';
  wv.style.cssText = 'position:absolute;top:0;left:0;border:none;display:none;';
  content.appendChild(wv);

  const tabObj = {
    id, webview: wv, tab, titleEl: title, favEl: fav, favWrap, loader, audioBtn,
    url, title: opts.title || 'New Tab', favicon: opts.favicon || '', isNewTab: !url,
    webviewReady: false, pendingUrl: null,
    pinned: Boolean(opts.pinned), muted: false, group: opts.group || 'none',
    zoomFactor: 1.0
  };
  if (tabObj.pinned) tab.classList.add('pinned');
  if (tabObj.group !== 'none') tab.dataset.group = tabObj.group;

  audioBtn.addEventListener('click', e => {
    e.stopPropagation();
    toggleMuteTab(tabObj);
  });

  tabBar.appendChild(tab);
  state.tabs.push(tabObj);
  if (tabObj.pinned) reorderTabDom();

  setupWebviewEvents(tabObj);
  if (typeof window.attachTabInteractions === 'function') {
    window.attachTabInteractions(tabObj);
  }

  if (!background) {
    switchTab(id);
  }

  if (url) {
    navigate(url, tabObj);
  } else if (!background) {
    showNewTabPage(true, tabObj);
    newtabSearch.focus();
  }

  saveSessionState();
  return tabObj;
}

function closeTab(id) {
  const idx = state.tabs.findIndex(t => t.id === id);
  if (idx === -1) return;

  const tabObj = state.tabs[idx];
  if (tabObj.url && !isNewTabUrl(tabObj.url)) {
    state.closedTabs.push({ url: tabObj.url, title: tabObj.title, favicon: tabObj.favicon });
    if (state.closedTabs.length > 25) state.closedTabs.shift();
  }

  if (state.splitView.enabled && (state.splitView.leftId === id || state.splitView.rightId === id)) {
    closeSplitView();
  }

  tabObj.tab.remove();
  tabObj.webview.remove();
  state.tabs.splice(idx, 1);

  if (state.tabs.length === 0) {
    createTab('');
    return;
  }

  if (state.activeTab?.id === id) {
    const newIdx = Math.min(idx, state.tabs.length - 1);
    switchTab(state.tabs[newIdx].id);
  }
  saveSessionState();
}

function reopenClosedTab() {
  const entry = state.closedTabs.pop();
  if (!entry) {
    showToastNotification('No recently closed tabs');
    return;
  }
  createTab(entry.url, false, { title: entry.title, favicon: entry.favicon });
}

function duplicateTab(tabObj) {
  if (!tabObj) return;
  createTab(tabObj.url || '', false, { group: tabObj.group });
}

function togglePinTab(tabObj) {
  if (!tabObj) return;
  tabObj.pinned = !tabObj.pinned;
  tabObj.tab.classList.toggle('pinned', tabObj.pinned);
  reorderTabDom();
}

function reorderTabDom() {
  const pinned = state.tabs.filter(t => t.pinned);
  const regular = state.tabs.filter(t => !t.pinned);
  state.tabs = [...pinned, ...regular];
  state.tabs.forEach(t => tabBar.appendChild(t.tab));
}

function toggleMuteTab(tabObj) {
  if (!tabObj) return;
  tabObj.muted = !tabObj.muted;
  try { tabObj.webview.setAudioMuted(tabObj.muted); } catch {}
  tabObj.audioBtn.textContent = tabObj.muted ? '🔇' : '🔊';
  tabObj.audioBtn.classList.toggle('muted', tabObj.muted);
  tabObj.audioBtn.title = tabObj.muted ? 'Unmute tab' : 'Mute tab';
}

function setTabGroup(tabObj, color) {
  if (!tabObj) return;
  tabObj.group = color || 'none';
  if (tabObj.group === 'none') delete tabObj.tab.dataset.group;
  else tabObj.tab.dataset.group = tabObj.group;
}

function switchTab(id) {
  const tabObj = state.tabs.find(t => t.id === id);
  if (!tabObj) return;

  // If Split View is open and switching to a tab outside split, close split view cleanly
  if (state.splitView.enabled && id !== state.splitView.leftId && id !== state.splitView.rightId) {
    closeSplitView();
  }

  state.tabs.forEach(t => {
    t.tab.classList.remove('active');
    t.tab.setAttribute('aria-selected', 'false');
    t.webview.classList.remove('active', 'split-focused');
    if (!state.splitView.enabled || (t.id !== state.splitView.leftId && t.id !== state.splitView.rightId)) {
      t.webview.style.display = 'none';
    }
  });

  tabObj.tab.classList.add('active');
  tabObj.tab.setAttribute('aria-selected', 'true');
  tabObj.webview.classList.add('active');
  if (state.splitView.enabled) tabObj.webview.classList.add('split-focused');
  state.activeTab = tabObj;

  if (isNewTabUrl(tabObj.url)) {
    newTabPage.classList.remove('hidden');
    if (!state.splitView.enabled) tabObj.webview.style.display = 'none';
  } else {
    newTabPage.classList.add('hidden');
    tabObj.webview.style.display = 'flex';
  }

  updateToolbarForTab(tabObj);
  tabObj.tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  requestAnimationFrame(() => resizeWebviews());
  saveSessionState();
}

// ── Split View ─────────────────────────────────────────────────
function toggleSplitView() {
  if (state.splitView.enabled) {
    closeSplitView();
    return;
  }
  if (!state.activeTab) return;

  let leftTab = state.activeTab;
  let rightTab = state.tabs.find(t => t.id !== leftTab.id && !isNewTabUrl(t.url));
  if (!rightTab) {
    rightTab = state.tabs.find(t => t.id !== leftTab.id);
  }
  if (!rightTab) {
    rightTab = createTab(state.settings.homepage || 'https://www.google.com', true);
  }
  if (isNewTabUrl(leftTab.url)) {
    navigate(state.settings.homepage || 'https://www.google.com', leftTab);
  }
  if (isNewTabUrl(rightTab.url)) {
    navigate(state.settings.homepage || 'https://www.google.com', rightTab);
  }

  state.splitView = { enabled: true, leftId: leftTab.id, rightId: rightTab.id, ratio: 0.5 };
  newTabPage.classList.add('hidden');
  splitResizer.classList.remove('hidden');
  $('btn-split-view')?.classList.add('active');
  switchTab(leftTab.id);
}

function closeSplitView() {
  state.splitView.enabled = false;
  state.splitView.leftId = null;
  state.splitView.rightId = null;
  splitResizer.classList.add('hidden');
  $('btn-split-view')?.classList.remove('active');
  state.tabs.forEach(t => {
    t.webview.classList.remove('split-focused');
    if (t.id !== state.activeTab?.id) t.webview.style.display = 'none';
  });
  if (state.activeTab && isNewTabUrl(state.activeTab.url)) {
    newTabPage.classList.remove('hidden');
  }
  requestAnimationFrame(() => resizeWebviews());
}

function setupSplitResizer() {
  $('btn-split-view')?.addEventListener('click', toggleSplitView);
  $('btn-close-split')?.addEventListener('click', closeSplitView);

  let dragging = false;
  splitResizer?.addEventListener('mousedown', e => {
    if (e.target.id === 'btn-close-split') return;
    dragging = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!dragging || !state.splitView.enabled) return;
    const rect = content.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / Math.max(rect.width, 1);
    state.splitView.ratio = Math.min(0.8, Math.max(0.2, rel));
    resizeWebviews();
  });
  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      document.body.style.cursor = '';
    }
  });
}

// ── Zoom Helpers ───────────────────────────────────────────────
function setTabZoom(tabObj, nextFactor) {
  if (!tabObj || !tabObj.webviewReady) return;
  const clamped = Math.min(2.0, Math.max(0.5, Number(nextFactor.toFixed(2))));
  tabObj.zoomFactor = clamped;
  try { tabObj.webview.setZoomFactor(clamped); } catch {}
  if (state.activeTab?.id === tabObj.id) updateZoomPill(tabObj);
}

function stepTabZoom(delta) {
  const tabObj = state.activeTab;
  if (!tabObj || isNewTabUrl(tabObj.url)) return;
  const cur = tabObj.zoomFactor || 1.0;
  let idx = ZOOM_STEPS.findIndex(z => Math.abs(z - cur) < 0.03);
  if (idx === -1) idx = ZOOM_STEPS.indexOf(1.0);
  const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, idx + delta))];
  setTabZoom(tabObj, next);
}

function updateZoomPill(tabObj) {
  if (!zoomPill) return;
  const z = tabObj?.zoomFactor || 1.0;
  if (!tabObj || isNewTabUrl(tabObj.url) || Math.abs(z - 1.0) < 0.01) {
    zoomPill.classList.add('hidden');
  } else {
    zoomPill.textContent = `${Math.round(z * 100)}%`;
    zoomPill.classList.remove('hidden');
  }
}

// ── Toolbar Sync ───────────────────────────────────────────────
function safeCanGoBack(tabObj) {
  try { return Boolean(tabObj?.webviewReady && tabObj.webview.canGoBack()); } catch { return false; }
}
function safeCanGoForward(tabObj) {
  try { return Boolean(tabObj?.webviewReady && tabObj.webview.canGoForward()); } catch { return false; }
}

function updateSecurityIcon(url) {
  const sec = $('security-icon');
  if (!sec) return;
  sec.classList.remove('insecure', 'neutral');
  if (!url || isNewTabUrl(url)) {
    sec.classList.add('neutral');
    sec.title = 'New Tab';
  } else if (url.startsWith('https://')) {
    sec.title = 'Connection is secure (HTTPS)';
  } else {
    sec.classList.add('insecure');
    sec.title = 'Connection is not secure';
  }
}

function updateToolbarForTab(tabObj) {
  addressBar.value = tabObj.url && !isNewTabUrl(tabObj.url) ? tabObj.url : '';
  btnBack.disabled    = !safeCanGoBack(tabObj);
  btnForward.disabled = !safeCanGoForward(tabObj);
  updateSecurityIcon(tabObj.url);
  updateBookmarkButton(tabObj.url);
  updateZoomPill(tabObj);
  toggleClearBtn();
}

// ══════════════════════════════════════════════════════════════
//  WEBVIEW EVENTS
// ══════════════════════════════════════════════════════════════
function setupWebviewEvents(tabObj) {
  const wv = tabObj.webview;
  const { favEl, loader } = tabObj;

  wv.addEventListener('mousedown', () => {
    if (state.splitView.enabled && state.activeTab?.id !== tabObj.id) {
      switchTab(tabObj.id);
    }
  });

  wv.addEventListener('dom-ready', () => {
    tabObj.webviewReady = true;
    if (tabObj.zoomFactor !== 1.0) {
      try { wv.setZoomFactor(tabObj.zoomFactor); } catch {}
    }
    if (tabObj.pendingUrl) {
      const url = tabObj.pendingUrl;
      tabObj.pendingUrl = null;
      try {
        Promise.resolve(wv.loadURL(url)).catch(() => {});
      } catch (e) { console.error(e); }
    }
    resizeWebviews();
  });

  wv.addEventListener('did-start-loading', () => {
    favEl.style.display = 'none';
    loader.classList.remove('hidden');
    if (state.activeTab?.id === tabObj.id) {
      loadingInd.classList.remove('hidden');
      btnReload.title = 'Stop (Esc)';
    }
  });

  wv.addEventListener('did-stop-loading', async () => {
    loader.classList.add('hidden');
    favEl.style.display = '';
    if (state.activeTab?.id === tabObj.id) {
      loadingInd.classList.add('hidden');
      btnReload.title = 'Reload (F5)';
      btnBack.disabled    = !safeCanGoBack(tabObj);
      btnForward.disabled = !safeCanGoForward(tabObj);
    }

    const url = wv.getURL();
    const title = wv.getTitle() || url;
    if (url && !isNewTabUrl(url) && !url.startsWith('about:')) {
      tabObj.url   = url;
      tabObj.title = title;
      if (!isIncognito) {
        await window.myBrowser.addHistory({ url, title, favicon: tabObj.favicon });
      }
      if (state.activeTab?.id === tabObj.id) {
        addressBar.value = url;
        updateSecurityIcon(url);
        updateBookmarkButton(url);
        toggleClearBtn();
      }
      saveSessionState();
    }
  });

  wv.addEventListener('did-navigate', (e) => {
    if (isNewTabUrl(e.url)) {
      if (!tabObj.pendingUrl) {
        tabObj.url = '';
        if (state.activeTab?.id === tabObj.id) {
          addressBar.value = '';
          btnBack.disabled    = !safeCanGoBack(tabObj);
          btnForward.disabled = !safeCanGoForward(tabObj);
          updateSecurityIcon('');
          updateBookmarkButton('');
          toggleClearBtn();
          if (!state.splitView.enabled) showNewTabPage(true, tabObj);
        }
      }
      return;
    }

    tabObj.url = e.url;
    if (state.activeTab?.id === tabObj.id) {
      showNewTabPage(false, tabObj);
      addressBar.value = e.url;
      btnBack.disabled    = !safeCanGoBack(tabObj);
      btnForward.disabled = !safeCanGoForward(tabObj);
      updateSecurityIcon(e.url);
      updateBookmarkButton(e.url);
      toggleClearBtn();
    }
  });

  wv.addEventListener('did-navigate-in-page', (e) => {
    tabObj.url = e.url;
    if (state.activeTab?.id === tabObj.id) {
      addressBar.value = e.url;
      btnBack.disabled    = !safeCanGoBack(tabObj);
      btnForward.disabled = !safeCanGoForward(tabObj);
      updateSecurityIcon(e.url);
      updateBookmarkButton(e.url);
    }
  });

  wv.addEventListener('page-title-updated', (e) => {
    tabObj.title = e.title;
    tabObj.titleEl.textContent = e.title || 'Untitled';
    tabObj.titleEl.title = e.title;
  });

  wv.addEventListener('page-favicon-updated', (e) => {
    if (e.favicons && e.favicons.length > 0) {
      tabObj.favicon = e.favicons[0];
      tabObj.favEl.src = e.favicons[0];
    }
  });

  wv.addEventListener('media-started-playing', () => {
    tabObj.audioBtn.classList.remove('hidden');
  });
  wv.addEventListener('media-stopped-playing', () => {
    if (!tabObj.muted) tabObj.audioBtn.classList.add('hidden');
  });

  wv.addEventListener('found-in-page', (e) => {
    if (typeof window.onFindInPageResult === 'function' && state.activeTab?.id === tabObj.id) {
      window.onFindInPageResult(e.result);
    }
  });

  wv.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3) return;
    loader.classList.add('hidden');
    favEl.style.display = '';
    if (e.errorCode !== 0) tabObj.titleEl.textContent = 'Error';
    if (state.activeTab?.id === tabObj.id) {
      loadingInd.classList.add('hidden');
      btnReload.title = 'Reload (F5)';
    }
  });
}

// ══════════════════════════════════════════════════════════════
//  NAVIGATION & RESIZE
// ══════════════════════════════════════════════════════════════
function navigate(input, tabObj) {
  if (!input) return;
  tabObj = tabObj || state.activeTab;
  if (!tabObj) return;

  const url = resolveUrl(input);
  tabObj.url = url;

  if (isNewTabUrl(url)) {
    showNewTabPage(true, tabObj);
    return;
  }

  showNewTabPage(false, tabObj);
  loadWebviewUrl(tabObj, url);
  saveSessionState();
}

function loadWebviewUrl(tabObj, url) {
  const wv = tabObj.webview;
  if (tabObj.webviewReady) {
    try {
      Promise.resolve(wv.loadURL(url)).catch(() => {});
    } catch (e) { console.error(e); }
  } else {
    tabObj.pendingUrl = url;
  }
}

function resolveUrl(input) {
  input = input.trim();
  if (!input) return '';
  try {
    const u = new URL(input);
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'file:') return input;
  } catch {}
  if (/^localhost(:\d+)?(\/?.*)?$/i.test(input)) return 'http://' + input;
  if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(input)) return 'http://' + input;
  if (/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}(:\d+)?(\/.*)?$/.test(input)) return 'https://' + input;
  const engine = state.settings.searchEngine || 'https://www.google.com/search?q=';
  return engine + encodeURIComponent(input);
}

function isNewTabUrl(url) {
  return !url || url === 'about:blank' || url === '' || url === 'about:newtab';
}

function showNewTabPage(show, tabObj) {
  const tObj = tabObj || state.activeTab;
  if (show) {
    if (!state.splitView.enabled) {
      newTabPage.classList.remove('hidden');
      if (tObj) tObj.webview.style.display = 'none';
    }
    if (tObj) tObj.isNewTab = true;
  } else {
    newTabPage.classList.add('hidden');
    if (tObj) {
      tObj.webview.style.display = 'flex';
      tObj.isNewTab = false;
    }
  }
  requestAnimationFrame(() => resizeWebviews());
}

function getDefaultFavicon() {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='7' fill='%2330363d'/%3E%3C/svg%3E";
}

function resizeWebviews() {
  const h = content.offsetHeight;
  const w = content.offsetWidth;
  if (!h || !w) return;

  if (state.splitView.enabled) {
    const leftTab  = state.tabs.find(t => t.id === state.splitView.leftId);
    const rightTab = state.tabs.find(t => t.id === state.splitView.rightId);
    const resizerW = 6;
    const leftW = Math.round(w * state.splitView.ratio);
    const rightW = Math.max(100, w - leftW - resizerW);

    if (leftTab) {
      leftTab.webview.style.display = 'flex';
      leftTab.webview.style.left    = '0px';
      leftTab.webview.style.width   = leftW + 'px';
      leftTab.webview.style.height  = h + 'px';
    }
    splitResizer.style.left = leftW + 'px';
    if (rightTab) {
      rightTab.webview.style.display = 'flex';
      rightTab.webview.style.left    = (leftW + resizerW) + 'px';
      rightTab.webview.style.width   = rightW + 'px';
      rightTab.webview.style.height  = h + 'px';
    }
    return;
  }

  state.tabs.forEach(t => {
    t.webview.style.left   = '0px';
    t.webview.style.width  = w + 'px';
    t.webview.style.height = h + 'px';
  });
}

function saveSessionState() {
  if (isIncognito) return;
  const urls = state.tabs.map(t => t.url || '');
  const activeIndex = Math.max(0, state.tabs.findIndex(t => t.id === state.activeTab?.id));
  window.myBrowser.saveSessionTabs({ urls, activeIndex });
}

// ══════════════════════════════════════════════════════════════
//  TOOLBAR SETUP
// ══════════════════════════════════════════════════════════════
function setupToolbar() {
  btnBack.addEventListener('click', () => {
    if (safeCanGoBack(state.activeTab)) state.activeTab.webview.goBack();
  });
  btnForward.addEventListener('click', () => {
    if (safeCanGoForward(state.activeTab)) state.activeTab.webview.goForward();
  });
  btnHome.addEventListener('click', () => navigate(state.settings.homepage || 'https://www.google.com'));

  btnReload.addEventListener('click', () => {
    const wv = state.activeTab?.webview;
    if (!wv) return;
    try {
      if (wv.isLoading()) wv.stop();
      else wv.reload();
    } catch { wv.reload(); }
  });

  zoomPill?.addEventListener('click', () => setTabZoom(state.activeTab, 1.0));

  addressBar.addEventListener('keydown', e => {
    if (typeof window.handleOmniboxKey === 'function' && window.handleOmniboxKey(e)) return;
    if (e.key === 'Enter') {
      navigate(addressBar.value);
      addressBar.blur();
    }
    if (e.key === 'Escape') {
      addressBar.value = state.activeTab?.url || '';
      addressBar.blur();
    }
    toggleClearBtn();
  });

  addressBar.addEventListener('input', () => {
    toggleClearBtn();
    if (typeof window.updateOmnibox === 'function') window.updateOmnibox(addressBar.value);
  });
  addressBar.addEventListener('focus', () => {
    addressBar.select();
    toggleClearBtn();
    if (typeof window.updateOmnibox === 'function') window.updateOmnibox(addressBar.value);
  });
  addressBar.addEventListener('blur', () => {
    setTimeout(() => $('omnibox-dropdown')?.classList.add('hidden'), 150);
    if (state.activeTab?.url) addressBar.value = isNewTabUrl(state.activeTab.url) ? '' : state.activeTab.url;
    toggleClearBtn();
  });

  btnClearAddr.addEventListener('mousedown', e => e.preventDefault());
  btnClearAddr.addEventListener('click', () => {
    addressBar.value = '';
    addressBar.focus();
    toggleClearBtn();
    if (typeof window.updateOmnibox === 'function') window.updateOmnibox('');
  });

  $('btn-new-tab').addEventListener('click', () => createTab());
  btnBookmark.addEventListener('click', toggleBookmark);

  btnBookPanel.addEventListener('click', () => togglePanel('bookmarks'));
  btnHistPanel.addEventListener('click', () => togglePanel('history'));
  btnDownloads?.addEventListener('click', () => togglePanel('downloads'));
  btnWebPanel?.addEventListener('click',  () => togglePanel('webpanel'));
  btnExtension.addEventListener('click',  () => toggleExtPanel());
  $('btn-settings').addEventListener('click', () => toggleSettingsPanel());

  overlay.addEventListener('click', closeAllPanels);
}

function toggleClearBtn() {
  if (addressBar.value.length > 0) btnClearAddr.classList.remove('hidden');
  else btnClearAddr.classList.add('hidden');
}

// ══════════════════════════════════════════════════════════════
//  BOOKMARK BUTTON & PANELS
// ══════════════════════════════════════════════════════════════
async function updateBookmarkButton(url) {
  if (!url || isNewTabUrl(url)) {
    btnBookmark.classList.remove('bookmarked');
    return;
  }
  const isBookmarked = await window.myBrowser.isBookmarked(url);
  btnBookmark.classList.toggle('bookmarked', isBookmarked);
}

async function toggleBookmark() {
  const tab = state.activeTab;
  if (!tab || isNewTabUrl(tab.url)) return;

  const isBookmarked = await window.myBrowser.isBookmarked(tab.url);
  if (isBookmarked) {
    await window.myBrowser.removeBookmark(tab.url);
    btnBookmark.classList.remove('bookmarked');
  } else {
    await window.myBrowser.addBookmark({ url: tab.url, title: tab.title || tab.url, favicon: tab.favicon });
    btnBookmark.classList.add('bookmarked');
    if (bookmarksSidebar.classList.contains('open')) renderBookmarks();
  }
}

function togglePanel(name) {
  const map = {
    bookmarks: bookmarksSidebar,
    history:   historySidebar,
    downloads: downloadsSidebar,
    webpanel:  webPanelSidebar
  };
  const sidebar = map[name];
  if (!sidebar) return;
  const isOpen = sidebar.classList.contains('open');

  closeAllPanels();
  if (!isOpen) {
    sidebar.classList.add('open');
    sidebar.setAttribute('aria-hidden', 'false');
    overlay.classList.remove('hidden');
    if (name === 'bookmarks') renderBookmarks();
    else if (name === 'history') renderHistory();
    else if (name === 'downloads' && typeof window.renderDownloads === 'function') window.renderDownloads();
    else if (name === 'webpanel' && typeof window.onWebPanelOpened === 'function') window.onWebPanelOpened();
  }
}

function toggleExtPanel() {
  const isOpen = extPanel.classList.contains('open');
  closeAllPanels();
  if (!isOpen) {
    extPanel.classList.add('open');
    extPanel.setAttribute('aria-hidden', 'false');
    overlay.classList.remove('hidden');
    refreshExtPanel();
  }
}

function closeAllPanels() {
  [bookmarksSidebar, historySidebar, downloadsSidebar, webPanelSidebar, extPanel].forEach(el => {
    if (!el) return;
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
  });
  const settPanel = $('settings-panel');
  if (settPanel) { settPanel.classList.add('hidden'); settPanel.setAttribute('aria-hidden', 'true'); }
  overlay.classList.add('hidden');
}

// ══════════════════════════════════════════════════════════════
//  SETTINGS PANEL
// ══════════════════════════════════════════════════════════════
function toggleSettingsPanel() {
  const panel = $('settings-panel');
  if (!panel) return;
  const isHidden = panel.classList.contains('hidden');
  closeAllPanels();
  if (isHidden) {
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    $('settings-homepage').value         = state.settings.homepage || '';
    $('settings-search-engine').value    = state.settings.searchEngine || '';
    $('settings-adblocker').checked      = state.adBlockerEnabled;
    $('settings-strip-tracking').checked = state.settings.stripTrackingParams !== false;
    $('settings-https-only').checked     = Boolean(state.settings.httpsOnly);
    $('settings-restore-session').checked = state.settings.restoreSession !== false;
    $('settings-vertical-tabs').checked  = document.body.classList.contains('vertical-tabs');
    overlay.classList.remove('hidden');
  }
}

function setupSettings() {
  const panel = $('settings-panel');
  if (!panel) return;

  $('close-settings').addEventListener('click', () => closeAllPanels());
  $('settings-new-private')?.addEventListener('click', () => window.myBrowser.newPrivateWindow());

  $('settings-save').addEventListener('click', async () => {
    const homepage            = $('settings-homepage').value.trim() || 'https://www.google.com';
    const searchEngine        = $('settings-search-engine').value.trim() || 'https://www.google.com/search?q=';
    const adBlocker           = $('settings-adblocker').checked;
    const stripTrackingParams = $('settings-strip-tracking').checked;
    const httpsOnly           = $('settings-https-only').checked;
    const restoreSession      = $('settings-restore-session').checked;
    const verticalTabs        = $('settings-vertical-tabs').checked;

    state.settings = await window.myBrowser.saveSettings({
      homepage, searchEngine, adBlockerEnabled: adBlocker,
      stripTrackingParams, httpsOnly, restoreSession, verticalTabs
    });

    if (verticalTabs !== document.body.classList.contains('vertical-tabs')) {
      document.body.classList.toggle('vertical-tabs', verticalTabs);
      requestAnimationFrame(() => resizeWebviews());
    }

    if (adBlocker !== state.adBlockerEnabled) {
      const result = await window.myBrowser.toggleAdBlocker(adBlocker);
      state.adBlockerEnabled = result.enabled;
      updateAdBlockerUI({ enabled: result.enabled, count: result.count });
    }

    closeAllPanels();
    showToastNotification('Settings saved!');
  });

  $('settings-clear-history').addEventListener('click', async () => {
    await window.myBrowser.clearHistory();
    showToastNotification('History cleared.');
  });

  $('settings-clear-stats').addEventListener('click', async () => {
    await window.myBrowser.clearAdBlockerStats();
    state.blockedCount = 0;
    blockedCountEl.textContent = '0';
    blockedBadge.textContent   = '0';
    showToastNotification('Ad blocker stats cleared.');
  });
}

function showToastNotification(msg) {
  let toast = $('mini-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'mini-toast';
    toast.style.cssText = `
      position:fixed; bottom:20px; right:20px; z-index:2000;
      background:var(--bg-elevated); border:1px solid var(--border-strong);
      border-radius:var(--r-md); padding:10px 16px; font-size:13px;
      color:var(--text-primary); box-shadow:var(--shadow-md);
      transition:opacity 0.3s; opacity:0; pointer-events:none;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
}

// ══════════════════════════════════════════════════════════════
//  NEW TAB PAGE & CUSTOM QUICK LINKS
// ══════════════════════════════════════════════════════════════
function updateNewTabClock() {
  const clockEl = $('newtab-clock');
  const greetEl = $('newtab-greeting');
  if (!clockEl || !greetEl) return;
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const h = now.getHours();
  greetEl.textContent = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function renderQuickLinks() {
  const links = state.settings.quickLinks || [];
  let html = links.map((q, idx) => `
    <a class="ql-item" href="#" data-url="${escHtml(q.url)}" data-ql-index="${idx}">
      <button class="ql-remove" data-remove-ql="${idx}" title="Remove shortcut">✕</button>
      <div class="ql-icon" style="background:${escHtml(q.bg || 'linear-gradient(135deg,#7c3aed,#06b6d4)')}">${escHtml(q.icon || q.title?.charAt(0)?.toUpperCase() || 'W')}</div>
      <span>${escHtml(q.title)}</span>
    </a>
  `).join('');

  html += `
    <button class="ql-item ql-add-tile" id="ql-add-btn" title="Add Quick Link">
      <div class="ql-icon">+</div>
      <span>Add</span>
    </button>
  `;
  quickLinks.innerHTML = html;
}

function setupNewTabPage() {
  updateNewTabClock();
  setInterval(updateNewTabClock, 30000);
  renderQuickLinks();

  newtabSearch.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const val = newtabSearch.value.trim();
      if (val) {
        navigate(val);
        newtabSearch.value = '';
        if (state.activeTab?.url) {
          addressBar.value = state.activeTab.url;
          toggleClearBtn();
        }
      }
    }
  });

  quickLinks.addEventListener('click', async e => {
    const remBtn = e.target.closest('[data-remove-ql]');
    if (remBtn) {
      e.preventDefault();
      e.stopPropagation();
      const idx = parseInt(remBtn.dataset.removeQl, 10);
      const next = (state.settings.quickLinks || []).filter((_, i) => i !== idx);
      state.settings = await window.myBrowser.saveSettings({ quickLinks: next });
      renderQuickLinks();
      return;
    }

    if (e.target.closest('#ql-add-btn')) {
      e.preventDefault();
      $('ql-input-title').value = '';
      $('ql-input-url').value   = '';
      $('ql-modal').classList.remove('hidden');
      $('ql-input-title').focus();
      return;
    }

    const link = e.target.closest('.ql-item');
    if (!link) return;
    e.preventDefault();
    const url = link.dataset.url;
    if (url) navigate(url);
  });

  $('ql-modal-cancel')?.addEventListener('click', () => $('ql-modal').classList.add('hidden'));
  $('ql-modal-save')?.addEventListener('click', async () => {
    const title = $('ql-input-title').value.trim();
    const rawUrl = $('ql-input-url').value.trim();
    if (!title || !rawUrl) return;
    const url = resolveUrl(rawUrl);
    const next = [...(state.settings.quickLinks || []), {
      title,
      url,
      icon: title.charAt(0).toUpperCase(),
      bg: 'linear-gradient(135deg,#7c3aed,#06b6d4)'
    }];
    state.settings = await window.myBrowser.saveSettings({ quickLinks: next });
    $('ql-modal').classList.add('hidden');
    renderQuickLinks();
  });
}

// ══════════════════════════════════════════════════════════════
//  BOOKMARKS & HISTORY SIDEBARS
// ══════════════════════════════════════════════════════════════
function setupSidebars() {
  $('close-bookmarks').addEventListener('click', () => closeAllPanels());
  $('close-history').addEventListener('click',   () => closeAllPanels());
  $('close-downloads')?.addEventListener('click', () => closeAllPanels());
  $('close-web-panel')?.addEventListener('click', () => closeAllPanels());

  bookmarkSearch.addEventListener('input', () => renderBookmarks(bookmarkSearch.value));
  historySearch.addEventListener('input',  () => renderHistory(historySearch.value));

  $('clear-history-btn').addEventListener('click', async () => {
    await window.myBrowser.clearHistory();
    renderHistory();
  });
}

async function renderBookmarks(filter = '') {
  const bookmarks = await window.myBrowser.getBookmarks();
  const filtered  = filter
    ? bookmarks.filter(b =>
        b.title?.toLowerCase().includes(filter.toLowerCase()) ||
        b.url?.toLowerCase().includes(filter.toLowerCase()))
    : bookmarks;

  if (filtered.length === 0) {
    bookmarksList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔖</div>
        <p>${filter ? 'No bookmarks match your search.' : 'No bookmarks yet.<br>Click the ☆ icon to add one.'}</p>
      </div>`;
    return;
  }

  bookmarksList.innerHTML = filtered.map(b => `
    <div class="sidebar-item" data-url="${escHtml(b.url)}" role="listitem">
      <img class="sidebar-item-favicon" src="${escHtml(b.favicon || getDefaultFavicon())}" alt="">
      <div class="sidebar-item-info">
        <div class="sidebar-item-title" title="${escHtml(b.title || b.url)}">${escHtml(b.title || b.url)}</div>
        <div class="sidebar-item-url">${escHtml(b.url)}</div>
      </div>
      <button class="sidebar-item-del" data-action="delete" data-url="${escHtml(b.url)}" title="Remove bookmark">✕</button>
    </div>
  `).join('');

  bookmarksList.querySelectorAll('.sidebar-item-favicon').forEach(img => {
    img.addEventListener('error', () => { img.src = getDefaultFavicon(); }, { once: true });
  });

  bookmarksList.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', e => {
      const delBtn = e.target.closest('[data-action="delete"]');
      if (delBtn) {
        e.stopPropagation();
        deleteBookmark(delBtn.dataset.url);
        return;
      }
      navigate(item.dataset.url);
      closeAllPanels();
    });
  });
}

async function deleteBookmark(url) {
  await window.myBrowser.removeBookmark(url);
  await renderBookmarks(bookmarkSearch.value);
  updateBookmarkButton(state.activeTab?.url);
}

async function renderHistory(filter = '') {
  const history = await window.myBrowser.getHistory();
  const filtered = filter
    ? history.filter(h =>
        h.title?.toLowerCase().includes(filter.toLowerCase()) ||
        h.url?.toLowerCase().includes(filter.toLowerCase()))
    : history;

  if (filtered.length === 0) {
    historyList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🕰️</div>
        <p>${filter ? 'No history matches your search.' : 'No history yet.<br>Start browsing!'}</p>
      </div>`;
    return;
  }

  const groups = {};
  filtered.forEach(h => {
    const d = new Date(h.visitedAt);
    const key = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : d.toLocaleDateString(undefined, { month:'long', day:'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(h);
  });

  let html = '';
  for (const [date, items] of Object.entries(groups)) {
    html += `<div class="history-date-header">${date}</div>`;
    html += items.map(h => `
      <div class="sidebar-item" data-url="${escHtml(h.url)}" role="listitem">
        <img class="sidebar-item-favicon" src="${escHtml(h.favicon || getDefaultFavicon())}" alt="">
        <div class="sidebar-item-info">
          <div class="sidebar-item-title">${escHtml(h.title || h.url)}</div>
          <div class="sidebar-item-url">${escHtml(h.url)}</div>
        </div>
        <span class="sidebar-item-time">${new Date(h.visitedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
      </div>
    `).join('');
  }
  historyList.innerHTML = html;

  historyList.querySelectorAll('.sidebar-item-favicon').forEach(img => {
    img.addEventListener('error', () => { img.src = getDefaultFavicon(); }, { once: true });
  });

  historyList.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
      navigate(item.dataset.url);
      closeAllPanels();
    });
  });
}

// ══════════════════════════════════════════════════════════════
//  EXTENSION PANEL (PRIVACY & AD BLOCKER)
// ══════════════════════════════════════════════════════════════
function getCurrentHostname() {
  try { return new URL(state.activeTab?.url || '').hostname.toLowerCase(); } catch { return ''; }
}

function setupExtensionPanel() {
  adToggle.addEventListener('change', async () => {
    const result = await window.myBrowser.toggleAdBlocker(adToggle.checked);
    state.adBlockerEnabled = result.enabled;
    updateAdBlockerUI({ enabled: result.enabled, count: result.count });
  });

  $('site-shield-toggle')?.addEventListener('change', async () => {
    const host = getCurrentHostname();
    if (!host) return;
    state.settings = await window.myBrowser.toggleSiteAllowlist(host);
    showToastNotification($('site-shield-toggle').checked ? `Shield enabled for ${host}` : `Shield paused on ${host}`);
  });

  $('ext-strip-tracking')?.addEventListener('change', async e => {
    state.settings = await window.myBrowser.saveSettings({ stripTrackingParams: e.target.checked });
  });

  $('ext-https-only')?.addEventListener('change', async e => {
    state.settings = await window.myBrowser.saveSettings({ httpsOnly: e.target.checked });
  });

  clearStatsBtn.addEventListener('click', async () => {
    await window.myBrowser.clearAdBlockerStats();
    state.blockedCount = 0;
    updateAdBlockerUI({ enabled: state.adBlockerEnabled, count: 0, recent: [] });
    blockedBadge.textContent = '0';
  });

  window.myBrowser.on('ad-blocked', data => {
    state.blockedCount = data.count;
    blockedBadge.textContent = data.count > 99 ? '99+' : data.count;
    blockedBadge.classList.add('pulse');
    setTimeout(() => blockedBadge.classList.remove('pulse'), 400);
    blockedCountEl.textContent = data.count;
    if (extPanel.classList.contains('open') && data.recent) {
      renderBlockedFeed(data.recent);
    }
  });
}

function updateAdBlockerUI({ enabled, count, recent }) {
  blockedCountEl.textContent = count || 0;
  blockedBadge.textContent = count > 99 ? '99+' : (count || 0);
  protStatus.textContent   = enabled ? 'ON' : 'OFF';
  protStatus.className     = 'stat-val ' + (enabled ? 'status-on' : 'status-off');
  adToggle.checked         = enabled;
  if (recent) renderBlockedFeed(recent);
}

async function refreshExtPanel() {
  const stats = await window.myBrowser.getAdBlockerStats();
  state.adBlockerEnabled = stats.enabled;
  state.blockedCount     = stats.count;
  updateAdBlockerUI(stats);

  const host = getCurrentHostname();
  const hostLbl = $('site-shield-host');
  const siteTgl = $('site-shield-toggle');
  if (host && hostLbl && siteTgl) {
    hostLbl.textContent = `Shield for ${host}`;
    const allow = state.settings.adBlockAllowlist || [];
    siteTgl.disabled = false;
    siteTgl.checked = !allow.includes(host);
  } else if (hostLbl && siteTgl) {
    hostLbl.textContent = 'No active site';
    siteTgl.disabled = true;
    siteTgl.checked = true;
  }

  if ($('ext-strip-tracking')) $('ext-strip-tracking').checked = state.settings.stripTrackingParams !== false;
  if ($('ext-https-only'))     $('ext-https-only').checked     = Boolean(state.settings.httpsOnly);
}

function renderBlockedFeed(recent) {
  if (!recent || recent.length === 0) {
    blockedFeed.innerHTML = `<div class="empty-state small"><div class="empty-icon">✅</div><p>All clear! No ads blocked<br>on this page yet.</p></div>`;
    return;
  }
  blockedFeed.innerHTML = recent.map(item => `
    <div class="blocked-item">
      <div class="blocked-item-dot"></div>
      <span class="blocked-item-domain">${escHtml(item.domain || item.url)}</span>
      <span class="blocked-item-time">${escHtml(item.time || '')}</span>
    </div>
  `).join('');
}

// ══════════════════════════════════════════════════════════════
//  AUTO-UPDATE TOAST & GLOBAL EVENTS
// ══════════════════════════════════════════════════════════════
function setupUpdateToast() {
  window.myBrowser.on('update-status', data => {
    updateToast.classList.remove('hidden');
    updateToast.classList.add('show');

    switch (data.status) {
      case 'available':
        toastTitle.textContent = '🚀 Update Available';
        toastMsg.textContent = `Version ${data.version} — downloading in background...`;
        toastProgress.classList.remove('hidden');
        toastProgressBar.style.width = '5%';
        toastRestart.classList.add('hidden');
        break;
      case 'downloading':
        toastTitle.textContent = 'Downloading Update';
        toastMsg.textContent = `${data.percent}% complete...`;
        toastProgress.classList.remove('hidden');
        toastProgressBar.style.width = data.percent + '%';
        toastRestart.classList.add('hidden');
        break;
      case 'ready':
        toastTitle.textContent = '✅ Update Ready!';
        toastMsg.textContent = 'Restart MyBrowser to apply the update.';
        toastProgress.classList.add('hidden');
        toastRestart.classList.remove('hidden');
        break;
    }
  });

  toastRestart.addEventListener('click', () => window.myBrowser.restartAndUpdate());
  toastDismiss.addEventListener('click', () => {
    updateToast.classList.remove('show');
    setTimeout(() => updateToast.classList.add('hidden'), 350);
  });
}

function setupGlobalEvents() {
  window.myBrowser.on('open-new-tab', payload => {
    if (typeof payload === 'string') createTab(payload);
    else if (payload?.url) createTab(payload.url, Boolean(payload.background));
  });

  window.myBrowser.on('fullscreen-change', isFullscreen => {
    document.body.classList.toggle('html-fullscreen', Boolean(isFullscreen));
    requestAnimationFrame(() => resizeWebviews());
  });
}

// ══════════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ══════════════════════════════════════════════════════════════
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    const ctrl = e.ctrlKey || e.metaKey;
    const key  = e.key.toLowerCase();

    if (ctrl && e.shiftKey && key === 't') { e.preventDefault(); reopenClosedTab(); return; }
    if (ctrl && e.shiftKey && key === 'n') { e.preventDefault(); window.myBrowser.newPrivateWindow(); return; }
    if (ctrl && e.shiftKey && key === 'v') { e.preventDefault(); toggleVerticalTabs(); return; }
    if (ctrl && e.shiftKey && key === 's') { e.preventDefault(); window.captureActiveScreenshot?.(); return; }

    if (ctrl && !e.shiftKey && key === 't') { e.preventDefault(); createTab(); }
    if (ctrl && !e.shiftKey && key === 'w') { e.preventDefault(); if (state.activeTab) closeTab(state.activeTab.id); }
    if (ctrl && !e.shiftKey && key === 'l') { e.preventDefault(); addressBar.select(); addressBar.focus(); }
    if (ctrl && !e.shiftKey && key === 'd') { e.preventDefault(); toggleBookmark(); }
    if (ctrl && !e.shiftKey && key === 'h') { e.preventDefault(); togglePanel('history'); }
    if (ctrl && !e.shiftKey && key === 'b') { e.preventDefault(); togglePanel('bookmarks'); }
    if (ctrl && !e.shiftKey && key === 'j') { e.preventDefault(); togglePanel('downloads'); }
    if (ctrl && !e.shiftKey && key === 'f') { e.preventDefault(); window.openFindBar?.(); }
    if (ctrl && !e.shiftKey && key === 'k') { e.preventDefault(); window.toggleCommandPalette?.(); }

    if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); stepTabZoom(1); }
    if (ctrl && e.key === '-')                      { e.preventDefault(); stepTabZoom(-1); }
    if (ctrl && e.key === '0')                      { e.preventDefault(); setTabZoom(state.activeTab, 1.0); }

    if (e.altKey && key === 'r')          { e.preventDefault(); window.toggleReaderMode?.(); }
    if (e.altKey && key === 's')          { e.preventDefault(); toggleSplitView(); }
    if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); if (safeCanGoBack(state.activeTab)) state.activeTab.webview.goBack(); }
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); if (safeCanGoForward(state.activeTab)) state.activeTab.webview.goForward(); }

    if (e.key === 'F5') { e.preventDefault(); state.activeTab?.webview.reload(); }
    if (e.key === 'Escape') {
      if (!$('command-palette-wrap')?.classList.contains('hidden')) {
        window.closeCommandPalette?.();
      } else if (!$('find-bar')?.classList.contains('hidden')) {
        window.closeFindBar?.();
      } else if (!$('reader-overlay')?.classList.contains('hidden')) {
        window.closeReaderMode?.();
      } else if (!overlay.classList.contains('hidden') || extPanel.classList.contains('open')) {
        closeAllPanels();
      } else {
        const wv = state.activeTab?.webview;
        if (wv) { try { if (wv.isLoading()) wv.stop(); } catch {} }
      }
    }

    if (ctrl && e.key === 'Tab') {
      e.preventDefault();
      const idx = state.tabs.findIndex(t => t.id === state.activeTab?.id);
      const next = e.shiftKey
        ? (idx - 1 + state.tabs.length) % state.tabs.length
        : (idx + 1) % state.tabs.length;
      switchTab(state.tabs[next].id);
    }

    if (ctrl && e.key >= '1' && e.key <= '8') {
      const idx = parseInt(e.key, 10) - 1;
      if (state.tabs[idx]) switchTab(state.tabs[idx].id);
    }
    if (ctrl && e.key === '9' && state.tabs.length > 0) {
      switchTab(state.tabs[state.tabs.length - 1].id);
    }
  });
}

// ══════════════════════════════════════════════════════════════
//  UTILITY HELPERS
// ══════════════════════════════════════════════════════════════
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isToday(d) {
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

function isYesterday(d) {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return d.getDate() === y.getDate() && d.getMonth() === y.getMonth() && d.getFullYear() === y.getFullYear();
}

window.MyBrowserApp = {
  state, $, createTab, closeTab, switchTab, navigate, resizeWebviews,
  togglePanel, toggleExtPanel, toggleSettingsPanel, closeAllPanels,
  showToastNotification, escHtml, isNewTabUrl, resolveUrl,
  duplicateTab, togglePinTab, toggleMuteTab, setTabGroup, reopenClosedTab,
  toggleSplitView, closeSplitView, toggleVerticalTabs, setTabZoom, stepTabZoom
};

document.addEventListener('DOMContentLoaded', init);
