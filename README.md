<div align="center">

<img src="assets/icons/logo.png" alt="MyBrowser Logo" width="220"/>

# MyBrowser

**A fast, private, and beautiful custom desktop browser — built for everyone.**

[![Version](https://img.shields.io/badge/version-1.0.0-7c3aed?style=for-the-badge)](https://github.com/Kanduriavinash/mybrowser/releases)
[![Platform](https://img.shields.io/badge/platform-Windows-blue?style=for-the-badge&logo=windows)](https://github.com/Kanduriavinash/mybrowser/releases)
[![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)
[![Built with Electron](https://img.shields.io/badge/built%20with-Electron-47848f?style=for-the-badge&logo=electron)](https://www.electronjs.org/)

</div>

---

## ⬇️ Download & Install

> **No setup needed. Just download, install, and browse.**

<div align="center">

### 👉 [Download MyBrowser for Windows (.exe)](https://github.com/Kanduriavinash/mybrowser/releases/latest) 👈

</div>

**How to install:**
1. Click the download link above
2. Download `MyBrowser Setup x.x.x.exe`
3. Run the installer — follow the steps
4. MyBrowser appears on your **Desktop** and **Start Menu**
5. Open it and start browsing! 🎉

> ✅ **Auto-updates are built in** — MyBrowser will automatically download and apply new versions in the background. You never need to manually update!

---

## ✨ Features

| Feature | Description |
|---|---|
| 🗂️ **Tabbed Browsing** | Open multiple tabs, switch instantly with `Ctrl+Tab` |
| 🔗 **Smart Address Bar** | Type a URL *or* a search query — MyBrowser figures out the rest |
| ⬅️ **Navigation Controls** | Back, Forward, Reload, Stop, Home — all at your fingertips |
| 🔖 **Bookmarks** | Save your favourite pages with one click, search and manage them easily |
| 🕰️ **History** | Full browsing history, searchable and grouped by date |
| 🛡️ **Built-in Ad Blocker** | Blocks ads and trackers by default — see exactly what gets blocked in real time |
| 🔄 **Auto-Updates** | Always stay on the latest version automatically |
| 🌙 **Premium Dark UI** | Stunning glassmorphism dark design — easy on the eyes |

---

## 🖼️ Screenshots

> *(Coming soon — screenshots will be added here)*

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + T` | Open new tab |
| `Ctrl + W` | Close current tab |
| `Ctrl + L` | Focus address bar |
| `Ctrl + D` | Bookmark current page |
| `Ctrl + H` | Open history |
| `Ctrl + B` | Open bookmarks |
| `Ctrl + Tab` | Switch to next tab |
| `Ctrl + Shift + Tab` | Switch to previous tab |
| `Ctrl + 1–8` | Jump to tab by number |
| `F5` | Reload page |
| `Escape` | Close sidebars / stop loading |

---

## 🛡️ Ad Blocker

MyBrowser comes with a **built-in ad blocker** — no extensions needed!

- Blocks ads, trackers, and analytics from 50+ known ad networks
- Click the **🛡️ shield button** in the toolbar to open the Extension Panel
- See how many ads have been blocked in real time
- Toggle protection **on/off** with a single switch
- Works on every website, automatically

---

## 🔄 How Auto-Updates Work

Once you install MyBrowser, you never need to manually update it.

```
Developer pushes new version to GitHub Releases
              ↓
You open MyBrowser → it silently checks for updates
              ↓
Update found → downloads in the background
              ↓
"Update ready! Restart now?" notification appears
              ↓
One click → updated ✓
```

---

## 🛠️ For Developers — Run from Source

Want to run or modify MyBrowser yourself?

**Requirements:**
- [Node.js](https://nodejs.org/) v18 or higher
- [Git](https://git-scm.com/)

**Steps:**

```bash
# 1. Clone the repo
git clone https://github.com/Kanduriavinash/mybrowser.git
cd mybrowser

# 2. Install dependencies
npm install

# 3. Run in development mode
npm start
```

**Build the installer:**
```bash
npm run build
# Output: dist/MyBrowser Setup 1.0.0.exe
```

---

## 📁 Project Structure

```
mybrowser/
├── main.js          ← Electron main process (window, IPC, ad blocker)
├── preload.js       ← Secure bridge between UI and Node.js
├── package.json     ← Dependencies and build config
├── src/
│   ├── browser.html ← Browser UI shell
│   ├── browser.css  ← Premium dark design system
│   └── browser.js   ← Tab manager, navigation, bookmarks, history
└── assets/
    └── icons/       ← App icons
```

---

## 🤝 Contributing

Contributions are welcome! Feel free to:
- 🐛 Report bugs via [Issues](https://github.com/Kanduriavinash/mybrowser/issues)
- 💡 Suggest features via [Issues](https://github.com/Kanduriavinash/mybrowser/issues)
- 🔧 Submit improvements via [Pull Requests](https://github.com/Kanduriavinash/mybrowser/pulls)

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

<div align="center">

Made with ❤️ by [Kanduriavinash](https://github.com/Kanduriavinash)

⭐ **If you like MyBrowser, give it a star!** ⭐

</div>
