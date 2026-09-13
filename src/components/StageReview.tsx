import { useId, useState } from 'react'
import { CalendarDays, ChartNoAxesCombined, FileText, Layers3, Plus, Tag, X } from 'lucide-react'
import { stageResultOptions, type Stage, type WorkflowStage } from '../model'
import { IconButton } from './Shared'
import ReviewEditor from './ReviewEditor'

type Props = { stage: WorkflowStage; stages: WorkflowStage[]; onSelect: (id: string) => void; onChange: (value: Partial<Stage>) => void }

export default function StageReview({ stage, stages, onSelect, onChange }: Props) {
  const tagInputId = useId()
  const [tag, setTag] = useState('')
  const tags = stage.review?.tags || []
  const addTag = () => {
    const next = tag.trim()
    if (!next || tags.length >= 20) return
    if (!tags.includes(next)) onChange({ review: { ...stage.review, tags: [...tags, next] } })
    setTag('')
  }
  return <>
    <div className="job-review-metadata">
      <label><span><Layers3 size={15} aria-hidden="true" />招聘阶段</span><select aria-label="复盘阶段" value={stage.id} onChange={event => onSelect(event.target.value)}>{stages.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
      <label><span><CalendarDays size={15} aria-hidden="true" />日期</span><input aria-label="复盘日期" type="date" value={stage.date} onChange={event => onChange({ date: event.target.value })} /></label>
      <label><span><ChartNoAxesCombined size={15} aria-hidden="true" />结果</span><select aria-label="复盘结果" value={stage.status} onChange={event => onChange({ status: event.target.value })}>{stageResultOptions.map(status => <option key={status} value={status}>{status === '未开始' ? '待填写' : status}</option>)}</select></label>
      <div className="review-tag-field"><label htmlFor={tagInputId}><Tag size={15} aria-hidden="true" />标签</label><div className="review-tag-input"><input id={tagInputId} maxLength={150} value={tag} disabled={tags.length >= 20} placeholder={tags.length >= 20 ? '已达 20 个标签' : '添加标签'} onChange={event => setTag(event.target.value)} onBlur={addTag} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); addTag() } }} /><IconButton icon={Plus} label="添加复盘标签" variant="ghost" size="small" disabled={!tag.trim() || tags.length >= 20} onClick={addTag} /></div></div>
      {tags.length > 0 && <div className="review-tags">{tags.map(value => <span key={value}>{value}<IconButton icon={X} label={`移除标签${value}`} variant="ghost" size="small" onClick={() => onChange({ review: { ...stage.review, tags: tags.filter(item => item !== value) } })} /></span>)}</div>}
    </div>
    <div className="review-record-heading"><FileText size={21} aria-hidden="true" /><h3>{stage.kind === 'interview' ? '面试问题记录' : '阶段复盘记录'}</h3></div>
    <ReviewEditor value={stage} onChange={onChange} />
  </>
}
