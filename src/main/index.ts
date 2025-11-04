import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import {
  BASE_DIR,
  META_PATH,
  createGithubPlayground,
  createDockerPlayground,
  listPlaygrounds,
  deletePlayground,
  checkDockerInstalled,
  openInEditor,
  openTerminal,
  openPlaygroundsDirectory,
  stopDockerContainer,
  removeDockerContainer,
  // dev
  devEvents,
  startDevCommand,
  stopDevCommand,
  getDevLog,
  installAppFromStore,
} from './playgrounds'
import { getAppCatalog } from './appStore'

let mainWindow: BrowserWindow | null = null

function getPreloadPath() {
  return path.join(__dirname, '../preload/index.cjs')
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    await mainWindow.loadURL(devUrl)
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  mainWindow.show()
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// IPC wiring
ipcMain.handle('playgrounds:list', () => listPlaygrounds())
ipcMain.handle('playgrounds:createGithub', (_e, args: { repoUrl: string; runCommand?: string; port?: number }) =>
  createGithubPlayground(args)
)
ipcMain.handle('playgrounds:createDocker', (_e, args: { image: string; port?: number; extraArgs?: string }) =>
  createDockerPlayground(args)
)
ipcMain.handle('playgrounds:delete', (_e, id: string) => deletePlayground(id))
ipcMain.handle('playgrounds:openEditor', (_e, id: string) => openInEditor(id))
ipcMain.handle('playgrounds:openTerminal', (_e, id: string) => openTerminal(id))
ipcMain.handle('playgrounds:openDirectory', () => openPlaygroundsDirectory())

// Dev command IPC
ipcMain.handle('playgrounds:startDev', (_e, args: { id: string; command?: string }) => startDevCommand(args.id, args.command))
ipcMain.handle('playgrounds:stopDev', (_e, id: string) => stopDevCommand(id))
ipcMain.handle('playgrounds:getDevLog', (_e, id: string) => getDevLog(id))

ipcMain.handle('docker:installed', () => checkDockerInstalled())
ipcMain.handle('docker:stop', (_e, containerId: string) => stopDockerContainer(containerId))
ipcMain.handle('docker:remove', (_e, containerId: string) => removeDockerContainer(containerId))

// Expose location info (debug/advanced)
ipcMain.handle('meta:paths', () => ({ BASE_DIR, META_PATH }))

// App store IPC
ipcMain.handle('appStore:getCatalog', () => getAppCatalog())
ipcMain.handle('appStore:install', (_e, appId: string) => installAppFromStore(appId))

// Forward dev event logs to renderer
devEvents.on('log', (payload) => {
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('dev:log', payload))
})
devEvents.on('exit', (payload) => {
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('dev:exit', payload))
})
