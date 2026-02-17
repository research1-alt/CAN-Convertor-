import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

// CRITICAL: Disable GPU acceleration immediately to prevent 0xC0000409 crashes on Windows
app.disableHardwareAcceleration();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "OSM Live | PCAN HUD",
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    },
  });

  // Handle hardware permissions
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (['serial', 'bluetooth', 'device-info', 'serial-port'].includes(permission)) return true;
    return false;
  });

  if (isDev) {
    const loadDev = () => {
      win.loadURL('http://localhost:5173').catch(() => {
        setTimeout(loadDev, 1000);
      });
    };
    loadDev();
  } else {
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});