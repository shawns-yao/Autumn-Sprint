import { Check, X } from 'lucide-react'
import { getStage, isClosed, lifecycle, normalizedStatus, stageFields, type Application } from '../model'
import { Badge } from './Shared'

export function ApplicationState({ app }: { app: Application }) {
  const label = lifecycle(app)
  const tone = label === '已终止' ? 'muted' : label === '已结束' ? 'red' : label === 'Offer' ? 'green' : 'blue'
  return <Badge tone={tone === 'muted' ? 'gray' : tone} className="job-state">{label}</Badge>
}

export function ApplicationProgress({ app, compact = false }: { app: Application; compact?: boolean }) {
  const status = normalizedStatus(app)
  const fields = stageFields.filter(([key, label]) => !compact || !['AI 面试', '三面'].includes(label) || getStage(app, key).status !== '未开始' || status === label)
  const steps = [
    { label: '已投递', date: app.applied, state: app.applied ? '已完成' : '未开始' },
    ...fields.map(([key, label]) => ({ label, date: getStage(app, key).date, state: getStage(app, key).status })),
    { label: 'Offer', date: '', state: status === 'Offer' ? '已完成' : '未开始' },
  ]
  return <ol className={`job-progress ${compact ? 'compact' : ''}`} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="招聘流程进度">
    {steps.map(step => {
      const failed = step.state === '未通过'
      const complete = step.state === '已完成'
      const current = step.label === status && !isClosed(app) && !complete
      return <li key={step.label} className={`${complete ? 'complete' : ''} ${current ? 'current' : ''} ${failed ? 'failed' : ''}`} title={`${step.label}：${current ? '当前阶段' : step.state}${step.date ? ` · ${step.date}` : ''}`}>
        <span className="job-step-dot">{failed ? <X size={10} /> : complete ? <Check size={11} /> : current ? <i /> : null}</span>
        <span className="job-step-label">{step.label === '已投递' ? '投递' : step.label}</span><time>{step.date ? step.date.slice(5) : '—'}</time>
      </li>
    })}
  </ol>
}
