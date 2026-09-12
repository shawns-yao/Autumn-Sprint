export const apiBase = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBase}${path}`, { ...options, signal: options.signal || AbortSignal.timeout(15000), headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } })
  } catch { throw new Error('无法连接后端，请检查服务后重试。未保存的内容仍保留在编辑器中。') }
  const result = await response.json().catch(() => ({ error: '服务返回了无法读取的数据' }))
  if (!response.ok) throw new Error(result.error || '请求失败，请重试')
  return result as T
}
export const post = <T>(path: string, value: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(value) })
