import { useEffect, useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import { BookOpen, Box, BriefcaseBusiness, ChevronRight, Clock3, Code2, FileText, Link2, MessageCircle, Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import { type Application, safeUrl } from '../model'
import { newNote, noteCategories, noteDate, readNotes, type Note } from '../notes'
import { post, request } from '../api'
import NoteEditor from './NoteEditor'
import { Button, Heading, IconButton, SearchField } from './Shared'
import './notes.css'

type Props = { apps: Application[]; onOpenJob: (app: Application) => void }
const icons = [BookOpen, Code2, Box, UserRound, MessageCircle, FileText]

export default function Notes({ apps, onOpenJob }: Props) {
  const [loaded, setLoaded] = useState<{ notes: Note[]; error: string }>({ notes: [], error: '' })
  const [loading, setLoading] = useState(true)
  const [legacyCount, setLegacyCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('updated')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editor, setEditor] = useState<Note | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const categories = [...new Set([...noteCategories, ...loaded.notes.map(note => note.category)])]
  const filtered = useMemo(() => loaded.notes.filter(note =>
    (!category || note.category === category)
    && `${note.title} ${note.body} ${note.tags.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()),
  ).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'zh-CN') : sort === 'oldest' ? a.updatedAt.localeCompare(b.updatedAt) : b.updatedAt.localeCompare(a.updatedAt)), [loaded.notes, category, query, sort])
  const selected = filtered.find(note => note.id === selectedId) || filtered[0]
  const linked = selected ? apps.filter(app => selected.applicationIds.includes(String(app.id))) : []
  const unavailableLinks = selected ? selected.applicationIds.length - linked.length : 0

  async function refresh() {
    setLoading(true)
    try { setLoaded({ notes: await request<Note[]>('/api/notes'), error: '' }) }
    catch (error) { setLoaded(current => ({ ...current, error: (error as Error).message })) }
    finally { setLoading(false) }
  }
  useEffect(() => {
    void refresh()
    try { setLegacyCount(readNotes().length) }
    catch { setActionError('旧浏览器笔记格式异常，原始数据仍保留；数据库笔记不受影响。') }
  }, [])

  const save = async (note: Note) => {
    if (loaded.error) throw new Error(loaded.error)
    const saved = await post<Note>('/api/notes', { ...note, expectedUpdatedAt: editor?.updatedAt })
    setLoaded(current => ({ notes: current.notes.some(item => item.id === saved.id) ? current.notes.map(item => item.id === saved.id ? saved : item) : [saved, ...current.notes], error: '' }))
    setSelectedId(saved.id); setQuery(''); setCategory(''); setNotice('已保存到数据库')
  }
  const remove = async () => {
    if (!deleteId || loaded.error || busy) return
    setBusy(true)
    try {
      await request(`/api/notes/${deleteId}`, { method: 'DELETE', body: JSON.stringify({ expectedUpdatedAt: selected?.updatedAt }) })
      setLoaded(current => ({ notes: current.notes.filter(note => note.id !== deleteId), error: '' })); setDeleteId(null); setNotice('笔记已移入数据库回收记录')
    } catch (error) { setActionError((error as Error).message) }
    finally { setBusy(false) }
  }
  async function migrate() {
    setBusy(true); setActionError('')
    try { await post('/api/notes/import', readNotes()); await refresh(); setLegacyCount(0); setNotice('已导入旧笔记，浏览器原始副本保留；同名标识的数据库笔记不会被覆盖') }
    catch (error) { setActionError((error as Error).message) }
    finally { setBusy(false) }
  }
  const startNew = () => { if (loading || busy || loaded.error) return; setEditor(newNote(category || '面试知识')); setActionError(''); setDeleteId(null) }

  return <section className="notes-page">
    <Heading className="notes-page-header" title="笔记" meta="沉淀可复用的面试内容、项目话术与经验总结。" action={<div className="notes-header-actions"><SearchField className="notes-search" label="搜索笔记" value={query} onChange={event => { setQuery(event.target.value); setDeleteId(null) }} placeholder="搜索笔记标题、内容或标签…" /><Button variant="primary" icon={Plus} onClick={startNew} disabled={loading || busy || Boolean(loaded.error)}>新建笔记</Button></div>} />
    {legacyCount > 0 && <div className="notes-migration"><span>发现 {legacyCount} 篇浏览器旧笔记</span><Button disabled={busy || loading || Boolean(loaded.error)} onClick={migrate}>导入数据库</Button></div>}
    {loading && <p role="status">正在加载数据库笔记…</p>}
    {loaded.error && <Button onClick={refresh}>重新连接</Button>}
    <div className="notes-categories" role="group" aria-label="笔记分类"><button aria-pressed={!category} onClick={() => { setCategory(''); setDeleteId(null) }}>全部</button>{categories.map(value => <button key={value} aria-pressed={category === value} onClick={() => { setCategory(value); setDeleteId(null) }}>{value}</button>)}</div>
    {(loaded.error || actionError) && <div className="notes-error-banner" role="alert">{loaded.error || actionError}</div>}
    <div className="notes-workspace">
      <aside className="notes-list-pane"><header><h2>我的笔记（{filtered.length}）</h2><select aria-label="笔记排序" value={sort} onChange={event => setSort(event.target.value)}><option value="updated">按更新时间</option><option value="oldest">最早更新</option><option value="title">按标题</option></select></header>
        <div className="notes-list">{filtered.map(note => {
          const color = Math.max(0, categories.indexOf(note.category)) % icons.length
          const Icon = icons[color]
          return <button className={`notes-list-row ${selected?.id === note.id ? 'selected' : ''}`} key={note.id} aria-pressed={selected?.id === note.id} onClick={() => { setSelectedId(note.id); setDeleteId(null); setActionError('') }}>
            <span className={`notes-symbol notes-color-${color}`}><Icon size={25} strokeWidth={1.8} /></span><span className="notes-list-content"><span className="notes-row-top"><strong>{note.title}</strong><span className={`notes-category-badge notes-color-${color}`}>{note.category}</span><time dateTime={note.updatedAt}>{noteDate(note.updatedAt)}</time></span><span className="notes-excerpt">{note.body.replace(/\s+/g, ' ').slice(0, 140) || '暂无正文'}</span></span>
          </button>
        })}{!filtered.length && <div className="notes-list-empty"><BookOpen size={30} /><p>{loaded.notes.length ? '没有匹配的笔记' : '暂无笔记'}</p><Button icon={Plus} disabled={loading || busy || Boolean(loaded.error)} onClick={startNew}>新建笔记</Button></div>}</div>
      </aside>
      <article className="notes-reader">{selected ? <>
        <header className="notes-reader-header"><h2>{selected.title}</h2><Button icon={Pencil} onClick={() => { setEditor(selected); setDeleteId(null) }} disabled={loading || busy || Boolean(loaded.error)}>编辑</Button><IconButton icon={Trash2} label="删除当前笔记" disabled={loading || busy || Boolean(loaded.error)} onClick={() => { setDeleteId(selected.id); setActionError('') }} /></header>
        <div className="notes-reader-meta"><span className={`notes-category-badge notes-color-${Math.max(0, categories.indexOf(selected.category)) % icons.length}`}>{selected.category}</span><span><Clock3 size={15} />最近更新：{noteDate(selected.updatedAt)}</span><span><BriefcaseBusiness size={15} />关联岗位数：{selected.applicationIds.length}</span></div>
        {deleteId === selected.id && <div className="notes-delete-confirm" role="alert"><span>确定移除“{selected.title}”？数据库会保留回收记录及岗位关联。</span><Button disabled={busy} onClick={() => setDeleteId(null)}>取消</Button><Button disabled={busy} variant="danger" onClick={remove}>确认删除</Button></div>}
        <div className="notes-markdown"><Markdown skipHtml disallowedElements={['img']} components={{ a: ({ href, children }) => safeUrl(href) ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <span>{children}</span> }}>{selected.body || '暂无正文'}</Markdown></div>
        <footer className="notes-reader-footer"><section><h3>相关标签</h3><div className="notes-tags">{selected.tags.map(tag => <button key={tag} onClick={() => { setQuery(tag); setDeleteId(null) }}>{tag}</button>)}<button className="notes-add-tag" onClick={() => setEditor(selected)} disabled={loading || busy || Boolean(loaded.error)}><Plus size={12} />{selected.tags.length ? '编辑标签' : '添加标签'}</button></div></section><section className="notes-linked-jobs"><div><Link2 size={19} /><strong>已关联 {selected.applicationIds.length} 个岗位</strong></div>{linked.map(app => <button key={app.id} onClick={() => onOpenJob(app)}><span>{app.company} · {app.title || '岗位名称待补充'}</span><ChevronRight size={15} /></button>)}{unavailableLinks > 0 && <p>{unavailableLinks} 个关联岗位暂不可用</p>}{selected.applicationIds.length === 0 && <button onClick={() => setEditor(selected)}>关联岗位<Plus size={14} /></button>}</section></footer>
      </> : <div className="notes-reader-empty"><FileText size={42} strokeWidth={1.3} /><h2>{loaded.notes.length ? '没有匹配的笔记' : '写下第一篇笔记'}</h2><Button variant="primary" icon={Plus} onClick={startNew} disabled={loading || busy || Boolean(loaded.error)}>新建笔记</Button></div>}</article>
    </div>
    <div className="notes-storage-status" role="status">{notice || (loaded.error ? '数据库暂不可用' : loading ? '正在加载' : '笔记由本地后端持久保存')}</div>
    {editor && <NoteEditor key={editor.id} note={editor} categories={categories} apps={apps} onSave={save} onClose={() => setEditor(null)} />}
  </section>
}
