export type Note = {
  id: string
  title: string
  category: string
  body: string
  tags: string[]
  applicationIds: string[]
  createdAt: string
  updatedAt: string
}

export const noteCategories = ['面试知识', '项目话术', '自我介绍', '面试复盘', '公司调研']
export const notesStorageKey = 'autumn-sprint.notes.v1'

function isNote(value: unknown): value is Note {
  if (!value || typeof value !== 'object') return false
  const note = value as Record<string, unknown>
  return ['id', 'title', 'category', 'body', 'createdAt', 'updatedAt'].every(key => typeof note[key] === 'string')
    && Array.isArray(note.tags) && note.tags.every(tag => typeof tag === 'string')
    && Array.isArray(note.applicationIds) && note.applicationIds.every(id => typeof id === 'string')
    && Number.isFinite(Date.parse(note.createdAt as string)) && Number.isFinite(Date.parse(note.updatedAt as string))
}

export function readNotes(): Note[] {
  const raw = localStorage.getItem(notesStorageKey)
  if (raw === null) return []
  const value: unknown = JSON.parse(raw)
  if (!Array.isArray(value) || !value.every(isNote)) throw new Error('笔记数据格式异常，原始数据未被修改。')
  return value
}

export function newNote(category = '面试知识'): Note {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), title: '', category, body: '', tags: [], applicationIds: [], createdAt: now, updatedAt: now }
}

export function noteDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replaceAll('/', '-')
}
