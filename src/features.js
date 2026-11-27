/* ═══════════════════════════════════════════════════════════════
   MyBrowser — Power Features Module
   Downloads · Find in Page · Reader Mode · Command Palette
   Omnibox Autocomplete · Context Menu & Tooltip · Screenshot · PiP · Web Panels
   ═══════════════════════════════════════════════════════════════ */

'use strict';

(function () {
  const app = () => window.MyBrowserApp;

  // ── 1. DOWNLOADS MANAGER ────────────────────────────────────
  let latestDownloads = [];

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  }

  function updateDownloadsBadge(list) {
    const badge = app().$('downloads-badge');
    if (!badge) return;
    const active = list.filter(d => d.state === 'progressing').length;
    if (active > 0) {
      badge.textContent = active;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  async function renderDownloads() {
    const listEl = app().$('downloads-list');
    if (!listEl) return;
    latestDownloads = await window.myBrowser.getDownloads();
    updateDownloadsBadge(latestDownloads);

    if (latestDownloads.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">⬇️</div><p>No downloads yet.</p></div>`;
      return;
    }

    const esc = app().escHtml;
    listEl.innerHTML = latestDownloads.map(d => {
      const pct = d.totalBytes > 0 ? Math.min(100, Math.round((d.receivedBytes / d.totalBytes) * 100)) : 0;
      const statusText = d.state === 'completed'
        ? `Completed · ${formatBytes(d.totalBytes || d.receivedBytes)}`
        : d.state === 'cancelled'
        ? 'Cancelled'
        : d.state === 'interrupted'
        ? 'Interrupted'
        : `${d.isPaused ? 'Paused' : 'Downloading'} · ${formatBytes(d.receivedBytes)}${d.totalBytes ? ' / ' + formatBytes(d.totalBytes) : ''} (${pct}%)`;

      const actions = d.state === 'progressing'
        ? `${d.isPaused
            ? `<button class="dl-btn" data-dl-act="resume" data-dl-id="${d.id}">Resume</button>`
            : `<button class="dl-btn" data-dl-act="pause" data-dl-id="${d.id}">Pause</button>`}
           <button class="dl-btn" data-dl-act="cancel" data-dl-id="${d.id}">Cancel</button>`
        : d.state === 'completed'
        ? `<button class="dl-btn" data-dl-act="open" data-dl-path="${esc(d.savePath)}">Open</button>
           <button class="dl-btn" data-dl-act="folder" data-dl-path="${esc(d.savePath)}">Show in Folder</button>`
        : '';

      return `
        <div class="dl-item">
          <div class="dl-top">
            <span class="dl-name" title="${esc(d.filename)}">${esc(d.filename)}</span>
          </div>
          <div class="dl-meta">${esc(statusText)}</div>
          ${d.state === 'progressing' ? `<div class="dl-bar-wrap"><div class="dl-bar" style="width:${pct}%"></div></div>` : ''}
          ${actions ? `<div class="dl-actions">${actions}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  function setupDownloads() {
    app().$('clear-downloads-btn')?.addEventListener('click', async () => {
      await window.myBrowser.clearDownloads();
      renderDownloads();
    });

    app().$('downloads-list')?.addEventListener('click', async e => {
      const btn = e.target.closest('[data-dl-act]');
      if (!btn) return;
      const act = btn.dataset.dlAct;
      const id = Number(btn.dataset.dlId);
      const filePath = btn.dataset.dlPath;
      if (act === 'pause')  await window.myBrowser.pauseDownload(id);
      if (act === 'resume') await window.myBrowser.resumeDownload(id);
      if (act === 'cancel') await window.myBrowser.cancelDownload(id);
      if (act === 'open')   await window.myBrowser.openDownload(filePath);
      if (act === 'folder') await window.myBrowser.showDownloadInFolder(filePath);
      renderDownloads();
    });

    window.myBrowser.on('download-updated', data => {
      if (data?.list) {
        latestDownloads = data.list;
        updateDownloadsBadge(latestDownloads);
      }
      if (data?.state === 'completed') {
        app().showToastNotification(`Downloaded: ${data.filename}`);
      }
      if (app().$('downloads-sidebar')?.classList.contains('open')) {
        renderDownloads();
      }
    });
  }

  // ── 2. FIND IN PAGE (Ctrl+F) ────────────────────────────────
  let findMatchCase = false;

  function openFindBar() {
    const bar = app().$('find-bar');
    const inp = app().$('find-input');
    if (!bar || !inp) return;
    bar.classList.remove('hidden');
    inp.focus();
    inp.select();
    if (inp.value) runFindInPage(true, false);
  }

  function closeFindBar() {
    const bar = app().$('find-bar');
    if (!bar) return;
    bar.classList.add('hidden');
    app().$('find-count').textContent = '0 / 0';
    try { app().state.activeTab?.webview?.stopFindInPage('clearSelection'); } catch {}
  }

  function runFindInPage(forward = true, findNext = false) {
    const q = app().$('find-input')?.value || '';
    const wv = app().state.activeTab?.webview;
    if (!wv || !app().state.activeTab?.webviewReady) return;
    if (!q) {
      app().$('find-count').textContent = '0 / 0';
      try { wv.stopFindInPage('clearSelection'); } catch {}
      return;
    }
    try { wv.findInPage(q, { forward, findNext, matchCase: findMatchCase }); } catch {}
  }

  function onFindInPageResult(result) {
    const el = app().$('find-count');
    if (!el || !result) return;
    el.textContent = `${result.activeMatchOrdinal || 0} / ${result.matches || 0}`;
  }

  function setupFindBar() {
    const inp = app().$('find-input');
    inp?.addEventListener('input', () => runFindInPage(true, false));
    inp?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runFindInPage(!e.shiftKey, true);
      } else if (e.key === 'Escape') {
        closeFindBar();
      }
    });
    app().$('find-next')?.addEventListener('click', () => runFindInPage(true, true));
    app().$('find-prev')?.addEventListener('click', () => runFindInPage(false, true));
    app().$('find-case')?.addEventListener('click', () => {
      findMatchCase = !findMatchCase;
      app().$('find-case').classList.toggle('active', findMatchCase);
      runFindInPage(true, false);
    });
    app().$('find-close')?.addEventListener('click', closeFindBar);
  }

  // ── 3. READER MODE (Alt+R) ──────────────────────────────────
  let readerFontSize = 18;

  async function toggleReaderMode() {
    const overlayEl = app().$('reader-overlay');
    const btn = app().$('btn-reader');
    if (!overlayEl) return;
    if (!overlayEl.classList.contains('hidden')) {
      closeReaderMode();
      return;
    }
    const tab = app().state.activeTab;
    if (!tab || !tab.webviewReady || app().isNewTabUrl(tab.url)) {
      app().showToastNotification('Open a webpage first to use Reader Mode');
      return;
    }

    try {
      const extracted = await tab.webview.executeJavaScript(`(() => {
        const root = document.querySelector('article')
          || document.querySelector('main')
          || document.querySelector('[role="main"]')
          || document.body;
        if (!root) return null;
        const h1 = document.querySelector('h1')?.innerText?.trim() || document.title || '';
        const blocks = Array.from(root.querySelectorAll('h2, h3, p, li, blockquote, pre'))
          .map(el => ({
            tag: el.tagName.toLowerCase(),
            text: (el.innerText || '').trim()
          }))
          .filter(b => b.text.length > 20 || b.tag.startsWith('h'));
        return { title: h1, blocks: blocks.slice(0, 200) };
      })()`);

      if (!extracted || extracted.blocks.length === 0) {
        app().showToastNotification('No readable article detected on this page');
        return;
      }

      const esc = app().escHtml;
      const bodyEl = app().$('reader-article-body');
      const words = extracted.blocks.reduce((acc, b) => acc + b.text.split(/\s+/).length, 0);
      const mins = Math.max(1, Math.round(words / 220));
      app().$('reader-read-time').textContent = `· ${mins} min read`;

      bodyEl.innerHTML = `<h1>${esc(extracted.title)}</h1>` + extracted.blocks.map(b => {
        const tag = ['h2', 'h3', 'p', 'blockquote', 'pre'].includes(b.tag) ? b.tag : 'p';
        return `<${tag}>${esc(b.text)}</${tag}>`;
      }).join('');
      bodyEl.style.fontSize = readerFontSize + 'px';

      overlayEl.classList.remove('hidden');
      btn?.classList.add('active');
    } catch {
      app().showToastNotification('Unable to open Reader Mode on this page');
    }
  }

  function closeReaderMode() {
    app().$('reader-overlay')?.classList.add('hidden');
    app().$('btn-reader')?.classList.remove('active');
  }

  function setupReaderMode() {
    app().$('btn-reader')?.addEventListener('click', toggleReaderMode);
    app().$('reader-close')?.addEventListener('click', closeReaderMode);
    app().$('reader-font-inc')?.addEventListener('click', () => {
      readerFontSize = Math.min(28, readerFontSize + 2);
      app().$('reader-article-body').style.fontSize = readerFontSize + 'px';
    });
    app().$('reader-font-dec')?.addEventListener('click', () => {
      readerFontSize = Math.max(13, readerFontSize - 2);
      app().$('reader-article-body').style.fontSize = readerFontSize + 'px';
    });
    document.querySelectorAll('.reader-theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const el = app().$('reader-overlay');
        el.classList.remove('theme-dark', 'theme-sepia', 'theme-light');
        el.classList.add('theme-' + btn.dataset.theme);
      });
    });
  }

  // ── 4. SCREENSHOT & PICTURE-IN-PICTURE ──────────────────────
  async function captureActiveScreenshot() {
    const tab = app().state.activeTab;
    if (!tab) return;
    let wcId = null;
    if (tab.webviewReady && !app().isNewTabUrl(tab.url)) {
      try { wcId = tab.webview.getWebContentsId(); } catch {}
    }
    const res = await window.myBrowser.captureWebview(wcId);
    if (res?.ok) {
      app().showToastNotification('Screenshot copied to clipboard & saved to Downloads!');
    } else {
      app().showToastNotification('Screenshot failed');
    }
  }

  async function togglePictureInPicture() {
    const tab = app().state.activeTab;
    if (!tab || !tab.webviewReady || app().isNewTabUrl(tab.url)) {
      app().showToastNotification('Open a video page first');
      return;
    }
    try {
      const status = await tab.webview.executeJavaScript(`(async () => {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
          return 'exited';
        }
        const vids = Array.from(document.querySelectorAll('video'));
        const v = vids.find(x => !x.paused && x.readyState > 1) || vids[0];
        if (!v) return 'none';
        await v.requestPictureInPicture();
        return 'entered';
      })()`);
      if (status === 'entered') app().showToastNotification('Picture-in-Picture enabled');
      else if (status === 'exited') app().showToastNotification('Picture-in-Picture closed');
      else app().showToastNotification('No playable video found on this page');
    } catch {
      app().showToastNotification('Video blocked Picture-in-Picture on this site');
    }
  }

  function setupMediaAndCapture() {
    app().$('btn-screenshot')?.addEventListener('click', captureActiveScreenshot);
    app().$('btn-pip')?.addEventListener('click', togglePictureInPicture);
  }

  // ── 5. OMNIBOX AUTOCOMPLETE ─────────────────────────────────
  let omniItems = [];
  let omniIndex = -1;

  async function updateOmnibox(query) {
    const dd = app().$('omnibox-dropdown');
    if (!dd) return;
    const q = String(query || '').trim().toLowerCase();
    if (!q) {
      dd.classList.add('hidden');
      omniItems = [];
      omniIndex = -1;
      return;
    }

    const [bookmarks, history] = await Promise.all([
      window.myBrowser.getBookmarks(),
      window.myBrowser.getHistory()
    ]);

    const items = [];
    app().state.tabs.forEach(t => {
      if (t.url && ((t.title || '').toLowerCase().includes(q) || t.url.toLowerCase().includes(q))) {
        items.push({ kind: 'tab', title: t.title || t.url, url: t.url, tabId: t.id });
      }
    });
    bookmarks.forEach(b => {
      if ((b.title || '').toLowerCase().includes(q) || (b.url || '').toLowerCase().includes(q)) {
        items.push({ kind: 'bookmark', title: b.title || b.url, url: b.url });
      }
    });
    history.forEach(h => {
      if (items.length < 8 && ((h.title || '').toLowerCase().includes(q) || (h.url || '').toLowerCase().includes(q))) {
        if (!items.some(i => i.url === h.url)) {
          items.push({ kind: 'history', title: h.title || h.url, url: h.url });
        }
      }
    });

    items.unshift({ kind: 'search', title: query.trim(), url: query.trim() });
    omniItems = items.slice(0, 8);
    omniIndex = -1;

    const esc = app().escHtml;
    dd.innerHTML = omniItems.map((it, i) => `
      <div class="omni-item" data-kind="${it.kind}" data-omni-idx="${i}" role="option">
        <span class="omni-badge">${it.kind}</span>
        <div class="omni-text">
          <div class="omni-title">${esc(it.title)}</div>
          <div class="omni-url">${it.kind === 'search' ? 'Press Enter to search or open URL' : esc(it.url)}</div>
        </div>
      </div>
    `).join('');
    dd.classList.remove('hidden');
  }

  function applyOmniboxChoice(item) {
    if (!item) return;
    app().$('omnibox-dropdown')?.classList.add('hidden');
    if (item.kind === 'tab' && item.tabId) {
      app().switchTab(item.tabId);
    } else {
      app().navigate(item.url);
    }
    app().$('address-bar')?.blur();
  }

  function handleOmniboxKey(e) {
    const dd = app().$('omnibox-dropdown');
    if (!dd || dd.classList.contains('hidden') || omniItems.length === 0) return false;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      omniIndex = (omniIndex + 1) % omniItems.length;
      highlightOmni();
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      omniIndex = (omniIndex - 1 + omniItems.length) % omniItems.length;
      highlightOmni();
      return true;
    }
    if (e.key === 'Enter' && omniIndex >= 0) {
      e.preventDefault();
      applyOmniboxChoice(omniItems[omniIndex]);
      return true;
    }
    if (e.key === 'Escape') {
      dd.classList.add('hidden');
      omniIndex = -1;
      return false;
    }
    return false;
  }

  function highlightOmni() {
    const dd = app().$('omnibox-dropdown');
    dd.querySelectorAll('.omni-item').forEach((el, i) => {
      el.classList.toggle('selected', i === omniIndex);
    });
  }

  function setupOmnibox() {
    app().$('omnibox-dropdown')?.addEventListener('mousedown', e => {
      const row = e.target.closest('[data-omni-idx]');
      if (!row) return;
      e.preventDefault();
      applyOmniboxChoice(omniItems[Number(row.dataset.omniIdx)]);
    });
  }

  // ── 6. COMMAND PALETTE (Ctrl+K) ─────────────────────────────
  let cpItems = [];
  let cpIndex = 0;

  function buildCommandActions() {
    const a = app();
    return [
      { kind: 'action', title: 'New Tab', hint: 'Ctrl+T', run: () => a.createTab() },
      { kind: 'action', title: 'New Private / Incognito Window', hint: 'Ctrl+Shift+N', run: () => window.myBrowser.newPrivateWindow() },
      { kind: 'action', title: 'Reopen Closed Tab', hint: 'Ctrl+Shift+T', run: () => a.reopenClosedTab() },
      { kind: 'action', title: 'Toggle Split View', hint: 'Alt+S', run: () => a.toggleSplitView() },
      { kind: 'action', title: 'Toggle Vertical Tabs', hint: 'Ctrl+Shift+V', run: () => a.toggleVerticalTabs() },
      { kind: 'action', title: 'Toggle Reader Mode', hint: 'Alt+R', run: () => toggleReaderMode() },
      { kind: 'action', title: 'Find in Page', hint: 'Ctrl+F', run: () => openFindBar() },
      { kind: 'action', title: 'Capture Screenshot', hint: 'Ctrl+Shift+S', run: () => captureActiveScreenshot() },
      { kind: 'action', title: 'Toggle Picture-in-Picture', hint: 'Video PiP', run: () => togglePictureInPicture() },
      { kind: 'action', title: 'Open Downloads', hint: 'Ctrl+J', run: () => a.togglePanel('downloads') },
      { kind: 'action', title: 'Open Bookmarks', hint: 'Ctrl+B', run: () => a.togglePanel('bookmarks') },
      { kind: 'action', title: 'Open History', hint: 'Ctrl+H', run: () => a.togglePanel('history') },
      { kind: 'action', title: 'Open Side Panels (Notes / Calc / Web)', hint: 'Panel', run: () => a.togglePanel('webpanel') },
      { kind: 'action', title: 'Open Privacy & Ad Blocker', hint: 'Shield', run: () => a.toggleExtPanel() },
      { kind: 'action', title: 'Open Settings', hint: 'Prefs', run: () => a.toggleSettingsPanel() },
      { kind: 'action', title: 'Zoom In', hint: 'Ctrl++', run: () => a.stepTabZoom(1) },
      { kind: 'action', title: 'Zoom Out', hint: 'Ctrl+-', run: () => a.stepTabZoom(-1) },
      { kind: 'action', title: 'Reset Zoom (100%)', hint: 'Ctrl+0', run: () => a.setTabZoom(a.state.activeTab, 1.0) }
    ];
  }

  async function renderCommandPalette(filter = '') {
    const q = filter.trim().toLowerCase();
    const list = [];
    app().state.tabs.forEach((t, idx) => {
      list.push({
        kind: 'tab',
        title: `Tab ${idx + 1}: ${t.title || 'New Tab'}`,
        hint: t.url ? t.url.slice(0, 32) : 'New Tab',
        run: () => app().switchTab(t.id)
      });
    });
    buildCommandActions().forEach(act => list.push(act));

    const bookmarks = await window.myBrowser.getBookmarks();
    bookmarks.slice(0, 20).forEach(b => {
      list.push({ kind: 'bookmark', title: b.title || b.url, hint: b.url.slice(0, 32), run: () => app().navigate(b.url) });
    });

    cpItems = q
      ? list.filter(it => it.title.toLowerCase().includes(q) || (it.hint || '').toLowerCase().includes(q)).slice(0, 14)
      : list.slice(0, 14);
    cpIndex = 0;

    const esc = app().escHtml;
    const resEl = app().$('cp-results');
    if (!resEl) return;
    resEl.innerHTML = cpItems.map((it, idx) => `
      <div class="cp-item ${idx === 0 ? 'selected' : ''}" data-cp-idx="${idx}" role="option">
        <div class="cp-item-left">
          <span class="cp-kind">${it.kind}</span>
          <span class="cp-title">${esc(it.title)}</span>
        </div>
        <span class="cp-hint">${esc(it.hint)}</span>
      </div>
    `).join('');
  }

  function openCommandPalette() {
    const wrap = app().$('command-palette-wrap');
    const inp = app().$('cp-input');
    if (!wrap || !inp) return;
    wrap.classList.remove('hidden');
    inp.value = '';
    renderCommandPalette('');
    inp.focus();
  }

  function closeCommandPalette() {
    app().$('command-palette-wrap')?.classList.add('hidden');
  }

  function toggleCommandPalette() {
    const wrap = app().$('command-palette-wrap');
    if (!wrap) return;
    if (wrap.classList.contains('hidden')) openCommandPalette();
    else closeCommandPalette();
  }

  function setupCommandPalette() {
    app().$('btn-command-palette')?.addEventListener('click', toggleCommandPalette);
    app().$('command-palette-wrap')?.addEventListener('click', e => {
      if (e.target.id === 'command-palette-wrap') closeCommandPalette();
    });

    const inp = app().$('cp-input');
    inp?.addEventListener('input', () => renderCommandPalette(inp.value));
    inp?.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (cpItems.length) cpIndex = (cpIndex + 1) % cpItems.length;
        updateCpSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (cpItems.length) cpIndex = (cpIndex - 1 + cpItems.length) % cpItems.length;
        updateCpSelection();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = cpItems[cpIndex];
        closeCommandPalette();
        chosen?.run();
      } else if (e.key === 'Escape') {
        closeCommandPalette();
      }
    });

    app().$('cp-results')?.addEventListener('click', e => {
      const row = e.target.closest('[data-cp-idx]');
      if (!row) return;
      const chosen = cpItems[Number(row.dataset.cpIdx)];
      closeCommandPalette();
      chosen?.run();
    });
  }

  function updateCpSelection() {
    app().$('cp-results')?.querySelectorAll('.cp-item').forEach((el, i) => {
      el.classList.toggle('selected', i === cpIndex);
      if (i === cpIndex) el.scrollIntoView({ block: 'nearest' });
    });
  }

  // ── 7. TAB CONTEXT MENU & HOVER PREVIEW TOOLTIP ─────────────
  let tooltipTimer = null;

  function hideTabContextMenu() {
    app().$('tab-context-menu')?.classList.add('hidden');
  }

  function hideTabTooltip() {
    clearTimeout(tooltipTimer);
    app().$('tab-tooltip')?.classList.add('hidden');
  }

  function showTabContextMenu(tabObj, x, y) {
    hideTabTooltip();
    const menu = app().$('tab-context-menu');
    if (!menu) return;
    menu.innerHTML = `
      <button class="ctx-item" data-ctx="pin">${tabObj.pinned ? 'Unpin Tab' : 'Pin Tab'}</button>
      <button class="ctx-item" data-ctx="mute">${tabObj.muted ? 'Unmute Tab' : 'Mute Tab'}</button>
      <button class="ctx-item" data-ctx="dup">Duplicate Tab</button>
      <button class="ctx-item" data-ctx="split">Split View</button>
      <div class="ctx-sep"></div>
      <div class="ctx-colors" title="Group color">
        <span style="font-size:11px;color:var(--text-secondary);margin-right:2px">Group:</span>
        <button class="ctx-color-dot" data-color="none" title="None"></button>
        <button class="ctx-color-dot" data-color="purple" title="Purple"></button>
        <button class="ctx-color-dot" data-color="cyan" title="Cyan"></button>
        <button class="ctx-color-dot" data-color="green" title="Green"></button>
        <button class="ctx-color-dot" data-color="amber" title="Amber"></button>
        <button class="ctx-color-dot" data-color="red" title="Red"></button>
      </div>
      <div class="ctx-sep"></div>
      <button class="ctx-item" data-ctx="reopen">Reopen Closed Tab</button>
      <button class="ctx-item" data-ctx="close-others">Close Other Tabs</button>
      <button class="ctx-item danger" data-ctx="close">Close Tab</button>
    `;

    menu.style.left = Math.min(x, window.innerWidth - 210) + 'px';
    menu.style.top  = Math.min(y, window.innerHeight - 280) + 'px';
    menu.classList.remove('hidden');

    menu.onclick = e => {
      const dot = e.target.closest('.ctx-color-dot');
      if (dot) {
        app().setTabGroup(tabObj, dot.dataset.color);
        hideTabContextMenu();
        return;
      }
      const btn = e.target.closest('[data-ctx]');
      if (!btn) return;
      const act = btn.dataset.ctx;
      hideTabContextMenu();
      if (act === 'pin') app().togglePinTab(tabObj);
      else if (act === 'mute') app().toggleMuteTab(tabObj);
      else if (act === 'dup') app().duplicateTab(tabObj);
      else if (act === 'split') { app().switchTab(tabObj.id); app().toggleSplitView(); }
      else if (act === 'reopen') app().reopenClosedTab();
      else if (act === 'close-others') {
        app().state.tabs.filter(t => t.id !== tabObj.id && !t.pinned).forEach(t => app().closeTab(t.id));
      }
      else if (act === 'close') app().closeTab(tabObj.id);
    };
  }

  function attachTabInteractions(tabObj) {
    tabObj.tab.addEventListener('contextmenu', e => {
      e.preventDefault();
      showTabContextMenu(tabObj, e.clientX, e.clientY);
    });

    tabObj.tab.addEventListener('mouseenter', () => {
      clearTimeout(tooltipTimer);
      tooltipTimer = setTimeout(() => {
        const tt = app().$('tab-tooltip');
        if (!tt) return;
        const rect = tabObj.tab.getBoundingClientRect();
        const esc = app().escHtml;
        const metaParts = [];
        if (tabObj.pinned) metaParts.push('Pinned');
        if (tabObj.muted) metaParts.push('Muted');
        if (tabObj.zoomFactor !== 1.0) metaParts.push(`${Math.round(tabObj.zoomFactor * 100)}% Zoom`);

        tt.innerHTML = `
          <div class="tt-title">${esc(tabObj.title || 'New Tab')}</div>
          <div class="tt-url">${esc(tabObj.url || 'New Tab Page')}</div>
          ${metaParts.length ? `<div class="tt-meta">${esc(metaParts.join(' · '))}</div>` : ''}
        `;
        tt.style.left = Math.min(rect.left, window.innerWidth - 290) + 'px';
        tt.style.top  = (rect.bottom + 6) + 'px';
        tt.classList.remove('hidden');
      }, 420);
    });

    tabObj.tab.addEventListener('mouseleave', hideTabTooltip);
  }

  function setupGlobalMenus() {
    document.addEventListener('click', e => {
      if (!e.target.closest('#tab-context-menu')) hideTabContextMenu();
    });
    window.addEventListener('blur', () => { hideTabContextMenu(); hideTabTooltip(); });
  }

  // ── 8. SIDEBAR WEB PANELS (Notes, Calc, Side Browser) ────────
  function setupWebPanels() {
    const notes = app().$('wp-notes-area');
    if (notes) {
      notes.value = localStorage.getItem('mybrowser_side_notes') || '';
      notes.addEventListener('input', () => localStorage.setItem('mybrowser_side_notes', notes.value));
    }

    const calcIn = app().$('wp-calc-input');
    const calcOut = app().$('wp-calc-result');
    function evalMathExpr(raw) {
      const tokens = raw.replace(/\s+/g, '').match(/\d+(?:\.\d+)?|[+\-*/%^()]/g);
      if (!tokens || tokens.join('') !== raw.replace(/\s+/g, '')) throw new Error('bad');
      let pos = 0;
      const peek = () => tokens[pos];
      const eat = () => tokens[pos++];
      function parseExpr() {
        let v = parseTerm();
        while (peek() === '+' || peek() === '-') {
          const op = eat();
          v = op === '+' ? v + parseTerm() : v - parseTerm();
        }
        return v;
      }
      function parseTerm() {
        let v = parsePow();
        while (peek() === '*' || peek() === '/' || peek() === '%') {
          const op = eat();
          const r = parsePow();
          v = op === '*' ? v * r : op === '/' ? v / r : v % r;
        }
        return v;
      }
      function parsePow() {
        const base = parseUnary();
        if (peek() === '^') { eat(); return Math.pow(base, parsePow()); }
        return base;
      }
      function parseUnary() {
        if (peek() === '-') { eat(); return -parseUnary(); }
        if (peek() === '+') { eat(); return parseUnary(); }
        if (peek() === '(') {
          eat();
          const v = parseExpr();
          if (eat() !== ')') throw new Error('paren');
          return v;
        }
        const n = Number(eat());
        if (!Number.isFinite(n)) throw new Error('num');
        return n;
      }
      const res = parseExpr();
      if (pos !== tokens.length) throw new Error('trailing');
      return res;
    }
    calcIn?.addEventListener('input', () => {
      const expr = calcIn.value.trim();
      if (!expr) { calcOut.textContent = '= 0'; return; }
      try {
        const val = evalMathExpr(expr);
        calcOut.textContent = Number.isFinite(val) ? `= ${val}` : 'Error';
      } catch {
        calcOut.textContent = '...';
      }
    });

    const wpWv = app().$('wp-webview');
    const wpUrl = app().$('wp-custom-url');
    wpUrl?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && wpUrl.value.trim()) {
        const target = app().resolveUrl(wpUrl.value.trim());
        wpUrl.value = target;
        Promise.resolve(wpWv.loadURL(target)).catch(() => {});
      }
    });

    document.querySelectorAll('.wp-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.wp-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.panel;
        app().$('wp-notes-view').classList.toggle('hidden', target !== 'notes');
        app().$('wp-calc-view').classList.toggle('hidden', target !== 'calc');
        const isWeb = target !== 'notes' && target !== 'calc';
        app().$('wp-web-view').classList.toggle('hidden', !isWeb);
        if (isWeb && wpWv) {
          wpUrl.value = target;
          if (wpWv.getURL?.() !== target) wpWv.src = target;
        }
      });
    });
  }

  // ── INIT ENTRY ──────────────────────────────────────────────
  window.renderDownloads          = renderDownloads;
  window.openFindBar              = openFindBar;
  window.closeFindBar             = closeFindBar;
  window.onFindInPageResult       = onFindInPageResult;
  window.toggleReaderMode         = toggleReaderMode;
  window.closeReaderMode          = closeReaderMode;
  window.captureActiveScreenshot  = captureActiveScreenshot;
  window.toggleCommandPalette     = toggleCommandPalette;
  window.closeCommandPalette      = closeCommandPalette;
  window.updateOmnibox            = updateOmnibox;
  window.handleOmniboxKey         = handleOmniboxKey;
  window.attachTabInteractions    = attachTabInteractions;

  window.initMyBrowserFeatures = async function () {
    setupDownloads();
    setupFindBar();
    setupReaderMode();
    setupMediaAndCapture();
    setupOmnibox();
    setupCommandPalette();
    setupGlobalMenus();
    setupWebPanels();
  };
})();
