import { useEffect, useState } from 'react'
import { BellRing, Bot, DatabaseBackup, Download, Eye, EyeOff, ListRestart, PlugZap, Save } from 'lucide-react'
import { post, request } from '../api'
import { Button, Heading, IconButton } from './Shared'

type Settings = { staleEnabled: boolean; staleDays: number; interviewEnabled: boolean; interviewHours: number; examEnabled: boolean; examHours: number }
type AiSettings = { providerName: string; note: string; website: string; baseUrl: string; model: string; protocol: 'responses' | 'chat_completions'; hasApiKey: boolean; apiKeySource?: 'environment' | 'stored' | 'none' }
type AiTestResult = { ok: boolean; providerName: string; model: string; protocol: AiSettings['protocol']; latencyMs: number }

export default function SettingsView({ onSaved }: { onSaved: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [ai, setAi] = useState<AiSettings | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [aiAction, setAiAction] = useState('')
  const [aiStatus, setAiStatus] = useState('')
  const environmentKey = ai?.apiKeySource === 'environment'

  async function load() {
    setError('')
    const [reminderResult, aiResult] = await Promise.allSettled([
      request<Settings>('/api/settings'),
      request<AiSettings>('/api/ai/settings'),
    ])
    if (reminderResult.status === 'fulfilled') setSettings(reminderResult.value)
    if (aiResult.status === 'fulfilled') {
      setAi(aiResult.value)
      if (aiResult.value.apiKeySource === 'environment') { setApiKey(''); setShowApiKey(false) }
    }
    const failures = [reminderResult, aiResult].filter(result => result.status === 'rejected') as PromiseRejectedResult[]
    if (failures.length) setError(failures.map(result => result.reason instanceof Error ? result.reason.message : '设置加载失败').join('；'))
  }
  useEffect(() => { void load() }, [])

  async function saveReminders() {
    if (!settings) return
    setBusy(true); setError(''); setMessage('')
    try { setSettings(await post<Settings>('/api/settings', settings)); setMessage('提醒规则已保存'); onSaved() }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  async function runAiAction(action: 'save' | 'test' | 'models') {
    if (!ai || aiAction) return
    setAiAction(action); setError(''); setAiStatus('')
    const payload = { ...ai, apiKey: environmentKey ? '' : apiKey }
    try {
      if (action === 'save') {
        const saved = await post<AiSettings>('/api/ai/settings', payload)
        setAi(saved); setApiKey(''); setAiStatus('AI 配置已保存，API Key 不会回传到页面')
      } else if (action === 'test') {
        const result = await request<AiTestResult>('/api/ai/test', { method: 'POST', body: JSON.stringify(payload), signal: AbortSignal.timeout(25000) })
        setAiStatus(`连接成功 · ${result.model} · ${result.latencyMs} ms`)
      } else {
        const result = await request<{ models: string[] }>('/api/ai/models', { method: 'POST', body: JSON.stringify(payload), signal: AbortSignal.timeout(25000) })
        setModels(result.models); setAiStatus(result.models.length ? `已获取 ${result.models.length} 个模型` : '服务连接正常，但没有返回可用模型')
      }
    } catch (error) { setError((error as Error).message) }
    finally { setAiAction('') }
  }
  async function exportData() {
    setBusy(true); setError('')
    try {
      const data = await request('/api/export')
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url; link.download = `秋招记录-${new Date().toISOString().slice(0, 10)}.json`; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage('已导出岗位、笔记、资源和提醒设置；附件原文件请在岗位详情中下载')
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }

  return <section className="content real-settings settings-page"><Heading title="设置" meta="管理 AI 服务、站内提醒和数据导出。" />
    {error && <p role="alert" className="resources-error">{error}<Button size="small" onClick={load} disabled={busy || Boolean(aiAction)}>重新加载</Button></p>}
    <section className="settings-card settings-ai-card">
      <header className="settings-ai-heading"><div className="settings-card-heading"><span className="settings-card-icon ai"><Bot size={21} /></span><div><h2>AI 服务</h2><p>连接一个支持 OpenAI 接口格式的模型服务</p></div></div><span className="ai-compatible-badge">OpenAI 兼容</span></header>
      {ai ? <form className="ai-settings-form" onSubmit={event => { event.preventDefault(); void runAiAction('save') }}>
        <div className="ai-settings-grid" inert={Boolean(aiAction)}>
          <label className="ai-field-wide">供应商名称<input required maxLength={100} value={ai.providerName} onChange={event => setAi({ ...ai, providerName: event.target.value })} placeholder="例如 OpenAI、硅基流动或本地服务" /></label>
          <label className="ai-field-wide">API Key<div className="ai-secret-field"><input type={showApiKey ? 'text' : 'password'} autoComplete="new-password" value={apiKey} disabled={environmentKey} onChange={event => setApiKey(event.target.value)} placeholder={environmentKey ? '由服务器环境变量提供' : ai.hasApiKey ? '已保存密钥，留空会继续使用原密钥' : '输入 API Key；不需要鉴权的本地服务可留空'} />{!environmentKey && <IconButton icon={showApiKey ? EyeOff : Eye} label={showApiKey ? '隐藏 API Key' : '显示 API Key'} variant="ghost" onClick={() => setShowApiKey(value => !value)} />}</div><small>{environmentKey ? '密钥来源：服务器环境变量' : ai.hasApiKey ? '后端已保存密钥，页面不会读取原文' : 'API Key 只发送到本地后端保存和调用'}</small></label>
          <label className="ai-field-wide">API 基础地址<input required type="url" value={ai.baseUrl} onChange={event => setAi({ ...ai, baseUrl: event.target.value })} placeholder="例如 https://api.openai.com/v1" /><small>填写服务的 OpenAI 兼容基础地址，调用时会自动补充接口路径</small></label>
          <label className="ai-field-wide">默认模型<div className="ai-model-field"><input required list="ai-model-options" value={ai.model} onChange={event => setAi({ ...ai, model: event.target.value })} placeholder="例如 gpt-5 或服务商提供的模型名称" /><Button icon={ListRestart} disabled={Boolean(aiAction) || !ai.baseUrl} onClick={() => void runAiAction('models')}>{aiAction === 'models' ? '获取中…' : '获取模型'}</Button></div><datalist id="ai-model-options">{models.map(model => <option key={model} value={model} />)}</datalist></label>
          <label className="ai-field-wide">接口格式<select value={ai.protocol} onChange={event => setAi({ ...ai, protocol: event.target.value as AiSettings['protocol'] })}><option value="responses">Responses API</option><option value="chat_completions">Chat Completions</option></select><small>根据服务商支持的 OpenAI 接口格式选择；测试连接会发送一次最小请求</small></label>
        </div>
        <footer className="ai-settings-actions"><span className={aiStatus.startsWith('连接成功') || aiStatus.startsWith('已获取') || aiStatus.startsWith('AI 配置') ? 'success' : ''} role="status">{aiStatus || (environmentKey ? '已配置环境变量密钥' : ai.hasApiKey ? '已保存 API Key' : '尚未保存 API Key')}</span><Button icon={PlugZap} disabled={Boolean(aiAction)} onClick={() => void runAiAction('test')}>{aiAction === 'test' ? '测试中…' : '测试连接'}</Button><Button icon={Save} type="submit" variant="primary" disabled={Boolean(aiAction)}>{aiAction === 'save' ? '保存中…' : '保存配置'}</Button></footer>
      </form> : <p>AI 配置尚未加载</p>}
    </section>
    <section className="settings-card"><header className="settings-card-heading"><span className="settings-card-icon reminder"><BellRing size={20} /></span><div><h2>站内提醒</h2><p>按你的求职节奏设置待办提醒</p></div></header>{settings ? <fieldset disabled={busy}>
      <label className="real-setting-row"><input type="checkbox" checked={settings.staleEnabled} onChange={event => setSettings({ ...settings, staleEnabled: event.target.checked })} /><span>岗位长期未更新</span><input aria-label="未更新天数" type="number" min={1} max={365} value={settings.staleDays} onChange={event => setSettings({ ...settings, staleDays: Number(event.target.value) })} /><span>天</span></label>
      <label className="real-setting-row"><input type="checkbox" checked={settings.interviewEnabled} onChange={event => setSettings({ ...settings, interviewEnabled: event.target.checked })} /><span>面试提前提醒</span><input aria-label="面试提前小时" type="number" min={1} max={168} value={settings.interviewHours} onChange={event => setSettings({ ...settings, interviewHours: Number(event.target.value) })} /><span>小时</span></label>
      <label className="real-setting-row"><input type="checkbox" checked={settings.examEnabled} onChange={event => setSettings({ ...settings, examEnabled: event.target.checked })} /><span>测评 / 笔试提前提醒</span><input aria-label="考试提前小时" type="number" min={1} max={168} value={settings.examHours} onChange={event => setSettings({ ...settings, examHours: Number(event.target.value) })} /><span>小时</span></label>
      <Button icon={Save} variant="primary" onClick={saveReminders}>保存规则</Button>
    </fieldset> : <p>提醒规则尚未加载</p>}</section>
    <section className="settings-card settings-export"><header className="settings-card-heading"><span className="settings-card-icon export"><DatabaseBackup size={20} /></span><div><h2>导出数据</h2><p>导出岗位、笔记、资源和提醒设置</p></div></header><Button icon={Download} disabled={busy} onClick={exportData}>导出记录 JSON</Button></section>
    <p role="status">{message}</p>
  </section>
}
