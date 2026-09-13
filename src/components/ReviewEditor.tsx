import { useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { Markdown } from '@tiptap/markdown'
import { AlignCenter, AlignLeft, AlignRight, Bold, Highlighter, Italic, List, ListOrdered, Maximize2, Minimize2, Redo2, Type, Underline, Undo2 } from 'lucide-react'
import { safeUrl, type Stage } from '../model'
import { IconButton } from './Shared'
import './review.css'

type Props = { value: Stage; label?: string; compact?: boolean } & (
  | { readOnly: true; onChange?: never }
  | { readOnly?: false; onChange: (value: Partial<Stage>) => void }
)

export default function ReviewEditor({ value, onChange, label = '复盘正文', compact = false, readOnly = false }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [initial] = useState(() => ({
    content: value.review?.html ?? [value.requirements, value.notes].filter(Boolean).join('\n\n'),
    contentType: value.review?.html !== undefined ? 'html' as const : 'markdown' as const,
  }))
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: readOnly, isAllowedUri: value => Boolean(safeUrl(value)) },
        trailingNode: false,
      }),
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Markdown,
    ],
    ...initial,
    editable: !readOnly,
    editorProps: { attributes: readOnly
      ? { role: 'document', 'aria-label': label }
      : { role: 'textbox', 'aria-label': label, 'aria-multiline': 'true', spellcheck: 'false' } },
    onUpdate: ({ editor }) => {
      if (!readOnly) onChange?.({
        requirements: '',
        notes: editor.getMarkdown(),
        review: { tags: value.review?.tags || [], html: editor.getHTML() },
      })
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

  if (readOnly) return <div className="stage-record-preview">
    {editor.isEmpty ? <p className="stage-record-empty">暂无阶段记录</p> : <EditorContent editor={editor} className="review-content" />}
  </div>

  return <div className={`stage-rich-editor ${compact ? 'compact' : ''} ${expanded ? 'is-expanded' : ''}`} onKeyDownCapture={event => {
    if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); setExpanded(false) }
  }}>
    <div className="review-toolbar" role="group" aria-label="正文格式">
      <label className="review-text-style"><Type size={16} aria-hidden="true" /><select aria-label="文本样式" value={state.heading} onChange={event => {
        const chain = editor.chain().focus()
        if (event.target.value === 'paragraph') chain.setParagraph().run()
        else chain.setHeading({ level: Number(event.target.value) as 1 | 2 | 3 }).run()
      }}><option value="paragraph">正文</option><option value="1">一级标题</option><option value="2">二级标题</option><option value="3">三级标题</option></select></label>
      <div className="review-toolbar-group">
        <IconButton icon={Bold} label="加粗" size="small" variant="ghost" aria-pressed={state.bold} onClick={() => editor.chain().focus().toggleBold().run()} />
        <IconButton icon={Italic} label="斜体" size="small" variant="ghost" aria-pressed={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <IconButton icon={Underline} label="下划线" size="small" variant="ghost" aria-pressed={state.underline} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      </div>
      <div className="review-toolbar-group">
        <IconButton icon={List} label="项目符号" size="small" variant="ghost" aria-pressed={state.bullets} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <IconButton icon={ListOrdered} label="编号列表" size="small" variant="ghost" aria-pressed={state.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      </div>
      <div className="review-toolbar-group">
        <IconButton icon={AlignLeft} label="左对齐" size="small" variant="ghost" aria-pressed={state.align === 'left'} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
        <IconButton icon={AlignCenter} label="居中对齐" size="small" variant="ghost" aria-pressed={state.align === 'center'} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
        <IconButton icon={AlignRight} label="右对齐" size="small" variant="ghost" aria-pressed={state.align === 'right'} onClick={() => editor.chain().focus().setTextAlign('right').run()} />
      </div>
      <IconButton icon={Highlighter} label="高亮" size="small" variant="ghost" className="review-highlight" aria-pressed={state.highlight} onClick={() => editor.chain().focus().toggleHighlight().run()} />
      <div className="review-toolbar-group review-history">
        <IconButton icon={Undo2} label="撤销" size="small" variant="ghost" disabled={!state.undo} onClick={() => editor.chain().focus().undo().run()} />
        <IconButton icon={Redo2} label="重做" size="small" variant="ghost" disabled={!state.redo} onClick={() => editor.chain().focus().redo().run()} />
      </div>
      {!compact && <IconButton icon={expanded ? Minimize2 : Maximize2} label={expanded ? '收起编辑区' : '展开编辑区'} size="small" variant="ghost" aria-pressed={expanded} onClick={() => setExpanded(current => !current)} />}
    </div>
    <EditorContent editor={editor} className="review-content" />
  </div>
}
