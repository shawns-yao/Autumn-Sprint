import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight, Inbox, Search, type LucideIcon } from 'lucide-react'
import { isClosed, workflowFor, type Application } from '../model'
import HomeFlight from './HomeFlight'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'selected'
  size?: 'small' | 'normal'
  icon?: LucideIcon
}

export function Button({ variant = 'secondary', size = 'normal', icon: Icon, type = 'button', className = '', children, ...props }: ButtonProps) {
  return <button {...props} type={type} className={`ui-button ui-button--${variant} ui-button--${size} ${className}`}>{Icon && <Icon size={16} aria-hidden="true" />}{children}</button>
}

export function IconButton({ label, className = '', title, ...props }: Omit<ButtonProps, 'children'> & { label: string; icon: LucideIcon }) {
  return <Button {...props} aria-label={label} title={title || label} className={`ui-icon-button ${className}`} />
}

export function SearchField({ label, className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }) {
  return <label className={`ui-search ${className}`}><Search size={17} aria-hidden="true" /><input {...props} type="search" aria-label={label} /></label>
}

export function Heading({ title, meta, eyebrow, action, className = '' }: { title: string; meta?: string; eyebrow?: string; action?: ReactNode; className?: string }) {
  return <header className={`ui-page-heading ${className}`}><div className="ui-page-heading-copy">{eyebrow && <p className="ui-page-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{meta && <p>{meta}</p>}</div><div className="page-heading-flight"><HomeFlight variant="header" /></div>{action && <div className="ui-page-actions">{action}</div>}</header>
}
export function CompanyMark({ name }: { name: string }) {
  const color = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5
  return <span className={`company-mark tone-${color}`} aria-hidden="true">{name.slice(0, 2) || '新'}</span>
}
export function Badge({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: string; className?: string }) {
  return <span className={`badge badge-${tone} ui-badge ${className}`}>{children}</span>
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state"><Inbox size={28} strokeWidth={1.4} /><p>{children}</p></div>
}
export function Pagination({ page, total, size, onPage, onSize }: { page: number; total: number; size: number; onPage: (page: number) => void; onSize?: (size: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size))
  const items = [...new Set([1, ...Array.from({ length: 5 }, (_, i) => page - 2 + i).filter(n => n > 0 && n <= pages), pages])].sort((a, b) => a - b)
  return <nav className="pagination" aria-label="列表分页">
    <span>共 <b>{total}</b> 条{total > 0 && ` · ${((page - 1) * size) + 1}–${Math.min(page * size, total)}`}</span>
    <div className="pagination-actions">
      {onSize && <select aria-label="每页条数" value={size} onChange={e => onSize(Number(e.target.value))}>{[5, 9, 20, 50].map(n => <option key={n} value={n}>{n} 条 / 页</option>)}</select>}
      <IconButton label="上一页" icon={ChevronLeft} size="small" disabled={page <= 1} onClick={() => onPage(page - 1)} />
      {items.map((n, i) => <span className="page-slot" key={n}>{i > 0 && n - items[i - 1] > 1 && <span>…</span>}<Button size="small" variant={n === page ? 'selected' : 'secondary'} aria-label={`第 ${n} 页`} aria-current={n === page ? 'page' : undefined} className="page-number" onClick={() => onPage(n)}>{n}</Button></span>)}
      <IconButton label="下一页" icon={ChevronRight} size="small" disabled={page >= pages} onClick={() => onPage(page + 1)} />
    </div>
  </nav>
}
export function ProgressRail({ app, compact = false }: { app: Application; compact?: boolean }) {
  const stages = workflowFor(app)
  const index = stages.findIndex(stage => stage.id === app.currentStageId || stage.label === app.status)
  return <div className={`progress-rail ${compact ? 'compact' : ''}`} style={{ gridTemplateColumns: `repeat(${stages.length + 2}, minmax(0, 1fr))` }}>{[{ label: '投递', date: app.applied, status: '已完成' as string }, ...stages, { label: 'Offer', date: '', status: app.status === 'Offer' ? '已获 Offer' : '未开始' }].map((field, i) => {
    const completed = field.status === '已完成' || field.status === '已获 Offer'
    const current = i > 0 && i <= stages.length && index === i - 1 && !isClosed(app)
    return <div className={`progress-step ${completed ? 'done' : ''} ${current ? 'current' : ''}`} key={`${field.label}-${i}`} title={`${field.label}：${field.status || (current ? '当前阶段' : completed ? '已完成' : '未记录')}`}>
      <span className="step-dot">{completed ? <Check size={11} strokeWidth={3} /> : null}</span>
      {!compact && <><strong>{field.label}</strong><small>{field.date?.slice(5) || '—'}</small></>}
    </div>
  })}</div>
}
