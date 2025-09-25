const { contextBridge, ipcRenderer } = require('electron');
const { EventEmitter } = require('events');
const keysEmitter = new EventEmitter();

contextBridge.exposeInMainWorld('deeplink', {
  onAdd: (cb) => ipcRenderer.on('deeplink:add', (_e, payload) => cb(payload))
});
contextBridge.exposeInMainWorld('ui', {
  setPreviewMax: (flag) => ipcRenderer.send('ui:preview-max', !!flag)
});
contextBridge.exposeInMainWorld('win', {
  toggleFullscreen: () => ipcRenderer.invoke('win:toggle-fullscreen'),
  setFullscreen:   (flag) => ipcRenderer.invoke('win:set-fullscreen', flag),
  maximize:        () => ipcRenderer.invoke('win:maximize'),
  unmaximize:      () => ipcRenderer.invoke('win:unmaximize'),
  setLocked:       (flag) => ipcRenderer.invoke('win:set-locked', flag),
  isMaximized:     () => ipcRenderer.invoke('win:is-maximized'),
  resize: {
    free:  () => ipcRenderer.invoke('win:resize:free'),
    restore: () => ipcRenderer.invoke('win:resize:restore'),
  }
});
contextBridge.exposeInMainWorld('overlay', {
  open: (url) => ipcRenderer.invoke('overlay:open', { url }),
  close: () => ipcRenderer.invoke('overlay:close')
});
contextBridge.exposeInMainWorld('preview', {
  ensure:      ()         => ipcRenderer.invoke('preview:ensure'),
  load:        (url)      => ipcRenderer.invoke('preview:load', url),
  getURL:      ()         => ipcRenderer.invoke('preview:get-url'),
  setBounds:   (rect)     => ipcRenderer.invoke('preview:set-bounds', rect), // {x,y,width,height}（内容区坐标）
  toOverlay:   ()         => ipcRenderer.invoke('overlay:open'),   // 复用同一个 BrowserView
  toMain:      ()         => ipcRenderer.invoke('overlay:close')   // 挂回主窗口
});

contextBridge.exposeInMainWorld('keys', { 
  on: (cb) => ipcRenderer.on('hwkey', (_e, payload) => cb(payload)),
});
ipcRenderer.on('keys', (_evt, payload) => {
  keysEmitter.emit('keys', payload);
});

contextBridge.exposeInMainWorld('api', {
  // 读取全部数据
  list:           () => ipcRenderer.invoke('db:get-state'),

  // 文件夹
  setFolders:     (folders)                     => ipcRenderer.invoke('db:set-folders', folders),
  moveFolder:     (payload)                     => ipcRenderer.invoke('db:move-folder', payload),
  addFolder:      (fullPath)                    => ipcRenderer.invoke('db:add-folder', fullPath),
  deleteFolder:   (fullPath)                    => ipcRenderer.invoke('db:delete-folder', fullPath),
  renameFolder:   (payload)                     => ipcRenderer.invoke('db:rename-folder', payload),

  // 资源
  addResource:    (payload)                     => ipcRenderer.invoke('db:add-resource', payload),
  updateResource: (id, patch)                   => ipcRenderer.invoke('db:update-resource', id, patch),
  deleteResource: (id)                          => ipcRenderer.invoke('db:delete-resource', id),

  // 标签
  addTag:         (tag)                         => ipcRenderer.invoke('db:add-tag', tag),

  // 外链
  openExternal:   (url)                         => ipcRenderer.invoke('app:open-external', url),

  // 预留（主进程没实现就别调）
  importJson:     ()                            => ipcRenderer.invoke('db:import'),
  exportJson:     ()                            => ipcRenderer.invoke('db:export'),
});
contextBridge.exposeInMainWorld('auth', {
  whoami:   ()            => ipcRenderer.invoke('auth:whoami'),
  login:    (payload)     => ipcRenderer.invoke('auth:login', payload),      // {username,password}
  logout:   ()            => ipcRenderer.invoke('auth:logout'),
  register: (payload)     => ipcRenderer.invoke('auth:register', payload),   // {username,email,password}
  fetchCloud: () => ipcRenderer.invoke('auth:fetch-cloud'),
  syncNow:  (localState)  => ipcRenderer.invoke('auth:sync-now', localState) // {resources,folders,tags}
});
contextBridge.exposeInMainWorld('ops', {
  onChanged: (cb) => ipcRenderer.on('ops:changed', (_e, payload) => {
    if (typeof cb === 'function') cb(payload);
  })
});
