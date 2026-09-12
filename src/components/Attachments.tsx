import { useEffect, useRef, useState } from 'react'
import { FileText, Trash2, Upload } from 'lucide-react'
import { apiBase, post, request } from '../api'
import type { Application, Attachment } from '../model'
import { Button } from './Shared'

export default function Attachments({ app }: { app: Application }) {
  const [files, setFiles] = useState(app.attachments || [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!app.updatedAt) return
    request<Application>(`/api/applications/${app.id}`).then(value => setFiles(value.attachments || [])).catch(error => setError(error.message))
  }, [app.id, app.updatedAt])
  async function upload(file: File) {
    if (file.size === 0 || file.size > 10 * 1024 * 1024) { setError('请选择非空且不超过 10 MB 的文件'); return }
    setBusy(true); setError('')
    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.onerror = () => reject(new Error('文件读取失败'))
        reader.readAsDataURL(file)
      })
      const saved = await post<Attachment>(`/api/applications/${app.id}/attachments`, { name: file.name, content })
      setFiles(current => [...current.filter(item => item.id !== saved.id), saved])
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  async function remove(file: Attachment) {
    if (!window.confirm(`移除附件“${file.name}”？数据库保留原文件，岗位与流程历史不受影响。`)) return
    setBusy(true); setError('')
    try { await request(`/api/attachments/${file.id}`, { method: 'DELETE' }); setFiles(current => current.filter(item => item.id !== file.id)) }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="job-materials-tab">
    <div className="job-section-title"><h3>资料附件</h3><Button icon={Upload} disabled={busy || !app.updatedAt} onClick={() => input.current?.click()}>{busy ? '处理中…' : '上传资料'}</Button><input type="file" ref={input} hidden onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file) }} /></div>
    {!app.updatedAt && <p>请先保存岗位，再上传附件。</p>}
    {error && <p role="alert" className="resources-error">{error}</p>}
    {files.map(file => <div className="attachment-entry" key={file.id}>{file.mime.startsWith('image/') ? <a href={`${apiBase}${file.url}`} target="_blank" rel="noreferrer"><img src={`${apiBase}${file.url}`} alt={file.name} /></a> : <FileText size={25} />}<div><a href={`${apiBase}${file.url}`} target="_blank" rel="noreferrer">{file.name}</a><small>{Math.ceil(file.bytes / 1024)} KB</small></div><Button icon={Trash2} size="small" disabled={busy} onClick={() => remove(file)}>移除</Button></div>)}
    {!files.length && <p className="job-muted-empty">暂无附件</p>}
  </section>
}
