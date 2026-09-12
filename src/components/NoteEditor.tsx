import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Save, X } from 'lucide-react'
import { type Application } from '../model'
import { type Note } from '../notes'
import { Button, IconButton } from './Shared'

type Props = { note: Note; categories: string[]; apps: Application[]; onSave: (note: Note) => Promise<void>; onClose: () => void }

export default function NoteEditor({ note, categories, apps, onSave, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState(note)
  const [tags, setTags] = useState(note.tags.join('，'))
  const [error, setError] = useState('')
  const [discard, setDiscard] = useState(false)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(note) || tags !== note.tags.join('，')
  const close = () => { if (!saving) { if (dirty) setDiscard(true); else onClose() } }
  const patch = (value: Partial<Note>) => { setDraft(current => ({ ...current, ...value })); setError('') }

  useEffect(() => {
    const element = dialog.current
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element?.showModal()
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus() }
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    if (!draft.title.trim()) { setError('请填写笔记标题。'); return }
    setSaving(true)
    try {
      await onSave({ ...draft, title: draft.title.trim(), category: draft.category.trim() || '未分类', tags: [...new Set(tags.split(/[,，、\n]/).map(tag => tag.trim()).filter(Boolean))], updatedAt: new Date().toISOString() })
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : '笔记保存失败，编辑内容仍然保留。')
    } finally { setSaving(false) }
  }
  return <dialog className="note-editor" ref={dialog} aria-labelledby="note-editor-title" onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === event.currentTarget) close() }}>
    <form onSubmit={submit} className="note-editor-shell">
      <header><h2 id="note-editor-title">{note.title ? '编辑笔记' : '新建笔记'}</h2><IconButton icon={X} variant="ghost" label="关闭笔记编辑" onClick={close} /></header>
      <div className="note-editor-body" inert={saving}>
        <div className="note-editor-fields"><label>标题<input autoFocus value={draft.title} onChange={event => patch({ title: event.target.value })} placeholder="笔记标题" /></label><label>分类<input list="note-category-options" value={draft.category} onChange={event => patch({ category: event.target.value })} placeholder="选择或输入分类" /><datalist id="note-category-options">{categories.map(category => <option key={category} value={category} />)}</datalist></label></div>
        <label>正文 <span className="note-format-label">Markdown</span><textarea className="note-body-input" value={draft.body} onChange={event => patch({ body: event.target.value })} placeholder="写下你的笔记…" /></label>
        <label>标签<input value={tags} onChange={event => setTags(event.target.value)} placeholder="多个标签用逗号分隔" /></label>
        <fieldset className="note-job-picker"><legend>关联岗位</legend>{apps.length ? apps.map(app => <label key={app.id}><input type="checkbox" checked={draft.applicationIds.includes(String(app.id))} onChange={event => patch({ applicationIds: event.target.checked ? [...draft.applicationIds, String(app.id)] : draft.applicationIds.filter(id => id !== String(app.id)) })} /><span><strong>{app.company}</strong><small>{app.title || '岗位名称待补充'}</small></span></label>) : <p>暂无可关联岗位</p>}</fieldset>
      </div>
      <footer>{discard ? <><span role="alert">存在未保存的修改，确定放弃？</span><Button onClick={() => setDiscard(false)}>继续编辑</Button><Button variant="danger" onClick={onClose}>放弃更改</Button></> : <><span className="notes-error" role={error ? 'alert' : 'status'}>{error}</span><Button disabled={saving} onClick={close}>取消</Button><Button disabled={saving} type="submit" variant="primary" icon={Save}>{saving ? '保存中…' : '保存笔记'}</Button></>}</footer>
    </form>
  </dialog>
}
