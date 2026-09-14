import { useState, type FormEvent, type MouseEvent } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { Markdown } from '@tiptap/markdown'
import { AlignCenter, AlignLeft, AlignRight, Bold, Highlighter, Italic, List, ListOrdered, Maximize2, Minimize2, Redo2, Save, Type, Underline, Undo2, X } from 'lucide-react'
import { safeUrl } from '../model'
import { type Note } from '../notes'
import { Button, IconButton } from './Shared'
import './review.css'

type Props = { note: Note; onSave: (note: Note) => Promise<void>; onClose: () => void }

const hasRichMarkup = (value: string) => /<\s*(?:p|h[1-6]|ul|ol|li|blockquote|pre|strong|em|mark|a|br|hr)\b/i.test(value)
const initialContent = (value: string) => ({ content: value, contentType: hasRichMarkup(value) ? 'html' as const : 'markdown' as const })
const preserveSelection = (event: MouseEvent<HTMLButtonElement>) => event.preventDefault()

function NoteRichEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [initial] = useState(() => initialContent(value))
  const [expanded, setExpanded] = useState(false)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, isAllowedUri: value => Boolean(safeUrl(value)) },
        trailingNode: false,
      }),
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Markdown,
    ],
    ...initial,
    editorProps: { attributes: { role: 'textbox', 'aria-label': '笔记正文', 'aria-multiline': 'true', spellcheck: 'false' } },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onChange(html === '<p></p>' ? '' : html)
    },
  })
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      heading: editor.isActive('heading') ? String(editor.getAttributes('heading').level) : 'paragraph',
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      bullets: editor.isActive('bulletList'),
      ordered: editor.isActive('orderedList'),
      highlight: editor.isActive('highlight'),
      align: editor.isActive({ textAlign: 'center' }) ? 'center' : editor.isActive({ textAlign: 'right' }) ? 'right' : 'left',
      undo: editor.can().undo(),
      redo: editor.can().redo(),
    }),
  })

  if (!editor) return <div className="note-rich-editor-loading" role="status">正在加载编辑器…</div>
  return <div className={`stage-rich-editor note-rich-editor ${expanded ? 'is-expanded' : ''}`} onKeyDownCapture={event => {
    if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); setExpanded(false) }
  }}>
    <div className="review-toolbar" role="group" aria-label="正文格式">
      <label className="review-text-style"><Type size={16} aria-hidden="true" /><select aria-label="文本样式" value={state.heading} onChange={event => {
        const chain = editor.chain().focus()
        if (event.target.value === 'paragraph') chain.setParagraph().run()
        else chain.setHeading({ level: Number(event.target.value) as 1 | 2 | 3 }).run()
      }}><option value="paragraph">正文</option><option value="1">一级标题</option><option value="2">二级标题</option><option value="3">三级标题</option></select></label>
      <div className="review-toolbar-group">
        <IconButton icon={Bold} label="加粗" size="small" variant="ghost" aria-pressed={state.bold} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleBold().run()} />
        <IconButton icon={Italic} label="斜体" size="small" variant="ghost" aria-pressed={state.italic} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <IconButton icon={Underline} label="下划线" size="small" variant="ghost" aria-pressed={state.underline} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      </div>
      <div className="review-toolbar-group">
        <IconButton icon={List} label="项目符号" size="small" variant="ghost" aria-pressed={state.bullets} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <IconButton icon={ListOrdered} label="编号列表" size="small" variant="ghost" aria-pressed={state.ordered} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      </div>
      <div className="review-toolbar-group">
        <IconButton icon={AlignLeft} label="左对齐" size="small" variant="ghost" aria-pressed={state.align === 'left'} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
        <IconButton icon={AlignCenter} label="居中对齐" size="small" variant="ghost" aria-pressed={state.align === 'center'} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
        <IconButton icon={AlignRight} label="右对齐" size="small" variant="ghost" aria-pressed={state.align === 'right'} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().setTextAlign('right').run()} />
      </div>
      <IconButton icon={Highlighter} label="高亮" size="small" variant="ghost" className="review-highlight" aria-pressed={state.highlight} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().toggleHighlight().run()} />
      <div className="review-toolbar-group review-history">
        <IconButton icon={Undo2} label="撤销" size="small" variant="ghost" disabled={!state.undo} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().undo().run()} />
        <IconButton icon={Redo2} label="重做" size="small" variant="ghost" disabled={!state.redo} onMouseDown={preserveSelection} onClick={() => editor.chain().focus().redo().run()} />
      </div>
      <IconButton icon={expanded ? Minimize2 : Maximize2} label={expanded ? '收起编辑区' : '展开编辑区'} size="small" variant="ghost" aria-pressed={expanded} onMouseDown={preserveSelection} onClick={() => setExpanded(current => !current)} />
    </div>
    <EditorContent editor={editor} className="review-content" />
  </div>
}

export function NoteRichContent({ value }: { value: string }) {
  const [initial] = useState(() => initialContent(value))
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: true, isAllowedUri: value => Boolean(safeUrl(value)) },
        trailingNode: false,
      }),
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Markdown,
    ],
    ...initial,
    editable: false,
    editorProps: { attributes: { role: 'document', 'aria-label': '笔记正文' } },
  })
  if (!editor || editor.isEmpty) return <p className="notes-reader-empty-body">暂无正文</p>
  return <EditorContent editor={editor} className="note-rich-content" />
}

export default function NoteEditor({ note, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(note)
  const [tags, setTags] = useState(note.tags.join('，'))
  const [error, setError] = useState('')
  const [discard, setDiscard] = useState(false)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(note) || tags !== note.tags.join('，')
  const patch = (value: Partial<Note>) => { setDraft(current => ({ ...current, ...value })); setError('') }
  const close = () => { if (!saving) { if (dirty) setDiscard(true); else onClose() } }

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

  return <form className="note-editor-inline" onSubmit={submit}>
    <header className="note-editor-inline-header">
      <div><p>笔记编辑</p><h2>{note.title ? '编辑笔记' : '新建笔记'}</h2></div>
      <IconButton icon={X} variant="ghost" label="关闭笔记编辑" onClick={close} />
    </header>
    <div className="note-editor-inline-body" aria-busy={saving}>
      <div className="note-editor-fields"><label>标题<input autoFocus value={draft.title} onChange={event => patch({ title: event.target.value })} placeholder="笔记标题" /></label><label>标签<input value={tags} onChange={event => { setTags(event.target.value); setError('') }} placeholder="多个标签用逗号分隔" /></label></div>
      <label className="note-body-field"><span className="note-body-label">正文</span><NoteRichEditor value={draft.body} onChange={body => patch({ body })} /></label>
    </div>
    <footer className="note-editor-inline-footer">{discard ? <><span role="alert">存在未保存的修改，确定放弃？</span><Button onClick={() => setDiscard(false)}>继续编辑</Button><Button variant="danger" onClick={onClose}>放弃更改</Button></> : <><span className="notes-error" role={error ? 'alert' : 'status'}>{error}</span><Button disabled={saving} onClick={close}>取消</Button><Button disabled={saving} type="submit" variant="primary" icon={Save}>{saving ? '保存中…' : '保存笔记'}</Button></>}</footer>
  </form>
}
