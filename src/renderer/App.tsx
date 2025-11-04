import React, { useEffect, useMemo, useState } from 'react'
import type { PlaygroundWithStatus, AppCatalogEntry, GithubPlaygroundMeta } from '../common/types'

type TError = string | null

export default function App() {
  const [list, setList] = useState<PlaygroundWithStatus[]>([])
  const [catalog, setCatalog] = useState<AppCatalogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [installing, setInstalling] = useState<Record<string, boolean>>({})
  const [err, setErr] = useState<TError>(null)
  const [openLogId, setOpenLogId] = useState<string | null>(null)
  const [running, setRunning] = useState<Record<string, boolean>>({})
  const [logs, setLogs] = useState<Record<string, string>>({})

  const refresh = async () => {
    setLoading(true)
    setErr(null)
    try {
      const data = await window.api.listPlaygrounds()
      setList(data)
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  const loadCatalog = async () => {
    try {
      const data = await window.api.getAppCatalog()
      setCatalog(data)
    } catch (e: any) {
      setErr(e?.message || String(e))
    }
  }

  useEffect(() => {
    refresh()
    loadCatalog()
    const unlog = window.api.onDevLog(({ id, chunk }) => {
      setLogs((prev) => ({ ...prev, [id]: ((prev[id] || '') + chunk).slice(-20000) }))
      setRunning((prev) => ({ ...prev, [id]: true }))
    })
    const unexit = window.api.onDevExit(({ id }) => {
      setRunning((prev) => ({ ...prev, [id]: false }))
    })
    return () => {
      unlog()
      unexit()
    }
  }, [])

  const installedApps = useMemo(() => {
    return list.filter((item) => item.type === 'github' && (item as GithubPlaygroundMeta).appStoreId) as GithubPlaygroundMeta[]
  }, [list])

  const isAppInstalled = (appId: string): boolean => {
    return installedApps.some((app) => app.appStoreId === appId)
  }

  const getInstalledApp = (appId: string): GithubPlaygroundMeta | undefined => {
    return installedApps.find((app) => app.appStoreId === appId)
  }

  async function onInstallApp(appId: string) {
    setErr(null)
    setInstalling((prev) => ({ ...prev, [appId]: true }))
    try {
      await window.api.installApp(appId)
      await refresh()
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setInstalling((prev) => ({ ...prev, [appId]: false }))
    }
  }

  async function onDeleteApp(id: string) {
    setErr(null)
    try {
      await window.api.deletePlayground(id)
      await refresh()
    } catch (e: any) {
      setErr(e?.message || String(e))
    }
  }

  const installedAppItems = useMemo(() => {
    return installedApps.map((item) => {
      const catalogApp = catalog.find((app) => app.id === item.appStoreId)
      return { ...item, catalogApp }
    })
  }, [installedApps, catalog])

  return (
    <div className="container">
      <h1>Playgrounds</h1>
      <p className="muted small">Download and manage apps from the store. Base dir: ~/.playgrounds</p>
      {err && <p style={{ color: 'tomato' }}>Error: {err}</p>}

      <div className="row">
        <div className="card" style={{ flex: 1 }}>
          <h3>App Store</h3>
          <div className="list">
            {catalog.map((app) => {
              const installed = isAppInstalled(app.id)
              const installingApp = installing[app.id] || false
              return (
                <div className="item grid" key={app.id}>
                  <div>
                    <div><strong>{app.name}</strong></div>
                    <div className="small muted">{app.description}</div>
                    <div className="small muted">{app.repoUrl}</div>
                  </div>
                  <button
                    className="btn primary"
                    onClick={() => onInstallApp(app.id)}
                    disabled={installed || installingApp || loading}
                  >
                    {installingApp ? 'Installing...' : installed ? 'Installed' : 'Download'}
                  </button>
                </div>
              )
            })}
            {catalog.length === 0 && <p className="muted">No apps available.</p>}
          </div>
        </div>

        <div className="card" style={{ flex: 1 }}>
          <h3>My Apps</h3>
          <div className="list">
            {installedAppItems.map((item) => {
              const catalogApp = item.catalogApp
              return (
                <React.Fragment key={item.id}>
                  <div className="item grid">
                    <div>
                      <div><strong>{catalogApp?.name || item.id}</strong></div>
                      <div className="small muted">{item.repoUrl}</div>
                      <div className="small muted">{item.path}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button className="btn" onClick={() => window.api.openEditor(item.id)}>Open in editor</button>
                      <button className="btn" onClick={() => window.api.openTerminal(item.id)}>Open terminal</button>
                      <button
                        className="btn"
                        disabled={running[item.id]}
                        onClick={async () => {
                          setErr(null)
                          try {
                            const { running: wasRunning, log } = await window.api.getDevLog(item.id)
                            if (log) setLogs((prev) => ({ ...prev, [item.id]: log }))
                            setRunning((prev) => ({ ...prev, [item.id]: wasRunning }))
                            await window.api.startDev({ id: item.id })
                            setOpenLogId(item.id)
                          } catch (e: any) {
                            setErr(e?.message || String(e))
                          }
                        }}
                      >
                        Start
                      </button>
                      <button
                        className="btn"
                        disabled={!running[item.id]}
                        onClick={async () => {
                          await window.api.stopDev(item.id)
                        }}
                      >
                        Stop
                      </button>
                      <button
                        className="btn"
                        onClick={async () => {
                          const res = await window.api.getDevLog(item.id)
                          setLogs((prev) => ({ ...prev, [item.id]: res.log }))
                          setOpenLogId((cur) => cur === item.id ? null : item.id)
                        }}
                      >
                        {openLogId === item.id ? 'Hide logs' : 'Show logs'}
                      </button>
                      <button className="btn danger" onClick={() => onDeleteApp(item.id)}>Delete</button>
                    </div>
                  </div>
                  {openLogId === item.id && (
                    <div className="item" style={{ display: 'block' }}>
                      <div className="small muted" style={{ marginBottom: 8 }}>
                        Live logs {running[item.id] ? '(running)' : '(stopped)'}
                      </div>
                      <pre style={{ maxHeight: 240, overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap' }}>
                        {logs[item.id] || ''}
                      </pre>
                    </div>
                  )}
                </React.Fragment>
              )
            })}
            {installedAppItems.length === 0 && <p className="muted">No apps installed yet.</p>}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button className="btn" onClick={refresh} disabled={loading}>Refresh</button>
        <button className="btn" onClick={() => window.api.openPlaygroundsDirectory()}>Open Playgrounds Directory</button>
      </div>
    </div>
  )
}
