import { HttpError, requireValue } from './validation.mjs'

function endpoint(config, suffix) {
  const result = new URL(config.baseUrl)
  result.pathname = `${result.pathname.replace(/\/$/, '')}/${suffix}`
  result.search = ''
  result.hash = ''
  return result
}

async function readJson(response) {
  const chunks = []
  let total = 0
  for await (const chunk of response.body || []) {
    total += chunk.length
    if (total > 1024 * 1024) throw new HttpError(502, 'AI 服务返回内容过大')
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new HttpError(502, 'AI 服务返回了无法读取的数据') }
}

async function providerRequest(config, suffix, init = {}) {
  let response
  let data
  try {
    response = await fetch(endpoint(config, suffix), {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: {
        Accept: 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
    data = await readJson(response)
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(error?.name === 'TimeoutError' ? 504 : 502, error?.name === 'TimeoutError' ? 'AI 服务连接超时' : '无法连接 AI 服务，请检查地址与网络')
  }
  if (!response.ok) {
    const message = typeof data?.error?.message === 'string' ? data.error.message : typeof data?.message === 'string' ? data.message : `HTTP ${response.status}`
    const safeMessage = config.apiKey ? message.split(config.apiKey).join('[已隐藏密钥]') : message
    throw new HttpError(502, `AI 服务连接失败：${safeMessage.slice(0, 240)}`)
  }
  return data
}

export async function testAiProvider(config) {
  const startedAt = performance.now()
  const response = config.protocol === 'responses'
    ? await providerRequest(config, 'responses', { method: 'POST', body: JSON.stringify({ model: config.model, input: 'Reply with OK.', max_output_tokens: 32, store: false }) })
    : await providerRequest(config, 'chat/completions', { method: 'POST', body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 32, stream: false }) })
  requireValue(typeof response?.id === 'string' && !response.error && (config.protocol === 'responses' ? Array.isArray(response.output) && response.status !== 'failed' : Array.isArray(response.choices) && response.choices.length > 0), 'AI 服务没有返回有效的模型响应', 502)
  return { ok: true, providerName: config.providerName, model: typeof response.model === 'string' ? response.model : config.model, protocol: config.protocol, latencyMs: Math.max(1, Math.round(performance.now() - startedAt)) }
}

export async function listAiModels(config) {
  const response = await providerRequest(config, 'models', { method: 'GET' })
  requireValue(Array.isArray(response.data), 'AI 服务没有返回标准模型列表', 502)
  const models = [...new Set(response.data.map(item => typeof item?.id === 'string' ? item.id : '').filter(Boolean))].sort()
  return { models }
}
