/* ═══════════════════════════════════════════════════════════════
   MyBrowser — Renderer Logic
   Tab manager · Navigation · Bookmarks · History · Ad Blocker · Updates
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ── State ─────────────────────────────────────────────────────
const state = {
  tabs: [],       // [{ id, webview, titleEl, favEl, loadingEl, url, title, favicon }]
  activeTab: null,
  nextTabId: 1,
  settings: {},
  adBlockerEnabled: true,
  blockedCount: 0
};

// ── DOM references ─────────────────────────────────────────────
const $ = id => document.getElementById(id);
const tabBar          = $('tab-bar');
const content         = $('browser-content');
const addressBar      = $('address-bar');
const btnBack         = $('btn-back');
const btnForward      = $('btn-forward');
const btnReload       = $('btn-reload');
const btnHome         = $('btn-home');
const btnBookmark     = $('btn-bookmark');
const bookmarkIcon    = $('bookmark-icon');
const btnBookPanel    = $('btn-bookmarks-panel');
const btnHistPanel    = $('btn-history-panel');
const btnExtension    = $('btn-extension');
const blockedBadge    = $('blocked-badge');
const loadingInd      = $('loading-indicator');
const btnClearAddr    = $('btn-clear-address');
const newTabPage      = $('new-tab-page');
const newtabSearch    = $('newtab-search');
const quickLinks      = $('quick-links');

// Sidebars
const bookmarksSidebar = $('bookmarks-sidebar');
const historySidebar   = $('history-sidebar');
const bookmarksList    = $('bookmarks-list');
const historyList      = $('history-list');
const bookmarkSearch   = $('bookmark-search');
const historySearch    = $('history-search');
const overlay          = $('overlay');

// Extension panel
const extPanel        = $('extension-panel');
const adToggle        = $('adblocker-toggle');
const blockedCountEl  = $('blocked-count');   // renamed from blockedCount to avoid collision with state.blockedCount
const protStatus      = $('protection-status');
const blockedFeed     = $('blocked-feed');
const clearStatsBtn   = $('clear-stats-btn');

// Update toast
const updateToast    = $('update-toast');
const toastTitle     = $('toast-title');
const toastMsg       = $('toast-msg');
const toastRestart   = $('toast-restart-btn');
const toastDismiss   = $('toast-dismiss-btn');
const toastProgress  = $('toast-progress-wrap');
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
    setupKeyboardShortcuts();

    // Open initial tab
    createTab(state.settings.homepage || 'https://www.google.com');

    // Ensure webviews fill the full content area (safety net for Electron)
    requestAnimationFrame(() => resizeWebviews());
    window.addEventListener('resize', resizeWebviews);
  } catch (err) {
    console.error('MyBrowser failed to start:', err);
    document.body.innerHTML = `
      <div style="padding:40px;color:#e6edf3;font-family:Inter,sans-serif;text-align:center">
        <h1 style="color:#f85149;margin-bottom:12px">MyBrowser failed to start</h1>
        <p style="color:#8b949e">${err.message || err}</p>
        <p style="color:#484f58;margin-top:16px;font-size:12px">Try running: npm install && npm start</p>
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

  window.myBrowser.on('window-state', windowState => {
    const icon = $('maximize-icon');
    if (windowState === 'maximized') {
      icon.innerHTML = '<rect x="4" y="2" width="5" height="5" rx="0.5"/><rect x="2" y="4" width="5" height="5" rx="0.5"/>';
    } else {
      icon.innerHTML = '<rect x="2" y="2" width="6" height="6" rx="0.5"/>';
    }
  });
}

// ══════════════════════════════════════════════════════════════
//  TAB MANAGEMENT
// ══════════════════════════════════════════════════════════════
function createTab(url = '', background = false) {
  const id = state.nextTabId++;

  // ── Tab element ──
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.dataset.tabId = id;
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', 'false');

  const favWrap = document.createElement('div');
  favWrap.style.cssText = 'width:14px;height:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0';

  const fav = document.createElement('img');
  fav.className = 'tab-favicon';
  fav.src = getDefaultFavicon();
  fav.onerror = () => { fav.src = getDefaultFavicon(); };

  const loader = document.createElement('div');
  loader.className = 'tab-loading hidden';
  favWrap.appendChild(fav);
  favWrap.appendChild(loader); // ← always in DOM, toggled via 'hidden' class

  const title = document.createElement('span');
  title.className = 'tab-title';
  title.textContent = 'New Tab';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.innerHTML = '✕';
  closeBtn.title = 'Close Tab';
  closeBtn.addEventListener('click', e => { e.stopPropagation(); closeTab(id); });

  tab.append(favWrap, title, closeBtn);
  tab.addEventListener('click', () => switchTab(id));
  tabBar.appendChild(tab);

  // ── Webview ──
  const wv = document.createElement('webview');
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('webpreferences', 'contextIsolation=true, sandbox=false');
  wv.src = 'about:blank'; // required for WebContents attachment in Electron
  wv.style.cssText = 'position:absolute;top:0;right:0;bottom:0;left:0;border:none;display:none;';
  content.appendChild(wv);

  // Give this new webview explicit pixel dimensions right away
  const ch = content.offsetHeight, cw = content.offsetWidth;
  if (ch > 0 && cw > 0) { wv.style.height = ch + 'px'; wv.style.width = cw + 'px'; }

  const tabObj = {
    id, webview: wv, tab, titleEl: title, favEl: fav, favWrap, loader,
    url, title: 'New Tab', favicon: '', isNewTab: !url,
    webviewReady: false, pendingUrl: null
  };
  state.tabs.push(tabObj);

  setupWebviewEvents(tabObj);

  if (!background) {
    switchTab(id);
  }

  // Navigate
  const target = url || '';
  if (target) {
    navigate(target, tabObj);
  } else {
    showNewTabPage(true);
    if (!background) newtabSearch.focus();
  }

  return tabObj;
}

function closeTab(id) {
  const idx = state.tabs.findIndex(t => t.id === id);
  if (idx === -1) return;

  const tabObj = state.tabs[idx];
  tabObj.tab.remove();
  tabObj.webview.remove();
  state.tabs.splice(idx, 1);

  if (state.tabs.length === 0) {
    createTab();
    return;
  }

  if (state.activeTab?.id === id) {
    const newIdx = Math.min(idx, state.tabs.length - 1);
    switchTab(state.tabs[newIdx].id);
  }
}

function switchTab(id) {
  const tabObj = state.tabs.find(t => t.id === id);
  if (!tabObj) return;

  // Deactivate all
  state.tabs.forEach(t => {
    t.tab.classList.remove('active');
    t.tab.setAttribute('aria-selected', 'false');
    t.webview.classList.remove('active');
    t.webview.style.display = 'none';
  });

  // Activate target
  tabObj.tab.classList.add('active');
  tabObj.tab.setAttribute('aria-selected', 'true');
  tabObj.webview.classList.add('active');
  state.activeTab = tabObj;

  // Show/hide new-tab page based on whether this tab has a URL loaded
  if (isNewTabUrl(tabObj.url)) {
    newTabPage.classList.remove('hidden');
    tabObj.webview.style.display = 'none';
  } else {
    newTabPage.classList.add('hidden');
    tabObj.webview.style.display = 'block';
  }

  // Update toolbar
  updateToolbarForTab(tabObj);

  // Scroll tab into view
  tabObj.tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  requestAnimationFrame(() => resizeWebviews());
}

function updateToolbarForTab(tabObj) {
  const wv = tabObj.webview;
  addressBar.value = tabObj.url && !isNewTabUrl(tabObj.url) ? tabObj.url : '';
  
  // Update nav button states
  try {
    btnBack.disabled    = !wv.canGoBack?.();
    btnForward.disabled = !wv.canGoForward?.();
  } catch { btnBack.disabled = true; btnForward.disabled = true; }

  // Update bookmark button
  updateBookmarkButton(tabObj.url);

  // Update address bar clear button
  toggleClearBtn();
}

// ══════════════════════════════════════════════════════════════
//  WEBVIEW EVENTS
// ══════════════════════════════════════════════════════════════
function setupWebviewEvents(tabObj) {
  const wv = tabObj.webview;
  const { favEl, loader } = tabObj;

  wv.addEventListener('dom-ready', () => {
    tabObj.webviewReady = true;
    if (tabObj.pendingUrl) {
      const url = tabObj.pendingUrl;
      tabObj.pendingUrl = null;
      try { wv.loadURL(url); } catch (e) { console.error(e); }
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
    }

    // Update nav buttons
    if (state.activeTab?.id === tabObj.id) {
      btnBack.disabled    = !wv.canGoBack();
      btnForward.disabled = !wv.canGoForward();
    }

    // Add to history
    const url = wv.getURL();
    const title = wv.getTitle() || url;
    if (url && !isNewTabUrl(url) && !url.startsWith('about:')) {
      tabObj.url   = url;
      tabObj.title = title;
      await window.myBrowser.addHistory({ url, title, favicon: tabObj.favicon });
      if (state.activeTab?.id === tabObj.id) {
        addressBar.value = url;
        updateBookmarkButton(url);
        toggleClearBtn();
      }
    }
  });

  wv.addEventListener('did-navigate', (e) => {
    if (isNewTabUrl(e.url)) {
      if (!tabObj.pendingUrl) {
        tabObj.url = '';
        if (state.activeTab?.id === tabObj.id) {
          addressBar.value = '';
          btnBack.disabled    = !wv.canGoBack();
          btnForward.disabled = !wv.canGoForward();
          updateBookmarkButton('');
          toggleClearBtn();
          showNewTabPage(true, tabObj);
        }
      }
      return;
    }

    tabObj.url = e.url;
    if (state.activeTab?.id === tabObj.id) {
      showNewTabPage(false, tabObj);
      addressBar.value = e.url;
      btnBack.disabled    = !wv.canGoBack();
      btnForward.disabled = !wv.canGoForward();
      updateBookmarkButton(e.url);
      toggleClearBtn();
    }
  });

  wv.addEventListener('did-navigate-in-page', (e) => {
    tabObj.url = e.url;
    if (state.activeTab?.id === tabObj.id) {
      addressBar.value = e.url;
      btnBack.disabled    = !wv.canGoBack();
      btnForward.disabled = !wv.canGoForward();
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

  wv.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3) return; // Aborted (user navigated away)
    loader.classList.add('hidden');
    favEl.style.display = '';
    if (e.errorCode !== 0) tabObj.titleEl.textContent = 'Error';
    if (state.activeTab?.id === tabObj.id) {
      loadingInd.classList.add('hidden');
      btnReload.title = 'Reload (F5)';
    }
  });

  // New window → open as new tab (deprecated event, kept for compatibility)
  wv.addEventListener('new-window', (e) => {
    if (e.url && e.url !== 'about:blank') createTab(e.url);
  });

  // Modern setWindowOpenHandler equivalent via ipc (handled in main.js)
}

// ══════════════════════════════════════════════════════════════
//  NAVIGATION
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
}

function loadWebviewUrl(tabObj, url) {
  const wv = tabObj.webview;
  if (tabObj.webviewReady) {
    try { wv.loadURL(url); } catch (e) { console.error(e); }
  } else {
    tabObj.pendingUrl = url;
  }
}

function resolveUrl(input) {
  input = input.trim();
  if (!input) return '';

  // Already a valid URL with protocol
  try {
    const u = new URL(input);
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'file:') return input;
  } catch {}

  // localhost with optional port
  if (/^localhost(:\d+)?(\/?.*)?$/i.test(input)) {
    return 'http://' + input;
  }

  // IP address with optional port
  if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(input)) {
    return 'http://' + input;
  }

  // Has dots and a valid TLD → likely a domain
  if (/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}(:\d+)?(\/.*)?$/.test(input)) {
    return 'https://' + input;
  }

  // Otherwise → search query
  const engine = state.settings.searchEngine || 'https://www.google.com/search?q=';
  return engine + encodeURIComponent(input);
}

function isNewTabUrl(url) {
  return !url || url === 'about:blank' || url === '' || url === 'about:newtab';
}

function showNewTabPage(show, tabObj) {
  // If no tabObj provided, fall back to activeTab
  const tObj = tabObj || state.activeTab;
  if (show) {
    newTabPage.classList.remove('hidden');
    if (tObj) tObj.webview.style.display = 'none';
    if (tObj) tObj.isNewTab = true;
  } else {
    newTabPage.classList.add('hidden');
    if (tObj) tObj.webview.style.display = 'block';
    if (tObj) tObj.isNewTab = false;
  }
}

function getDefaultFavicon() {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='7' fill='%2330363d'/%3E%3C/svg%3E";
}

// ── Resize all webviews to fill the content area (belt-and-suspenders for Electron) ──
function resizeWebviews() {
  const h = content.offsetHeight;
  const w = content.offsetWidth;
  if (!h || !w) return;
  state.tabs.forEach(t => {
    // Only set explicit px if CSS inset isn't enough (Electron quirk)
    t.webview.style.width  = w + 'px';
    t.webview.style.height = h + 'px';
  });
}

// ══════════════════════════════════════════════════════════════
//  TOOLBAR SETUP
// ══════════════════════════════════════════════════════════════
function setupToolbar() {
  // Navigation
  btnBack.addEventListener('click', () => state.activeTab?.webview.goBack());
  btnForward.addEventListener('click', () => state.activeTab?.webview.goForward());
  btnHome.addEventListener('click', () => navigate(state.settings.homepage || 'https://www.google.com'));

  btnReload.addEventListener('click', () => {
    const wv = state.activeTab?.webview;
    if (!wv) return;
    try {
      if (wv.isLoading()) wv.stop();
      else wv.reload();
    } catch { wv.reload(); }
  });

  // Address bar
  addressBar.addEventListener('keydown', e => {
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

  addressBar.addEventListener('input', toggleClearBtn);
  addressBar.addEventListener('focus', () => {
    addressBar.select();
    toggleClearBtn();
  });
  addressBar.addEventListener('blur', () => {
    if (state.activeTab?.url) addressBar.value = isNewTabUrl(state.activeTab.url) ? '' : state.activeTab.url;
    toggleClearBtn();
  });

  btnClearAddr.addEventListener('click', () => {
    addressBar.value = '';
    addressBar.focus();
    toggleClearBtn();
  });

  // New tab
  $('btn-new-tab').addEventListener('click', () => createTab());

  // Bookmark toggle
  btnBookmark.addEventListener('click', toggleBookmark);

  // Panel toggles
  btnBookPanel.addEventListener('click',  () => togglePanel('bookmarks'));
  btnHistPanel.addEventListener('click',  () => togglePanel('history'));
  btnExtension.addEventListener('click',  () => toggleExtPanel());
  $('btn-settings').addEventListener('click', () => toggleSettingsPanel());

  // Overlay closes panels
  overlay.addEventListener('click', closeAllPanels);
}

function toggleClearBtn() {
  if (addressBar.value.length > 0) {
    btnClearAddr.classList.remove('hidden');
  } else {
    btnClearAddr.classList.add('hidden');
  }
}

// ══════════════════════════════════════════════════════════════
//  BOOKMARK BUTTON
// ══════════════════════════════════════════════════════════════
async function updateBookmarkButton(url) {
  if (!url || isNewTabUrl(url)) {
    btnBookmark.classList.remove('bookmarked');
    return;
  }
  const isBookmarked = await window.myBrowser.isBookmarked(url);
  if (isBookmarked) btnBookmark.classList.add('bookmarked');
  else              btnBookmark.classList.remove('bookmarked');
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
    // Refresh if sidebar open
    if (bookmarksSidebar.classList.contains('open')) renderBookmarks();
  }
}

// ══════════════════════════════════════════════════════════════
//  PANEL MANAGEMENT
// ══════════════════════════════════════════════════════════════
function togglePanel(name) {
  const sidebar = name === 'bookmarks' ? bookmarksSidebar : historySidebar;
  const isOpen  = sidebar.classList.contains('open');

  closeAllPanels();
  if (!isOpen) {
    sidebar.classList.add('open');
    sidebar.setAttribute('aria-hidden', 'false');
    overlay.classList.remove('hidden');
    if (name === 'bookmarks') renderBookmarks();
    else renderHistory();
  }
}

function toggleExtPanel() {
  const isOpen = extPanel.classList.contains('open');
  closeAllPanels();
  if (!isOpen) {
    extPanel.classList.add('open');
    extPanel.setAttribute('aria-hidden', 'false');
    refreshExtPanel();
  }
}

function closeAllPanels() {
  bookmarksSidebar.classList.remove('open');
  historySidebar.classList.remove('open');
  extPanel.classList.remove('open');
  const settPanel = $('settings-panel');
  if (settPanel) { settPanel.classList.add('hidden'); settPanel.setAttribute('aria-hidden', 'true'); }
  [bookmarksSidebar, historySidebar, extPanel].forEach(el => el.setAttribute('aria-hidden', 'true'));
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
    // Populate current settings
    $('settings-homepage').value      = state.settings.homepage || '';
    $('settings-search-engine').value = state.settings.searchEngine || '';
    $('settings-adblocker').checked   = state.adBlockerEnabled;
    overlay.classList.remove('hidden');
  }
}

function setupSettings() {
  const panel = $('settings-panel');
  if (!panel) return;

  $('close-settings').addEventListener('click', () => closeAllPanels());

  $('settings-save').addEventListener('click', async () => {
    const homepage     = $('settings-homepage').value.trim() || 'https://www.google.com';
    const searchEngine = $('settings-search-engine').value.trim() || 'https://www.google.com/search?q=';
    const adBlocker    = $('settings-adblocker').checked;

    state.settings = await window.myBrowser.saveSettings({ homepage, searchEngine, adBlockerEnabled: adBlocker });

    if (adBlocker !== state.adBlockerEnabled) {
      const result = await window.myBrowser.toggleAdBlocker(adBlocker);
      state.adBlockerEnabled = result.enabled;
      adToggle.checked = result.enabled;
      protStatus.textContent = result.enabled ? 'ON' : 'OFF';
      protStatus.className   = 'stat-val ' + (result.enabled ? 'status-on' : 'status-off');
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
  toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

// ══════════════════════════════════════════════════════════════
//  NEW TAB PAGE
// ══════════════════════════════════════════════════════════════
function setupNewTabPage() {
  newtabSearch.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const val = newtabSearch.value.trim();
      if (val) {
        navigate(val);
        newtabSearch.value = '';
        addressBar.value = '';
      }
    }
  });

  quickLinks.addEventListener('click', e => {
    const link = e.target.closest('.ql-item');
    if (!link) return;
    e.preventDefault();
    const url = link.dataset.url;
    if (url) navigate(url);
  });
}

// ══════════════════════════════════════════════════════════════
//  BOOKMARKS SIDEBAR
// ══════════════════════════════════════════════════════════════
function setupSidebars() {
  $('close-bookmarks').addEventListener('click', () => closeAllPanels());
  $('close-history').addEventListener('click',   () => closeAllPanels());

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
      <img class="sidebar-item-favicon" src="${b.favicon || getDefaultFavicon()}" alt="" onerror="this.src='${getDefaultFavicon()}'">
      <div class="sidebar-item-info">
        <div class="sidebar-item-title" title="${escHtml(b.title || b.url)}">${escHtml(b.title || b.url)}</div>
        <div class="sidebar-item-url">${escHtml(b.url)}</div>
      </div>
      <button class="sidebar-item-del" data-action="delete" data-url="${escHtml(b.url)}" title="Remove bookmark">✕</button>
    </div>
  `).join('');

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

// ══════════════════════════════════════════════════════════════
//  HISTORY SIDEBAR
// ══════════════════════════════════════════════════════════════
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

  // Group by date
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
        <img class="sidebar-item-favicon" src="${h.favicon || getDefaultFavicon()}" alt="" onerror="this.src='${getDefaultFavicon()}'">
        <div class="sidebar-item-info">
          <div class="sidebar-item-title">${escHtml(h.title || h.url)}</div>
          <div class="sidebar-item-url">${escHtml(h.url)}</div>
        </div>
        <span class="sidebar-item-time">${new Date(h.visitedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
      </div>
    `).join('');
  }
  historyList.innerHTML = html;

  historyList.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
      navigate(item.dataset.url);
      closeAllPanels();
    });
  });
}

// ══════════════════════════════════════════════════════════════
//  EXTENSION PANEL (AD BLOCKER)
// ══════════════════════════════════════════════════════════════
function setupExtensionPanel() {
  adToggle.addEventListener('change', async () => {
    const enabled = adToggle.checked;
    const result = await window.myBrowser.toggleAdBlocker(enabled);
    state.adBlockerEnabled = result.enabled;
    updateAdBlockerUI({ enabled: result.enabled, count: result.count });
  });

  clearStatsBtn.addEventListener('click', async () => {
    const result = await window.myBrowser.clearAdBlockerStats();
    state.blockedCount = 0;
    updateAdBlockerUI({ enabled: state.adBlockerEnabled, count: 0, recent: [] });
    blockedBadge.textContent = '0';
    blockedFeed.innerHTML = `<div class="empty-state small"><div class="empty-icon">✅</div><p>All clear! No ads blocked<br>on this page yet.</p></div>`;
  });

  // Listen for real-time blocked events
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
      <span class="blocked-item-time">${item.time || ''}</span>
    </div>
  `).join('');
}

// ══════════════════════════════════════════════════════════════
//  AUTO-UPDATE TOAST
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

// ══════════════════════════════════════════════════════════════
//  GLOBAL EVENTS
// ══════════════════════════════════════════════════════════════
function setupGlobalEvents() {
  // Open new tab from main process
  window.myBrowser.on('open-new-tab', url => createTab(url));
}

// ══════════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ══════════════════════════════════════════════════════════════
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && e.key === 't') { e.preventDefault(); createTab(); }
    if (ctrl && e.key === 'w') { e.preventDefault(); if (state.activeTab) closeTab(state.activeTab.id); }
    if (ctrl && e.key === 'l') { e.preventDefault(); addressBar.select(); addressBar.focus(); }
    if (ctrl && e.key === 'd') { e.preventDefault(); toggleBookmark(); }
    if (ctrl && e.key === 'h') { e.preventDefault(); togglePanel('history'); }
    if (ctrl && e.key === 'b') { e.preventDefault(); togglePanel('bookmarks'); }
    if (e.key === 'F5')        { e.preventDefault(); state.activeTab?.webview.reload(); }
    if (e.key === 'Escape') {
      if (!overlay.classList.contains('hidden') || extPanel.classList.contains('open')) {
        closeAllPanels();
      } else {
        const wv = state.activeTab?.webview;
        if (wv) {
          try { if (wv.isLoading()) wv.stop(); } catch { /* ignore */ }
        }
      }
    }

    // Ctrl+Tab / Ctrl+Shift+Tab — switch tabs
    if (ctrl && e.key === 'Tab') {
      e.preventDefault();
      const idx = state.tabs.findIndex(t => t.id === state.activeTab?.id);
      const next = e.shiftKey
        ? (idx - 1 + state.tabs.length) % state.tabs.length
        : (idx + 1) % state.tabs.length;
      switchTab(state.tabs[next].id);
    }

    // Ctrl+1..8 — jump to tab
    if (ctrl && e.key >= '1' && e.key <= '8') {
      const idx = parseInt(e.key) - 1;
      if (state.tabs[idx]) switchTab(state.tabs[idx].id);
    }
    // Ctrl+9 — last tab
    if (ctrl && e.key === '9') {
      if (state.tabs.length > 0) switchTab(state.tabs[state.tabs.length - 1].id);
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

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
