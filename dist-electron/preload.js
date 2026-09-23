import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('desktopAPI', {
    openPlantFile: () => ipcRenderer.invoke('dialog:openPlantFile'),
    savePlantFile: (content, defaultName) => ipcRenderer.invoke('dialog:savePlantFile', { content, defaultName }),
    setWindowTitle: (title) => ipcRenderer.send('window:setTitle', title),
    getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
});
