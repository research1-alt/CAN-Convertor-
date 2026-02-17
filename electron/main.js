
import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "OSM Live | Tactical HUD",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#0f172a'
  });

  // Handle Hardware Permissions
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (['serial', 'bluetooth', 'usb'].includes(permission)) return true;
    return false;
  });

  session.defaultSession.setDevicePermissionHandler((details) => {
    if (['serial', 'bluetooth', 'usb'].includes(details.deviceType)) return true;
    return false;
  });

  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
