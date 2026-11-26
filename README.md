<div align="center">

<img src="assets/icons/logo.png" alt="MyBrowser Logo" width="180"/>

# MyBrowser

**A fast, private, and beautiful custom desktop browser — built for everyone.**

[![Version](https://img.shields.io/badge/version-1.0.2-7c3aed?style=for-the-badge)](https://github.com/Kanduriavinash/mybrowser/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows-blue?style=for-the-badge&logo=windows)](https://github.com/Kanduriavinash/mybrowser/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)
[![Built with Electron](https://img.shields.io/badge/built%20with-Electron-47848f?style=for-the-badge&logo=electron)](https://www.electronjs.org/)

</div>

---

## ⬇️ Download & Install

> **No setup needed. Just download, install, and browse.**

<div align="center">

### 👉 [**Download MyBrowser Installer (`MyBrowser-Setup-1.0.2.exe`)**](https://github.com/Kanduriavinash/mybrowser/releases/latest/download/MyBrowser-Setup-1.0.2.exe) 👈

[**Download Portable Version (`MyBrowser-Portable-1.0.2.exe`)**](https://github.com/Kanduriavinash/mybrowser/releases/latest/download/MyBrowser-Portable-1.0.2.exe) · [**View All Releases**](https://github.com/Kanduriavinash/mybrowser/releases/latest)

</div>

**How to install:**
1. Click **Download MyBrowser Installer** above (or pick Portable if you don't want to install)
2. Run **`MyBrowser-Setup-1.0.2.exe`** (if Windows SmartScreen appears, click **More info → Run anyway** since the app is open-source and unsigned)
3. MyBrowser appears on your **Desktop** and **Start Menu** — open it and start browsing! 🎉

> ✅ **Auto-updates built in** — MyBrowser will silently download and apply new versions in the background. You'll never need to manually update.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🗂️ **Tabbed Browsing** | Open multiple tabs; switch with `Ctrl+Tab` or click |
| 🔗 **Smart Address Bar** | Type a URL *or* a search query — MyBrowser figures out the rest |
| ⬅️ **Full Navigation** | Back, Forward, Reload, Stop, Home — all keyboard-accessible |
| 🔖 **Bookmarks** | Save pages with one click; search & manage from the sidebar |
| 🕰️ **History** | Full browsing history, searchable and grouped by date |
| 🛡️ **Built-in Ad Blocker** | Blocks 50+ ad & tracker networks by default; real-time counter |
| 🔄 **Auto-Updates** | Always on the latest version automatically |
| 🌙 **Premium Dark UI** | Stunning glassmorphism dark design with purple-cyan accents |
| ⚙️ **Settings Panel** | Change homepage, search engine, toggle ad blocker, clear data |
| 🪟 **Custom Window Frame** | Native-feel frameless window with macOS-style controls |

---

## 🖼️ Screenshot

> *(Screenshots coming soon — contributors welcome!)*

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + T` | Open new tab |
| `Ctrl + W` | Close current tab |
| `Ctrl + L` | Focus address bar |
| `Ctrl + D` | Bookmark current page |
| `Ctrl + H` | Open history sidebar |
| `Ctrl + B` | Open bookmarks sidebar |
| `Ctrl + Tab` | Switch to next tab |
| `Ctrl + Shift + Tab` | Switch to previous tab |
| `Ctrl + 1–8` | Jump to tab by number |
| `Ctrl + 9` | Jump to last tab |
| `F5` | Reload page |
| `Escape` | Close sidebars / stop loading |

---

## 🛡️ Ad Blocker

MyBrowser blocks **50+ ad and tracker domains** out of the box — no extensions needed:

- Google Ads, DoubleClick, Facebook Ads
- Taboola, Outbrain, Criteo, Rubicon
- Analytics trackers (Hotjar, Mixpanel, Amplitude, Segment…)
- And many more

Open the **Shield icon** in the toolbar to see real-time stats of what's being blocked.

---

## 🔧 Build from Source

### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- [Git](https://git-scm.com/)

```bash
# Clone the repository
git clone https://github.com/Kanduriavinash/mybrowser.git
cd mybrowser

# Install dependencies
npm install

# Run in development mode
npm start

# Build a Windows installer
npm run build
```

The installer will be output to the `dist/` folder.

---

## 📁 Project Structure

```
mybrowser/
├── main.js          # Electron main process (window, IPC, ad blocker)
├── preload.js       # Secure context bridge between main & renderer
├── src/
│   ├── browser.html # App UI structure
│   ├── browser.js   # Renderer logic (tabs, navigation, bookmarks, history)
│   └── browser.css  # Dark UI design system
├── assets/
│   └── icons/       # App icons
└── package.json     # Build configuration (electron-builder)
```

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## 📄 License

MIT © [Kanduriavinash](https://github.com/Kanduriavinash)

---

<div align="center">

Made with ❤️ using [Electron](https://www.electronjs.org/)

⭐ **If you like MyBrowser, please give it a star!** ⭐

</div>
