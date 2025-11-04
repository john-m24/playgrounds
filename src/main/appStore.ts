import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { AppCatalogEntry } from '../common/types'

// Get directory path - works in both dev and production
// When compiled to CommonJS, __dirname is available
// Try dist/main/apps first (production), then src/main/apps (dev), then __dirname/apps (fallback)
function getAppsDir(): string {
  const distApps = path.join(__dirname, 'apps')
  if (fs.existsSync(distApps)) {
    return distApps
  }
  // In dev mode, __dirname might point to src/main, or we need to go up to project root
  // Check if we're in dist/main and need to go up to project root
  if (__dirname.includes('dist/main')) {
    const projectRoot = path.resolve(__dirname, '../../..')
    const srcApps = path.join(projectRoot, 'src/main/apps')
    if (fs.existsSync(srcApps)) {
      return srcApps
    }
  }
  // Fallback: try src/main/apps relative to __dirname
  const srcApps = path.join(__dirname, '../../src/main/apps')
  if (fs.existsSync(srcApps)) {
    return srcApps
  }
  // Last resort: __dirname/apps
  return distApps
}

const APPS_DIR = getAppsDir()
console.log(`APPS_DIR resolved to: ${APPS_DIR}`)

let cachedCatalog: AppCatalogEntry[] | null = null

async function loadAppCatalog(): Promise<AppCatalogEntry[]> {
  // Return cached catalog if available
  if (cachedCatalog !== null) {
    return cachedCatalog
  }

  const catalog: AppCatalogEntry[] = []

  try {
    // Check if apps directory exists
    if (!fs.existsSync(APPS_DIR)) {
      console.warn(`Apps directory not found: ${APPS_DIR}`)
      cachedCatalog = [] // Cache empty result to avoid repeated file system checks
      return []
    }

    // Read all files in apps directory
    const files = await fsp.readdir(APPS_DIR)

    // Filter for JSON files
    const jsonFiles = files.filter((file) => file.endsWith('.json'))

    // Load each JSON file
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(APPS_DIR, file)
        const content = await fsp.readFile(filePath, 'utf-8')
        const appConfig = JSON.parse(content) as AppCatalogEntry

        // Validate required fields
        if (!appConfig.id || !appConfig.name || !appConfig.description || !appConfig.repoUrl) {
          console.warn(`Invalid app config in ${file}: missing required fields`)
          continue
        }

        // Ensure id matches filename (without .json extension)
        const expectedId = file.replace(/\.json$/, '')
        if (appConfig.id !== expectedId) {
          console.warn(`App id mismatch in ${file}: expected ${expectedId}, got ${appConfig.id}`)
          appConfig.id = expectedId // Use filename as id
        }

        console.log(`Loaded app ${appConfig.id} from ${file}, defaultRunCommand: ${appConfig.defaultRunCommand ? 'present (' + appConfig.defaultRunCommand.length + ' chars)' : 'missing'}`)
        catalog.push(appConfig)
      } catch (error) {
        console.error(`Error loading app config from ${file}:`, error)
        // Continue with other files
      }
    }

    // Cache the catalog
    cachedCatalog = catalog
    return catalog
  } catch (error) {
    console.error('Error loading app catalog:', error)
    return []
  }
}

export async function getAppCatalog(): Promise<AppCatalogEntry[]> {
  return loadAppCatalog()
}

export async function getAppById(id: string): Promise<AppCatalogEntry | undefined> {
  const catalog = await getAppCatalog()
  return catalog.find((app) => app.id === id)
}

