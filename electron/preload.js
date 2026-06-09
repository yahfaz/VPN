'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app-version'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  isElectron: true,
});
