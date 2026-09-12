import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Bell, Plus, RefreshCw } from 'lucide-react'
import ApplicationsView from './components/Applications'
import ApplicationDialog from './components/ApplicationDialog'
import Overview from './components/Overview'
import Notes from './components/Notes'
import HomePage from './components/HomePage'
import Resources from './components/Resources'
import SettingsView from './components/SettingsView'
import { Button, IconButton, SearchField } from './components/Shared'
import { makeApplication, type Application, type View } from './model'
import { post, request } from './api'
import './components/home.css'
import './components/connected.css'

type Reminder = { id: string; applicationId: string; company: string; label: string }
const nav: [View, string][] = [['home', '首页'], ['overview', '投递总览'], ['applications', '岗位'], ['notes', '笔记'], ['documents', '投递资源'], ['settings', '设置']]

export default function App() {
  const [view, setView] = useState<View>('home')
  const [apps, setApps] = useState<Application[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [showReminders, setShowReminders] = useState(false)
  const [selected, setSelected] = useState<Application | null>(null)
  const [query, setQuery] = useState('')
  const [dataState, setDataState] = useState<'loading' | 'server' | 'offline'>('loading')
  const [error, setError] = useState('')
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const sequence = ++generation.current
    try {
      const data = await request<{ applications: Application[]; reminders: Reminder[] }>('/api/workspace')
      if (sequence !== generation.current) return
      if (!Array.isArray(data.applications) || !Array.isArray(data.reminders)) throw new Error('服务数据格式异常')
      setApps(data.applications); setReminders(data.reminders); setDataState('server'); setError('')
    } catch (error) {
      if (sequence !== generation.current) return
      setApps([]); setReminders([]); setDataState('offline'); setError((error as Error).message)
    }
  }, [])
  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 60000)
    return () => { clearInterval(timer); generation.current++ }
  }, [refresh])
  const save = async (draft: Application) => {
    const saved = await post<Application>('/api/applications', draft)
    setApps(current => current.some(app => app.id === saved.id) ? current.map(app => app.id === saved.id ? saved : app) : [saved, ...current])
    setSelected(saved)
    void refresh()
    return saved
  }
  const navigate = (next: View) => { setView(next); setShowReminders(false) }
  return <div className="war-room top-navigation">
    <header className="site-header">
      <button className="site-brand" onClick={() => navigate('home')} aria-label="秋招速递首页"><img src="/images/brand-leaf.png" alt="" width="44" height="48" /><span><strong>秋招速递</strong><small>让理想的工作，与你更近</small></span></button>
      <nav aria-label="主导航">{nav.map(([id, label]) => <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}>{label}</button>)}</nav>
      <div className="header-workspace-actions"><IconButton icon={Bell} label={`站内提醒，${reminders.length} 条`} aria-expanded={showReminders} onClick={() => setShowReminders(!showReminders)} /><Button variant="primary" onClick={() => navigate('overview')}>进入工作台<ArrowRight size={16} /></Button></div>
    </header>
    {showReminders && <section className="reminders-panel" aria-label="站内提醒"><h2>站内提醒</h2>{dataState !== 'server' ? <p>服务未连接，无法读取提醒</p> : reminders.length ? reminders.map(item => <button key={item.id} onClick={() => { const app = apps.find(app => app.id === item.applicationId); if (app) setSelected(app); setShowReminders(false) }}><strong>{item.company}</strong><span>{item.label}</span></button>) : <p>暂无提醒</p>}</section>}
    <main className="war-main">
      {['overview', 'applications'].includes(view) && <header className="top-line">
        <span className="crumb">秋招速递 / {nav.find(item => item[0] === view)?.[1]}</span>
        <div className="top-actions"><SearchField label="搜索岗位" value={query} placeholder="搜索公司、岗位或状态" onChange={event => { setQuery(event.target.value); if (event.target.value.trim()) setView('applications') }} /><span className="sync">{dataState === 'server' ? '已连接' : dataState === 'loading' ? '正在加载' : '未连接'}</span><IconButton icon={RefreshCw} label="刷新数据" onClick={refresh} /><Button variant="primary" icon={Plus} disabled={dataState !== 'server'} onClick={() => setSelected(makeApplication())}>新建岗位</Button></div>
      </header>}
      <div className="app-canvas">
        {view === 'home' && <HomePage onView={navigate} />}
        {['overview', 'applications'].includes(view) && dataState !== 'server' && <div className="connection-state" role={error ? 'alert' : 'status'}><p>{error || '正在读取岗位记录…'}</p>{error && <Button icon={RefreshCw} onClick={refresh}>重新连接</Button>}</div>}
        {view === 'overview' && dataState === 'server' && <Overview apps={apps} onOpen={setSelected} onView={navigate} />}
        {view === 'applications' && dataState === 'server' && <ApplicationsView apps={apps} query={query} setQuery={setQuery} selectedId={selected?.id} onOpen={setSelected} onCreate={() => setSelected(makeApplication())} />}
        {view === 'notes' && <Notes apps={apps} onOpenJob={setSelected} />}
        {view === 'documents' && <Resources />}
        {view === 'settings' && <SettingsView onSaved={refresh} />}
      </div>
    </main>
    {selected && <ApplicationDialog key={selected.id} app={selected} onClose={() => { setSelected(null); void refresh() }} onSave={save} />}
  </div>
}
