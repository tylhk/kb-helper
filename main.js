import { app, BrowserWindow, BrowserView, ipcMain, shell, Menu } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import Store from 'electron-store';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// --------------------------- 数据存储 ---------------------------
const store = new Store({
    name: 'kb-data',
    defaults: {
        resources: [],   // { id, url, title, folder, tags:[], createdAt, updatedAt }
        folders: [],     // ["学习","学习/项目A", ...]
        tags: []         // ["前端","Electron", ...]
    }
});

// --------------------------- 窗口 ---------------------------
let win, preview;
let INITIAL_SIZE_POLICY;
let IS_PREVIEW_MAX = false;
ipcMain.on('ui:preview-max', (_e, flag) => { IS_PREVIEW_MAX = !!flag; });
function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 960,
        minHeight: 600,
        backgroundColor: '#0b0c0f',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            devTools: true,
            webviewTag: true
        },
        show: false
    });
    INITIAL_SIZE_POLICY = {
        resizable: win.isResizable(),
        maximizable: win.isMaximizable(),
        min: win.getMinimumSize(),         // [w, h]
        max: win.getMaximumSize(),         // [w, h]，可能是 [0, 0] 表示无限
    };
    const wireKeys = (wc) => {
        if (!wc) return;
        wc.on('before-input-event', (event, input) => {
            if (input.type !== 'keyDown') return;
            if (input.key === 'Escape' || input.code === 'Escape') {
                event.preventDefault();
                if (IS_PREVIEW_MAX) shrinkPreviewInMain(); // 仅在填充满时才缩
                win.webContents.send('hwkey', { key: 'Escape' });
            } else if (input.key === 'F11' || input.code === 'F11') {
                event.preventDefault();
                win.webContents.send('hwkey', { key: 'F11' });
            }
        });
    };

    wireKeys(win.webContents);
    win.setMenuBarVisibility(false);
    Menu.setApplicationMenu(null);

    win.once('ready-to-show', () => win.show());
    win.on('closed', () => { win = null; });

    // 你的前端入口
    const indexPath = path.join(__dirname, 'index.html');
    win.loadFile(indexPath);
    win.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;

        if (input.key === 'F11') {
            event.preventDefault();
            win.webContents.send('hwkey', { key: 'F11' });
            return;
        }

        if (input.key === 'Escape') {
            event.preventDefault();
            if (win && !win.isDestroyed()) {
                if (win.isFullScreen()) win.setFullScreen(false);
                if (overlayWin && !overlayWin.isDestroyed()) { overlayWin.close(); return; }
                if (IS_PREVIEW_MAX) shrinkPreviewInMain();
                win.webContents.send('hwkey', { key: 'Escape' });
            }
        }
    });

    // 可选：在新窗口中用系统默认浏览器打开外链
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
        return { action: 'allow' };
    });

    // 启动本地 HTTP 桥（无弹窗的扩展通信）
    startLocalBridge(win);
}
function shrinkPreviewInMain() {
    try {
        if (!overlayWin && previewView && !previewView.webContents.isDestroyed()) {
            previewView.setBounds({ x: 0, y: 0, width: 1, height: 1 });
        }
    } catch { }
}
// === Preview Overlay（与主窗口同尺寸/同位置；共享同一个 BrowserView）===
let overlayWin = null;                     // 仅一个 overlay 窗口
let previewView = null;                    // 仅一个 BrowserView，主窗/overlay 之间来回移动
let lastPreviewBoundsInMain = { x: 0, y: 0, width: 0, height: 0 }; // 预览区在主窗口里的矩形

function ensurePreviewView() {
    if (previewView && !previewView.webContents.isDestroyed()) return previewView;
    previewView = new BrowserView({
        webPreferences: { contextIsolation: true, sandbox: true }
    });

    // ★ 只绑定一次键盘钩子：无论在主窗还是 overlay，F11/ESC 都能生效
    if (!previewView.__keysHooked) {
        previewView.__keysHooked = true;
        previewView.webContents.on('before-input-event', (event, input) => {
            if (input.type !== 'keyDown') return;
            if (input.key === 'F11' || input.key === 'Escape') {
                event.preventDefault();
                if (overlayWin && !overlayWin.isDestroyed()) {
                    overlayWin.close();
                    return;
                }
                if (input.key === 'Escape' && IS_PREVIEW_MAX) shrinkPreviewInMain(); // 仅填充满时
                if (win && !win.isDestroyed()) {
                    win.webContents.send('hwkey', { key: input.key });
                }
            }

        });
    }

    if (win && !win.isDestroyed()) {
        try {
            win.addBrowserView(previewView);
            previewView.setBounds(lastPreviewBoundsInMain);
        } catch { }
    }
    return previewView;
}


// 给渲染层用：确保预览存在 / 载入 URL / 回读当前 URL / 更新主窗口里的预览矩形
ipcMain.handle('preview:ensure', () => { ensurePreviewView(); return true; });
ipcMain.handle('preview:load', (_e, url) => {
    const view = ensurePreviewView();
    if (url) view.webContents.loadURL(url);
    return true;
});
ipcMain.handle('preview:get-url', () => {
    if (!previewView) return '';
    try { return previewView.webContents.getURL() || ''; } catch { return ''; }
});
ipcMain.handle('preview:set-bounds', (_e, rect) => {
    lastPreviewBoundsInMain = { ...rect };
    if (previewView && win && !win.isDestroyed() && !overlayWin) {
        previewView.setBounds(lastPreviewBoundsInMain);
    }
    return true;
});

// 打开 overlay：用与主窗口相同的 x/y/width/height；把同一个 BrowserView 移过去并铺满
ipcMain.handle('overlay:open', async (_e) => {
    const view = ensurePreviewView();
    if (overlayWin && !overlayWin.isDestroyed()) { overlayWin.focus(); return true; }

    const b = win.getBounds();  // ← 与主窗同位置/同大小
    overlayWin = new BrowserWindow({
        x: b.x, y: b.y, width: b.width, height: b.height,
        frame: false, resizable: false, movable: false,
        minimizable: false, maximizable: false,
        skipTaskbar: false,focusable: true, show: false,
        backgroundColor: '#000000',
        webPreferences: { contextIsolation: true, sandbox: true }
    });
    overlayWin.setMenuBarVisibility(false);

    // 把 View 从主窗卸下，挂到 overlay，并让它铺满 overlay 内容区
    const fitOverlay = () => {
        const cb = overlayWin.getContentBounds();
        view.setBounds({ x: 0, y: 0, width: cb.width, height: cb.height });
    };
    if (win && !win.isDestroyed()) {
        try { win.removeBrowserView(view); } catch { }
    }
    overlayWin.addBrowserView(view);
    fitOverlay();
    try { view.webContents.focus(); } catch { }
    overlayWin.once('show', () => {
        if (win && !win.isDestroyed()) win.hide();
        try { overlayWin.focus(); } catch { }
        try { view.webContents.focus(); } catch { }
    });

    // 在 overlay 里按 F11/ESC 也能退出
    overlayWin.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;
        if (input.key === 'F11' || input.key === 'Escape') {
            event.preventDefault();
            if (overlayWin && !overlayWin.isDestroyed()) {
                overlayWin.close(); // on('closed') 里会把 View 交还给主窗口
            }
        }
    });

    overlayWin.on('resize', fitOverlay);
    overlayWin.on('close', () => {
        try {
            if (overlayWin && !overlayWin.isDestroyed() && previewView) {
                try { overlayWin.removeBrowserView(previewView); } catch { }
            }
            if (win && !win.isDestroyed() && previewView && !previewView.webContents.isDestroyed()) {
                win.addBrowserView(previewView);
                previewView.setBounds(lastPreviewBoundsInMain);
            }
        } catch { }
        if (win && !win.isDestroyed()) { win.show(); win.focus(); }
    });
    overlayWin.on('closed', () => {
        overlayWin = null;
    });


    overlayWin.show();
    return true;
});
ipcMain.handle('preview:focus', () => {
    try {
        if (previewView && !previewView.webContents.isDestroyed()) {
            previewView.webContents.focus();
            return true;
        }
    } catch { }
    return false;
});
// 关闭 overlay（供渲染层调用）
ipcMain.handle('overlay:close', async () => {
    if (!overlayWin || overlayWin.isDestroyed()) return false;
    overlayWin.close(); // 'closed' 里会负责把 View 挂回主窗口
    return true;
});

app.on('web-contents-created', (_evt, contents) => {
    if (contents.getType && contents.getType() === 'webview') {
        contents.on('before-input-event', (event, input) => {
            if (input.type !== 'keyDown') return;

            // F11：转发到渲染层（由渲染层决定是否切全屏/其它行为）
            if (input.key === 'F11') {
                event.preventDefault();
                if (win && !win.isDestroyed()) {
                    win.webContents.send('hwkey', { key: 'F11' });
                }
                return;
            }

            // Esc：若正在系统全屏，先退全屏；否则转发给渲染层做“退出预览最大化”
            if (input.key === 'Escape') {
                event.preventDefault();
                if (win && !win.isDestroyed()) {
                    if (win.isFullScreen()) win.setFullScreen(false);
                    if (overlayWin && !overlayWin.isDestroyed()) { overlayWin.close(); return; }
                    if (IS_PREVIEW_MAX) shrinkPreviewInMain();
                    win.webContents.send('hwkey', { key: 'Escape' });
                }
            }
        });
    }
});

// --------------------------- 本地 HTTP 桥 ---------------------------
// 扩展向 http://127.0.0.1:17645/add POST {url,title,folder?}
function startLocalBridge(theWin) {
    const server = http.createServer((req, res) => {
        // CORS 允许（扩展也能直接 fetch）
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

        if (req.method !== 'POST' || req.url !== '/add') {
            res.writeHead(404); return res.end();
        }

        // 仅允许本机（如不需要可移除）
        const ip = req.socket.remoteAddress || '';
        if (!ip.includes('127.0.0.1') && !ip.includes('::1')) {
            res.writeHead(403); return res.end('forbidden');
        }

        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '{}'); // {url,title,folder}
                if (theWin && !theWin.isDestroyed()) {
                    theWin.show(); theWin.focus();
                    theWin.webContents.send('deeplink:add', data);
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end('{"ok":true}');
            } catch {
                res.writeHead(400); res.end('{"ok":false}');
            }
        });
    });

    server.listen(17645, '127.0.0.1', () => {
        console.log('KB Helper bridge: http://127.0.0.1:17645');
    });

    app.on('before-quit', () => server.close());
}

// --------------------------- 自定义协议（兜底） ---------------------------
function registerProtocol() {
    app.setAppUserModelId('KBHelper'); // Windows 建议设置，提升注册成功率
    const PROTOCOL = 'kb-helper';

    let ok;
    if (!app.isPackaged) {
        // 开发态：electron.exe + 入口绝对路径
        const entry = path.join(__dirname, 'main.js');
        ok = app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [entry]);
    } else {
        // 打包态：直接注册可执行文件
        ok = app.setAsDefaultProtocolClient(PROTOCOL);
    }

    // 某些机器第一次返回 false，移除后重注册一次
    if (!ok) {
        try { app.removeAsDefaultProtocolClient(PROTOCOL); } catch { }
        if (!app.isPackaged) {
            const entry = path.join(__dirname, 'main.js');
            app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [entry]);
        } else {
            app.setAsDefaultProtocolClient(PROTOCOL);
        }
    }

    // 单实例 + 从第二实例拿到 deep link（Windows）
    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) {
        app.quit();
    } else {
        app.on('second-instance', (_event, argv) => {
            const link = argv.find(a => typeof a === 'string' && a.startsWith(`${PROTOCOL}://`));
            if (link) forwardDeepLink(link);
            if (win) {
                if (win.isMinimized()) win.restore();
                win.show(); win.focus();
            }
        });
    }

    // macOS：open-url
    app.on('open-url', (e, link) => {
        e.preventDefault();
        forwardDeepLink(link);
        if (win) { win.show(); win.focus(); }
    });

    // Windows（开发态）首次启动时，协议可能在 argv 里
    if (process.platform === 'win32') {
        const link = process.argv.find(a => typeof a === 'string' && a.startsWith(`${PROTOCOL}://`));
        if (link) setTimeout(() => forwardDeepLink(link), 300);
    }

    function forwardDeepLink(link) {
        try {
            const u = new URL(link);
            if (u.hostname !== 'add') return; // 仅处理 kb-helper://add
            const q = Object.fromEntries(u.searchParams.entries()); // {url,title,folder}
            if (win && !win.isDestroyed()) win.webContents.send('deeplink:add', q);
        } catch { }
    }
}
ipcMain.handle('win:resize:free', () => {
    if (!win) return false;
    try { win.setResizable(true); } catch {}
    try { win.setMaximizable(true); } catch {}
    try { if (process.platform === 'darwin') win.setMovable(true); } catch {}
    try { win.setMinimumSize(1, 1); } catch {}
    try { win.setMaximumSize(0, 0); } catch {} // 0,0 表示不限制
    return true;
  });
  
  // 恢复原约束 + 必要时把窗口“抬”到最小尺寸（退出预览填充满后调用）
  ipcMain.handle('win:resize:restore', () => {
    if (!win) return false;
  
    // 兜底：若 INITIAL_SIZE_POLICY 还没初始化，就用当前窗口的约束作为恢复值
    const curMin = (typeof win.getMinimumSize === 'function') ? win.getMinimumSize() : [1, 1];
    const curMax = (typeof win.getMaximumSize === 'function') ? win.getMaximumSize() : [0, 0];
    const policy  = INITIAL_SIZE_POLICY || {
      resizable: win.isResizable?.() ?? true,
      maximizable: win.isMaximizable?.() ?? true,
      min: curMin,
      max: curMax
    };
  
    try { win.setResizable(!!policy.resizable); } catch {}
    try { win.setMaximizable(!!policy.maximizable); } catch {}
    try {
      const [minW, minH] = policy.min || [1, 1];
      win.setMinimumSize(Math.max(1, minW), Math.max(1, minH));
    } catch {}
    try {
      const [maxW, maxH] = policy.max || [0, 0];
      win.setMaximumSize(maxW || 0, maxH || 0); // 0,0 = 不限制
    } catch {}
    try { if (process.platform === 'darwin') win.setMovable(!!policy.resizable); } catch {}
  
    // 关键：如果当前尺寸小于最小值，主动把窗口抬到最小值
    try {
      const [curW, curH] = win.getSize();
      const [minW, minH] = policy.min || [1, 1];
      const needW = Math.max(curW, minW);
      const needH = Math.max(curH, minH);
      if (needW !== curW || needH !== curH) {
        win.setSize(needW, needH);
      }
    } catch {}
  
    return true;
  });
  
// --------------------------- IPC（渲染层调用） ---------------------------
// 读全量状态
ipcMain.handle('win:set-locked', (_e, flag) => {
    if (!win) return false;
    const lock = !!flag;

    if (!lock) {
        // === 解限：进入“预览填充满”前调用 ===
        try { win.setResizable(true); } catch { }
        try { win.setMaximizable(true); } catch { }
        try { if (process.platform === 'darwin') win.setMovable(true); } catch { }
        try { win.setMinimumSize(1, 1); } catch { }
        try { win.setMaximumSize(0, 0); } catch { } // 0,0 = 不限制
        return false;
    } else {
        // === 恢复：退出“预览填充满”后调用 ===
        try { win.setResizable(!!INITIAL_SIZE_POLICY?.resizable); } catch { }
        try { win.setMaximizable(!!INITIAL_SIZE_POLICY?.maximizable); } catch { }
        try {
            const [minW, minH] = INITIAL_SIZE_POLICY?.min || [1, 1];
            win.setMinimumSize(Math.max(1, minW), Math.max(1, minH));
        } catch { }
        try {
            const [maxW, maxH] = INITIAL_SIZE_POLICY?.max || [0, 0];
            // 0,0 表示不限制
            win.setMaximumSize(maxW || 0, maxH || 0);
        } catch { }
        try { if (process.platform === 'darwin') win.setMovable(!!INITIAL_SIZE_POLICY?.resizable); } catch { }
        return true;
    }
});


ipcMain.handle('win:toggle-fullscreen', () => {
    if (!win) return false;
    const next = !win.isFullScreen();
    win.setFullScreen(next);
    try { win.setResizable(!next ? true : false); } catch { }
    try { if (process.platform === 'darwin') win.setMovable(!next ? true : false); } catch { }
    return next;
});
ipcMain.handle('win:maximize', () => {
    if (!win) return false;
    win.maximize();
    return win.isMaximized();
});
ipcMain.handle('win:unmaximize', () => {
    if (!win) return false;
    win.unmaximize();
    return true;
});
ipcMain.handle('win:is-maximized', () => {
    if (!win) return false;
    return win.isMaximized();
});

// 显式设置全屏（备用）
ipcMain.handle('win:set-fullscreen', (_e, flag) => {
    if (!win) return false;
    const next = !!flag;
    win.setFullScreen(next);
    try { win.setResizable(!next ? true : false); } catch { }
    try { if (process.platform === 'darwin') win.setMovable(!next ? true : false); } catch { }
    return next;
});

ipcMain.handle('db:get-state', () => ({
    resources: store.get('resources') || [],
    folders: store.get('folders') || [],
    tags: store.get('tags') || []
}));
ipcMain.handle('app:open-external', (_e, url) => {
    if (url) shell.openExternal(url);
    return true;
});
ipcMain.handle('db:add-folder', (_e, fullPath) => {
    const folders = new Set(store.get('folders') || []);
    const p = (fullPath || '').replace(/^\/+|\/+$/g, '');
    if (!p) return Array.from(folders);

    // 确保祖先路径都落盘
    const segs = p.split('/');
    let acc = '';
    for (const s of segs) {
        acc = acc ? `${acc}/${s}` : s;
        folders.add(acc);
    }
    store.set('folders', Array.from(folders));
    return store.get('folders');
});
ipcMain.handle('db:delete-folder', (_e, fullPath) => {
    const folders = store.get('folders') || [];
    const resources = store.get('resources') || [];

    const base = (fullPath || '').replace(/^\/+|\/+$/g, '');
    if (!base) return folders;

    const prefix = base + '/';

    // 删 folders 子树
    const keptFolders = folders.filter(f => f !== base && !f.startsWith(prefix));

    // 删资源子树
    const keptResources = resources.filter(r => {
        const rf = r.folder || '';
        return !(rf === base || rf.startsWith(prefix));
    });

    store.set('folders', keptFolders);
    store.set('resources', keptResources);
    return store.get('folders');
});

// 资源
ipcMain.handle('db:add-resource', (_e, payload) => {
    const list = store.get('resources') || [];
    const id = String(Date.now()) + Math.random().toString(16).slice(2);
    const now = Date.now();
    list.push({ id, createdAt: now, updatedAt: now, tags: [], ...payload });
    store.set('resources', list);
    return id;
});

ipcMain.handle('db:update-resource', (_e, id, patch) => {
    const list = (store.get('resources') || []).map(r => {
        if (r.id !== id) return r;
        return { ...r, ...patch, updatedAt: Date.now() };
    });
    store.set('resources', list);
    return true;
});

ipcMain.handle('db:delete-resource', (_e, id) => {
    const list = (store.get('resources') || []).filter(r => r.id !== id);
    store.set('resources', list);
    return true;
});

// 文件夹：直接设置顺序（用于排序落盘）
ipcMain.handle('db:set-folders', (_e, folders) => {
    store.set('folders', Array.from(new Set(folders || [])));
    return store.get('folders');
});

// 移动文件夹到目标父路径（作为其子目录）
ipcMain.handle('db:move-folder', (_e, { sourcePath, targetParentPath }) => {
    const folders = store.get('folders') || [];
    const resources = store.get('resources') || [];

    const src = (sourcePath || '').replace(/^\/+|\/+$/g, '');
    const targetParent = (targetParentPath || '').replace(/^\/+|\/+$/g, '');

    if (!src) return folders;
    if (src === targetParent || src.startsWith(targetParent + '/')) return folders; // 不允许移到自己或子树

    const leaf = src.split('/').pop();
    const newBase = targetParent ? `${targetParent}/${leaf}` : leaf;
    const oldPrefix = src + '/';

    // 更新 folders
    const updatedFolders = folders.map(f => {
        if (f === src) return newBase;
        if (f.startsWith(oldPrefix)) return newBase + f.slice(src.length);
        return f;
    });

    // 更新 resources.folder
    const updatedResources = resources.map(r => {
        const rf = r.folder || '';
        if (rf === src) return { ...r, folder: newBase };
        if (rf.startsWith(oldPrefix)) return { ...r, folder: newBase + rf.slice(src.length) };
        return r;
    });

    store.set('folders', Array.from(new Set(updatedFolders)));
    store.set('resources', updatedResources);
    return store.get('folders');
});

// 重命名文件夹（仅改最后一段名，父路径不变；级联更新）
ipcMain.handle('db:rename-folder', (_e, { sourcePath, newName }) => {
    const folders = store.get('folders') || [];
    const resources = store.get('resources') || [];

    const oldPath = (sourcePath || '').replace(/^\/+|\/+$/g, '');
    const newLeaf = (newName || '').replace(/^\/+|\/+$/g, '');
    if (!oldPath || !newLeaf) return folders;

    const parent = oldPath.split('/').slice(0, -1).join('/');
    const newBase = parent ? `${parent}/${newLeaf}` : newLeaf;
    if (newBase === oldPath) return folders;

    const oldPrefix = oldPath + '/';

    const newFolders = folders.map(f => {
        if (f === oldPath) return newBase;
        if (f.startsWith(oldPrefix)) return newBase + f.slice(oldPath.length);
        return f;
    });

    const newResources = resources.map(r => {
        const rf = r.folder || '';
        if (rf === oldPath) return { ...r, folder: newBase };
        if (rf.startsWith(oldPrefix)) return { ...r, folder: newBase + rf.slice(oldPath.length) };
        return r;
    });

    store.set('folders', Array.from(new Set(newFolders)));
    store.set('resources', newResources);
    return store.get('folders');
});

// 标签：新增（去重后返回全量）
ipcMain.handle('db:add-tag', (_e, tag) => {
    const tags = new Set(store.get('tags') || []);
    const t = (tag || '').trim();
    if (t) tags.add(t);
    const arr = Array.from(tags);
    store.set('tags', arr);
    return arr;
});

// --------------------------- App 生命周期 ---------------------------
app.whenReady().then(() => {
    registerProtocol();  // 协议（兜底）
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
