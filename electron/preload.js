
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Add specific native calls here if needed in the future
  platform: process.platform
});
