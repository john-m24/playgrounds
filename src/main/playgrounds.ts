import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { run, which } from './utils/shell'
import type { PlaygroundMeta, GithubPlaygroundMeta, DockerPlaygroundMeta, PlaygroundWithStatus } from '../common/types'
import { getAppById } from './appStore'

const BASE_DIR = path.join(os.homedir(), '.playgrounds')
const GITHUB_DIR = path.join(BASE_DIR, 'github')
const META_PATH = path.join(BASE_DIR, 'meta.json')

async function ensureDirs() {
  await fsp.mkdir(BASE_DIR, { recursive: true })
  await fsp.mkdir(GITHUB_DIR, { recursive: true })
  if (!fs.existsSync(META_PATH)) {
    await fsp.writeFile(META_PATH, '[]', 'utf-8')
  }
}

async function readMeta(): Promise<PlaygroundMeta[]> {
  await ensureDirs()
  const raw = await fsp.readFile(META_PATH, 'utf-8')
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

async function writeMeta(list: PlaygroundMeta[]) {
  await ensureDirs()
  await fsp.writeFile(META_PATH, JSON.stringify(list, null, 2) + '\n', 'utf-8')
}

function nowIso() {
  return new Date().toISOString()
}

function safeId(base: string) {
  const ts = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  return `${base}-${ts}`
}

export async function listPlaygrounds(): Promise<PlaygroundWithStatus[]> {
  const list = await readMeta()
  const withStatus = await Promise.all(
    list.map(async (item) => {
      if (item.type === 'docker') {
        const status = await dockerContainerStatus(item.containerId)
        return { ...item, status }
      }
      return item
    })
  )
  return withStatus
}

export async function createGithubPlayground(params: {
  repoUrl: string
  runCommand?: string
  port?: number
  appStoreId?: string
}): Promise<GithubPlaygroundMeta> {
  const gitPath = await which('git')
  if (!gitPath) throw new Error('git not found in PATH')

  const url = params.repoUrl.trim()
  if (!/^https?:\/\//.test(url) && !url.includes(':')) {
    throw new Error('Invalid Git URL')
  }

  const nameGuess =
    url
      .split('/')
      .filter(Boolean)
      .slice(-1)[0]
      ?.replace(/\.git$/, '') || 'repo'
  const id = safeId(nameGuess)
  const targetDir = path.join(GITHUB_DIR, id)
  await fsp.mkdir(targetDir, { recursive: true })

  // shallow clone
  await run(`"${gitPath}" clone --depth 1 ${url} "${targetDir}"`)

  const meta: GithubPlaygroundMeta = {
    id,
    type: 'github',
    repoUrl: url,
    path: targetDir,
    createdAt: nowIso(),
    runCommand: params.runCommand,
    port: params.port,
    appStoreId: params.appStoreId,
  }

  const list = await readMeta()
  list.unshift(meta)
  await writeMeta(list)
  return meta
}

export async function installAppFromStore(appId: string): Promise<GithubPlaygroundMeta> {
  const app = await getAppById(appId)
  if (!app) {
    throw new Error(`App with id "${appId}" not found in catalog`)
  }

  // Check if already installed
  const list = await readMeta()
  const alreadyInstalled = list.some(
    (item) => item.type === 'github' && (item as GithubPlaygroundMeta).appStoreId === appId
  )
  if (alreadyInstalled) {
    throw new Error(`App "${app.name}" is already installed`)
  }

  return createGithubPlayground({
    repoUrl: app.repoUrl,
    runCommand: app.defaultRunCommand,
    port: app.defaultPort,
    appStoreId: app.id,
  })
}

export async function deleteGithubPlayground(id: string): Promise<void> {
  const list = await readMeta()
  const idx = list.findIndex((x) => x.id === id && x.type === 'github')
  if (idx === -1) throw new Error('Not found')
  const item = list[idx] as GithubPlaygroundMeta
  // stop any running dev process for this id
  await stopDevCommand(id).catch(() => void 0)
  // execute delete command from app catalog if available
  if (item.appStoreId && item.path && fs.existsSync(item.path)) {
    try {
      const app = await getAppById(item.appStoreId)
      if (app?.deleteCommand) {
        await run(app.deleteCommand, { cwd: item.path })
      }
    } catch {
      // Ignore errors - delete command might fail if docker isn't available or containers are already cleaned up
    }
  }
  // delete directory
  if (item.path && fs.existsSync(item.path)) {
    await fsp.rm(item.path, { recursive: true, force: true })
  }
  list.splice(idx, 1)
  await writeMeta(list)
}

export async function checkDockerInstalled(): Promise<boolean> {
  const dockerPath = await which('docker')
  return !!dockerPath
}

async function dockerContainerStatus(containerId: string): Promise<'Running' | 'Stopped' | 'Unknown'> {
  const dockerPath = await which('docker')
  if (!dockerPath) return 'Unknown'
  try {
    const { stdout } = await run(`"${dockerPath}" inspect -f {{.State.Running}} ${containerId}`)
    const val = stdout.trim()
    if (val === 'true') return 'Running'
    if (val === 'false') return 'Stopped'
    return 'Unknown'
  } catch {
    return 'Unknown'
  }
}

export async function createDockerPlayground(params: {
  image: string
  port?: number
  extraArgs?: string
}): Promise<DockerPlaygroundMeta> {
  const dockerPath = await which('docker')
  if (!dockerPath) throw new Error('docker not found in PATH')

  const image = params.image.trim()
  if (!image) throw new Error('Image is required')

  // pull image
  await run(`"${dockerPath}" pull ${image}`)

  const portArg = params.port ? `-p ${params.port}:${params.port}` : ''
  const extra = params.extraArgs ? params.extraArgs : ''
  const { stdout } = await run(`"${dockerPath}" run -d ${portArg} ${extra} ${image}`)
  const containerId = stdout.trim()

  const id = safeId(`docker-${image.replace(/[:/]/g, '-')}`)
  const meta: DockerPlaygroundMeta = {
    id,
    type: 'docker',
    image,
    containerId,
    port: params.port,
    createdAt: nowIso(),
  }

  const list = await readMeta()
  list.unshift(meta)
  await writeMeta(list)
  return meta
}

export async function stopDockerContainer(containerId: string) {
  const dockerPath = await which('docker')
  if (!dockerPath) throw new Error('docker not found in PATH')
  await run(`"${dockerPath}" stop ${containerId}`)
}

export async function removeDockerContainer(containerId: string) {
  const dockerPath = await which('docker')
  if (!dockerPath) throw new Error('docker not found in PATH')
  await run(`"${dockerPath}" rm ${containerId}`)
}

export async function deleteDockerPlayground(id: string) {
  const list = await readMeta()
  const idx = list.findIndex((x) => x.id === id && x.type === 'docker')
  if (idx === -1) throw new Error('Not found')
  const item = list[idx] as DockerPlaygroundMeta
  try {
    await stopDockerContainer(item.containerId)
  } catch {
    // ignore
  }
  try {
    await removeDockerContainer(item.containerId)
  } catch {
    // ignore
  }
  list.splice(idx, 1)
  await writeMeta(list)
}

export async function openInEditor(playgroundId: string) {
  const list = await readMeta()
  const item = list.find((x) => x.id === playgroundId && x.type === 'github') as GithubPlaygroundMeta | undefined
  if (!item) throw new Error('GitHub playground not found')
  const target = item.path
  const editor = await which('code')
  if (editor) {
    await run(`"${editor}" "${target}"`)
    return
  }
  if (process.platform === 'darwin') {
    await run(`open -a \"Visual Studio Code\" "${target}"`)
    return
  }
  if (process.platform === 'win32') {
    await run(`cmd /c start code "${target}"`)
    return
  }
  // linux fallback
  await run(`xdg-open "${target}"`)
}

export async function openTerminal(playgroundId: string) {
  const list = await readMeta()
  const item = list.find((x) => x.id === playgroundId && x.type === 'github') as GithubPlaygroundMeta | undefined
  if (!item) throw new Error('GitHub playground not found')
  const target = item.path
  if (process.platform === 'darwin') {
    await run(`open -a Terminal "${target}"`)
    return
  }
  if (process.platform === 'win32') {
    await run(`cmd /c start wt -d "${target}"`)
    return
  }
  // Linux - attempt common terminals
  const candidates = [
    'x-terminal-emulator',
    'gnome-terminal',
    'konsole',
    'xfce4-terminal',
    'alacritty'
  ]
  for (const bin of candidates) {
    const p = await which(bin)
    if (p) {
      if (bin === 'gnome-terminal') {
        await run(`${bin} --working-directory="${target}" & disown`)
      } else if (bin === 'konsole') {
        await run(`${bin} --workdir "${target}" & disown`)
      } else if (bin === 'alacritty') {
        await run(`${bin} --working-directory "${target}" & disown`)
      } else {
        await run(`${bin} --working-directory="${target}" & disown`)
      }
      return
    }
  }
  // last resort
  await run(`sh -lc 'cd "${target}"; ${process.env.SHELL || 'bash'}'`)
}

export async function openPlaygroundsDirectory() {
  const target = BASE_DIR
  if (process.platform === 'darwin') {
    await run(`open -a Terminal "${target}"`)
    return
  }
  if (process.platform === 'win32') {
    await run(`cmd /c start wt -d "${target}"`)
    return
  }
  // Linux - attempt common terminals
  const candidates = [
    'x-terminal-emulator',
    'gnome-terminal',
    'konsole',
    'xfce4-terminal',
    'alacritty'
  ]
  for (const bin of candidates) {
    const p = await which(bin)
    if (p) {
      if (bin === 'gnome-terminal') {
        await run(`${bin} --working-directory="${target}" & disown`)
      } else if (bin === 'konsole') {
        await run(`${bin} --workdir "${target}" & disown`)
      } else if (bin === 'alacritty') {
        await run(`${bin} --working-directory "${target}" & disown`)
      } else {
        await run(`${bin} --working-directory="${target}" & disown`)
      }
      return
    }
  }
  // last resort
  await run(`sh -lc 'cd "${target}"; ${process.env.SHELL || 'bash'}'`)
}

export async function deletePlayground(id: string) {
  const list = await readMeta()
  const item = list.find((x) => x.id === id)
  if (!item) throw new Error('Not found')
  if (item.type === 'github') return deleteGithubPlayground(id)
  if (item.type === 'docker') return deleteDockerPlayground(id)
}

export { BASE_DIR, META_PATH, GITHUB_DIR }

// --- Dev command runner (GitHub playgrounds) ---

const devProcs = new Map<string, ChildProcess>()
const devLogs = new Map<string, string>()
export const devEvents = new EventEmitter()

function appendLog(id: string, text: string) {
  const prev = devLogs.get(id) || ''
  const next = (prev + text).slice(-20000)
  devLogs.set(id, next)
  devEvents.emit('log', { id, chunk: text })
}

export async function startDevCommand(id: string, command?: string): Promise<{ started: boolean; pid?: number; command: string }> {
  if (devProcs.has(id)) {
    const p = devProcs.get(id)!
    return { started: true, pid: p.pid, command: command || '' }
  }
  const list = await readMeta()
  const item = list.find((x) => x.id === id && x.type === 'github') as GithubPlaygroundMeta | undefined
  if (!item) throw new Error('GitHub playground not found')

  let cmd = command
  if (!cmd) {
    // If app is from catalog, use catalog's defaultRunCommand
    if (item.appStoreId) {
      try {
        const catalogApp = await getAppById(item.appStoreId)
        console.log(`Catalog lookup for ${item.appStoreId}:`, catalogApp ? 'found' : 'not found')
        if (catalogApp) {
          console.log(`defaultRunCommand exists: ${!!catalogApp.defaultRunCommand}, value: ${catalogApp.defaultRunCommand ? catalogApp.defaultRunCommand.substring(0, 50) + '...' : 'undefined'}`)
        }
        if (catalogApp?.defaultRunCommand) {
          const trimmed = catalogApp.defaultRunCommand.trim()
          if (trimmed) {
            cmd = trimmed
            console.log(`Using catalog defaultRunCommand for ${item.appStoreId}: ${cmd.substring(0, 100)}...`)
          } else {
            console.warn(`Catalog app ${item.appStoreId} found but defaultRunCommand is empty after trim`)
          }
        } else {
          console.warn(`Catalog app ${item.appStoreId} found but defaultRunCommand is missing`)
        }
      } catch (error) {
        // If catalog lookup fails, fall through to next options
        console.warn(`Failed to get catalog app ${item.appStoreId}:`, error)
      }
    }
    // Fall back to stored runCommand if not from catalog or catalog has no defaultRunCommand
    if (!cmd && item.runCommand && item.runCommand.trim()) {
      cmd = item.runCommand
    }
    // Final fallback: heuristic if package.json exists, run npm install && npm run dev
    if (!cmd) {
      try {
        const pkgPath = path.join(item.path, 'package.json')
        if (fs.existsSync(pkgPath)) {
          cmd = 'npm install && npm run dev'
        }
      } catch {
        // ignore
      }
    }
  }
  if (!cmd) {
    throw new Error(`No dev command configured for ${id}. ${item.appStoreId ? `Catalog app ${item.appStoreId} not found or has no defaultRunCommand.` : 'No runCommand in meta and no package.json found.'}`)
  }

  devLogs.set(id, '')
  appendLog(id, `$ ${cmd}\n`)
  const env = { ...process.env }
  if (item.port) env.PORT = String(item.port)

  const child = spawn(cmd, { cwd: item.path, shell: true, env })
  devProcs.set(id, child)

  child.stdout?.on('data', (d) => appendLog(id, d.toString()))
  child.stderr?.on('data', (d) => appendLog(id, d.toString()))
  child.on('exit', (code, signal) => {
    appendLog(id, `\n[process exited code=${code} signal=${signal}]\n`)
    devProcs.delete(id)
    devEvents.emit('exit', { id, code, signal })
  })

  return { started: true, pid: child.pid, command: cmd }
}

export async function stopDevCommand(id: string): Promise<void> {
  const p = devProcs.get(id)
  if (!p) return
  try {
    if (process.platform === 'win32') {
      // best-effort kill tree on Windows
      spawn('taskkill', ['/pid', String(p.pid), '/t', '/f'])
    } else {
      p.kill('SIGTERM')
    }
  } catch {
    // ignore
  }
}

export function getDevLog(id: string): { running: boolean; log: string } {
  return { running: devProcs.has(id), log: devLogs.get(id) || '' }
}
