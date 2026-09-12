import { useEffect, useState, type FormEvent } from 'react'
import { ExternalLink, FolderOpen, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button, Empty, Heading, IconButton, SearchField } from './Shared'
import { post, request } from '../api'

type Resource = { id: string; name: string; url: string; note: string; updatedAt?: string }
const storageKey = 'autumn-sprint.resources.v1'
function loadResources() {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw === null) return { items: [] as Resource[], error: '' }
    const items: unknown = JSON.parse(raw)
    if (!Array.isArray(items) || !items.every(item => item && ['id', 'name', 'url', 'note'].every(key => typeof item[key] === 'string') && validUrl(item.url))) throw new Error()
    return { items: items as Resource[], error: '' }
  } catch { return { items: [] as Resource[], error: '无法读取已保存的资源，原始数据未被覆盖。请检查浏览器存储后刷新。' } }
}
function validUrl(value: string) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}

export default function Resources() {
  const [legacy] = useState(loadResources)
  const [loaded, setLoaded] = useState({ error: '', ready: false })
  const [items, setItems] = useState<Resource[]>([])
  const [error, setError] = useState(legacy.error)
  const [busy, setBusy] = useState(false)
  const [legacyImported, setLegacyImported] = useState(false)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<Resource | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  async function refresh() {
    try { setItems(await request<Resource[]>('/api/resources')); setLoaded({ error: '', ready: true }); setError(legacy.error) }
    catch (error) { setLoaded({ error: (error as Error).message, ready: false }); setError((error as Error).message) }
  }
  useEffect(() => { void refresh() }, [])
  function closeEditor() {
    if (!draft || busy) return
    const original = items.find(item => item.id === draft.id)
    const changed = original ? JSON.stringify(original) !== JSON.stringify(draft) : Boolean(draft.name || draft.url || draft.note)
    if (!changed || window.confirm('放弃尚未保存的资源修改？')) setDraft(null)
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || busy) return
    const resource = { ...draft, name: draft.name.trim(), url: draft.url.trim(), note: draft.note.trim() }
    if (!resource.name || !validUrl(resource.url)) { setError('请填写名称和有效的 HTTP / HTTPS 网址。'); return }
    setBusy(true)
    try {
      const saved = await post<Resource>('/api/resources', resource)
      setItems(current => [...current.filter(item => item.id !== saved.id), saved]); setDraft(null); setError('')
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  async function remove(item: Resource) {
    setBusy(true)
    try { await request(`/api/resources/${item.id}`, { method: 'DELETE', body: JSON.stringify({ updatedAt: item.updatedAt }) }); setItems(current => current.filter(resource => resource.id !== item.id)); setPendingDelete(null); setError('') }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  async function migrate() {
    setBusy(true)
    try {
      await post('/api/resources/import', legacy.items)
      await refresh(); setLegacyImported(true)
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  const visible = items.filter(item => `${item.name} ${item.url} ${item.note}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <section className="resources-page">
    <Heading title="投递资源" meta="招聘官网 · 投递文档 · 实用链接" action={<Button variant="primary" icon={Plus} disabled={!loaded.ready || busy || Boolean(draft)} onClick={() => { setDraft({ id: crypto.randomUUID(), name: '', url: '', note: '' }); setPendingDelete(null) }}>添加资源</Button>} />
    <div className="resources-toolbar"><SearchField label="搜索资源" placeholder="搜索名称、网址或备注" value={query} onChange={event => setQuery(event.target.value)} /><span>{loaded.ready ? `共 ${visible.length} 项 · 数据库持久保存` : '资源尚未加载'}</span><Button disabled={busy || Boolean(draft)} onClick={refresh}>刷新</Button></div>
    {legacy.items.length > 0 && !legacyImported && <Button disabled={busy || !loaded.ready || Boolean(draft)} onClick={migrate}>导入浏览器旧资源（保留原副本）</Button>}
    {error && <p role="alert" className="resources-error">{error}</p>}
    {draft && <form className="resource-editor" onSubmit={save}>
      <header><h2>{items.some(item => item.id === draft.id) ? '编辑资源' : '添加资源'}</h2><IconButton icon={X} label="关闭资源编辑" variant="ghost" onClick={closeEditor} /></header>
      <div className="resource-fields" inert={busy}>
        <label>名称<input required maxLength={100} autoFocus value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>网址<input required type="url" placeholder="https://" value={draft.url} onChange={event => setDraft({ ...draft, url: event.target.value })} /></label>
        <label className="resource-note">备注<textarea rows={2} maxLength={1000} value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} /></label>
      </div>
      <footer><Button disabled={busy} onClick={closeEditor}>取消</Button><Button disabled={busy} type="submit" variant="primary">{busy ? '保存中…' : '保存资源'}</Button></footer>
    </form>}
    <div className="resource-list">{visible.map(item => <article className="resource-row" key={item.id}>
      <FolderOpen className="resource-symbol" size={24} />
      <div className="resource-info"><h2><a href={item.url} target="_blank" rel="noopener noreferrer">{item.name}<ExternalLink size={15} /></a></h2><span>{item.url}</span>{item.note && <p>{item.note}</p>}</div>
      {pendingDelete === item.id ? <div className="resource-actions"><span>确认移除？数据库保留回收记录。</span><Button disabled={busy} variant="danger" size="small" onClick={() => remove(item)}>删除</Button><Button disabled={busy} size="small" onClick={() => setPendingDelete(null)}>取消</Button></div> : <div className="resource-actions"><IconButton icon={Pencil} label={`编辑${item.name}`} variant="ghost" disabled={Boolean(draft) || busy} onClick={() => { setDraft({ ...item }); setPendingDelete(null) }} /><IconButton icon={Trash2} label={`删除${item.name}`} variant="ghost" disabled={Boolean(draft) || busy} onClick={() => setPendingDelete(item.id)} /></div>}
    </article>)}</div>
    {!visible.length && <Empty>{query ? '没有找到匹配的资源' : '暂无投递资源'}</Empty>}
  </section>
}
