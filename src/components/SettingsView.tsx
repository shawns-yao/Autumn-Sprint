import { useEffect, useState } from 'react'
import { Download, RefreshCw, Save } from 'lucide-react'
import { post, request } from '../api'
import { Button, Heading } from './Shared'

type Settings = { staleEnabled: boolean; staleDays: number; interviewEnabled: boolean; interviewHours: number; examEnabled: boolean; examHours: number }
export default function SettingsView({ onSaved }: { onSaved: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [health, setHealth] = useState('未检测')
  async function load() {
    setError('')
    try { setSettings(await request<Settings>('/api/settings')) }
    catch (error) { setError((error as Error).message) }
  }
  useEffect(() => { void load() }, [])
  async function check() {
    setBusy(true); setHealth('检测中'); setError('')
    try { const result = await request<{ ok: boolean }>('/api/health'); setHealth(result.ok ? '后端与数据库连接正常' : '服务异常') }
    catch (error) { setHealth('连接失败'); setError((error as Error).message) }
    finally { setBusy(false) }
  }
  async function save() {
    setBusy(true); setError(''); setMessage('')
    try { setSettings(await post<Settings>('/api/settings', settings)); setMessage('已保存，站内提醒已更新'); onSaved() }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  async function exportData() {
    setBusy(true); setError('')
    try {
      const data = await request('/api/export')
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url; link.download = `秋招记录-${new Date().toISOString().slice(0, 10)}.json`; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage('已导出岗位、笔记、资源和设置；附件原文件请在岗位详情中下载')
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="content real-settings"><Heading title="设置" />
    {error && <p role="alert" className="resources-error">{error}<Button size="small" onClick={load} disabled={busy}>重新加载</Button></p>}
    <section><h2>服务状态</h2><div className="settings-service"><span role="status">{health}</span><Button icon={RefreshCw} disabled={busy} onClick={check}>检测连接</Button></div></section>
    <section><h2>站内提醒</h2>{settings ? <fieldset disabled={busy}>
      <label className="real-setting-row"><input type="checkbox" checked={settings.staleEnabled} onChange={event => setSettings({ ...settings, staleEnabled: event.target.checked })} /><span>岗位长期未更新</span><input aria-label="未更新天数" type="number" min={1} max={365} value={settings.staleDays} onChange={event => setSettings({ ...settings, staleDays: Number(event.target.value) })} /><span>天</span></label>
      <label className="real-setting-row"><input type="checkbox" checked={settings.interviewEnabled} onChange={event => setSettings({ ...settings, interviewEnabled: event.target.checked })} /><span>面试提前提醒</span><input aria-label="面试提前小时" type="number" min={1} max={168} value={settings.interviewHours} onChange={event => setSettings({ ...settings, interviewHours: Number(event.target.value) })} /><span>小时</span></label>
      <label className="real-setting-row"><input type="checkbox" checked={settings.examEnabled} onChange={event => setSettings({ ...settings, examEnabled: event.target.checked })} /><span>测评 / 笔试提前提醒</span><input aria-label="考试提前小时" type="number" min={1} max={168} value={settings.examHours} onChange={event => setSettings({ ...settings, examHours: Number(event.target.value) })} /><span>小时</span></label>
      <Button icon={Save} variant="primary" onClick={save}>保存规则</Button>
    </fieldset> : <p>提醒规则尚未加载</p>}</section>
    <section><h2>导出数据</h2><Button icon={Download} disabled={busy} onClick={exportData}>导出记录 JSON</Button></section>
    <p role="status">{message}</p>
  </section>
}
