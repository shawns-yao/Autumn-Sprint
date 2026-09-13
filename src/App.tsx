import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { BriefcaseBusiness, ChartNoAxesCombined, FileStack, House, NotebookPen, Plus, RefreshCw, Settings2, Star, type LucideIcon } from 'lucide-react'
import ApplicationsView from './components/Applications'
import Overview from './components/Overview'
import Notes from './components/Notes'
import HomePage from './components/HomePage'
import Resources from './components/Resources'
import SettingsView from './components/SettingsView'
import { Button, IconButton, SearchField } from './components/Shared'
import { companyApplications, makeApplication, normalizedCompany, type Application, type View } from './model'
import { post, request } from './api'
import './components/home.css'
import './components/connected.css'

const ApplicationDialog = lazy(() => import('./components/ApplicationDialog'))

const nav: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: '首页', icon: House },
  { id: 'overview', label: '投递总览', icon: ChartNoAxesCombined },
  { id: 'applications', label: '岗位', icon: BriefcaseBusiness },
  { id: 'notes', label: '笔记', icon: NotebookPen },
  { id: 'documents', label: '投递资源', icon: FileStack },
  { id: 'settings', label: '设置', icon: Settings2 },
]

export default function App() {
  const [view, setView] = useState<View>('home')
  const [apps, setApps] = useState<Application[]>([])
  const [selected, setSelected] = useState<Application | null>(null)
  const [selectedTab, setSelectedTab] = useState<'basic' | 'stages' | 'interviews' | 'review'>('basic')
  const [query, setQuery] = useState('')
  const [dataState, setDataState] = useState<'loading' | 'server' | 'offline'>('loading')
  const [error, setError] = useState('')
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const sequence = ++generation.current
    try {
      const data = await request<{ applications: Application[] }>('/api/workspace')
      if (sequence !== generation.current) return
      if (!Array.isArray(data.applications)) throw new Error('服务数据格式异常')
      setApps(data.applications); setDataState('server'); setError('')
    } catch (error) {
      if (sequence !== generation.current) return
      setApps([]); setDataState('offline'); setError((error as Error).message)
    }
  }, [])
  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 60000)
    return () => { clearInterval(timer); generation.current++ }
  }, [refresh])
  const save = async (draft: Application, companyOrder?: string[]) => {
    const saved = await post<Application>('/api/applications', companyOrder === undefined ? draft : { ...draft, companyOrder })
    setApps(current => current.some(app => String(app.id) === String(saved.id)) ? current.map(app => String(app.id) === String(saved.id) ? saved : app) : [saved, ...current])
    setSelected(saved)
    void refresh()
    return saved
  }
  const openApplication = (app: Application) => { setSelected(app); setSelectedTab('basic') }
  const openNewApplication = (company = '', initialTab: 'basic' | 'stages' | 'interviews' | 'review' = 'basic') => { setSelected({ ...makeApplication(), company }); setSelectedTab(initialTab) }
  const deleteApplication = async (target: Application) => {
    await request(`/api/applications/${target.id}`, { method: 'DELETE', body: JSON.stringify({ revision: target.revision }) })
    const persisted = apps.find(app => String(app.id) === String(target.id)) || target
    const sibling = companyApplications(apps, persisted.company).find(app => String(app.id) !== String(target.id))
    setApps(current => current.filter(app => String(app.id) !== String(target.id)))
    if (sibling) { setSelected(sibling); setSelectedTab('stages') } else setSelected(null)
    void refresh()
  }
  const deleteCompany = async (company: string) => {
    await request('/api/companies', { method: 'DELETE', body: JSON.stringify({ company }) })
    setApps(current => current.filter(app => normalizedCompany(app.company) !== normalizedCompany(company)))
    setSelected(null)
    void refresh()
  }
  const navigate = (next: View) => setView(next)
  const workspaceActions = <div className="top-actions"><SearchField label="搜索岗位" value={query} placeholder="搜索公司、岗位或状态" onChange={event => { setQuery(event.target.value); if (event.target.value.trim()) setView('applications') }} /><IconButton icon={RefreshCw} label="刷新数据" onClick={refresh} /><Button variant="primary" icon={Plus} disabled={dataState !== 'server'} onClick={() => openNewApplication()}>新建岗位</Button></div>
  return <div className="war-room top-navigation">
    <header className="site-header">
      <button className="site-brand" onClick={() => navigate('home')} aria-label="秋招速递首页"><img src="/images/brand-leaf.png" alt="" width="44" height="48" /><span><strong>秋招速递</strong><small>让理想的工作，与你更近</small></span></button>
      <nav aria-label="主导航">{nav.map(({ id, label, icon: Icon }) => <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={16} strokeWidth={1.9} />{label}</button>)}</nav>
      <a className="github-link" href="https://github.com/shawns-yao/Autumn-Sprint" target="_blank" rel="noreferrer" aria-label="在 GitHub 查看 Autumn-Sprint"><Star size={15} fill="currentColor" aria-hidden="true" /><span>Star on GitHub</span></a>
    </header>
    <main className={`war-main ${view === 'home' ? '' : 'workspace-page'}`}>
      {view !== 'home' && <div className="workspace-scenery" aria-hidden="true" />}
      <div className="app-canvas">
        {view === 'home' && <HomePage onView={navigate} />}
        {['overview', 'applications'].includes(view) && dataState !== 'server' && <div className="connection-state" role={error ? 'alert' : 'status'}><p>{error || '正在读取岗位记录…'}</p>{error && <Button icon={RefreshCw} onClick={refresh}>重新连接</Button>}</div>}
        {view === 'overview' && dataState === 'server' && <Overview apps={apps} onOpen={openApplication} onView={navigate} action={workspaceActions} />}
        {view === 'applications' && dataState === 'server' && <ApplicationsView apps={apps} query={query} setQuery={setQuery} selectedId={selected?.id} onOpen={openApplication} onCreate={() => openNewApplication()} action={workspaceActions} />}
        {view === 'notes' && <Notes apps={apps} onOpenJob={openApplication} />}
        {view === 'documents' && <Resources />}
        {view === 'settings' && <SettingsView onSaved={refresh} />}
      </div>
    </main>
    {selected && <Suspense fallback={<div className="dialog-loading" role="status">正在打开岗位详情…</div>}><ApplicationDialog key={selected.id} app={selected} apps={apps} initialTab={selectedTab} onSelectJob={setSelected} onCreateJob={openNewApplication} onDelete={deleteApplication} onDeleteCompany={deleteCompany} onClose={() => { setSelected(null); void refresh() }} onSave={save} /></Suspense>}
  </div>
}
