import { contextBridge, ipcRenderer } from 'electron'
import type { PlaygroundWithStatus, GithubPlaygroundMeta, DockerPlaygroundMeta, AppCatalogEntry } from '../common/types'

const api = {
  listPlaygrounds: (): Promise<PlaygroundWithStatus[]> => ipcRenderer.invoke('playgrounds:list'),
  createGithub: (args: { repoUrl: string; runCommand?: string; port?: number }): Promise<GithubPlaygroundMeta> =>
    ipcRenderer.invoke('playgrounds:createGithub', args),
  createDocker: (args: { image: string; port?: number; extraArgs?: string }): Promise<DockerPlaygroundMeta> =>
    ipcRenderer.invoke('playgrounds:createDocker', args),
  deletePlayground: (id: string) => ipcRenderer.invoke('playgrounds:delete', id),
  openEditor: (id: string) => ipcRenderer.invoke('playgrounds:openEditor', id),
  openTerminal: (id: string) => ipcRenderer.invoke('playgrounds:openTerminal', id),
  openPlaygroundsDirectory: () => ipcRenderer.invoke('playgrounds:openDirectory'),
  dockerInstalled: (): Promise<boolean> => ipcRenderer.invoke('docker:installed'),
  dockerStop: (containerId: string) => ipcRenderer.invoke('docker:stop', containerId),
  dockerRemove: (containerId: string) => ipcRenderer.invoke('docker:remove', containerId),
  startDev: (args: { id: string; command?: string }) => ipcRenderer.invoke('playgrounds:startDev', args),
  stopDev: (id: string) => ipcRenderer.invoke('playgrounds:stopDev', id),
  getDevLog: (id: string) => ipcRenderer.invoke('playgrounds:getDevLog', id),
  onDevLog: (cb: (payload: { id: string; chunk: string }) => void) => {
    const handler = (_e: any, payload: any) => cb(payload)
    ipcRenderer.on('dev:log', handler)
    return () => ipcRenderer.removeListener('dev:log', handler)
  },
  onDevExit: (cb: (payload: { id: string; code: number | null; signal: NodeJS.Signals | null }) => void) => {
    const handler = (_e: any, payload: any) => cb(payload)
    ipcRenderer.on('dev:exit', handler)
    return () => ipcRenderer.removeListener('dev:exit', handler)
  },
  getAppCatalog: (): Promise<AppCatalogEntry[]> => ipcRenderer.invoke('appStore:getCatalog'),
  installApp: (appId: string): Promise<GithubPlaygroundMeta> => ipcRenderer.invoke('appStore:install', appId),
}

declare global {
  interface Window {
    api: typeof api
  }
}

contextBridge.exposeInMainWorld('api', api)
