import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type FocusEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight, Inbox, Search, type LucideIcon } from 'lucide-react'
import { isClosed, normalizedStatus, scheduleShortLabel, workflowFor, type Application } from '../model'
import HomeFlight from './HomeFlight'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'selected'
  size?: 'small' | 'normal'
  icon?: LucideIcon
}

type TooltipPlacement = 'top' | 'right' | 'left'

export function Button({ variant = 'secondary', size = 'normal', icon: Icon, type = 'button', className = '', children, ...props }: ButtonProps) {
  return <button {...props} type={type} className={`ui-button ui-button--${variant} ui-button--${size} ${className}`}>{Icon && <Icon size={16} aria-hidden="true" />}{children}</button>
}

export function IconButton({ label, className = '', title, ...props }: Omit<ButtonProps, 'children'> & { label: string; icon: LucideIcon }) {
  return <Button {...props} aria-label={label} title={title || label} className={`ui-icon-button ${className}`} />
}

export function Tooltip({ content, children, className = '', contentClassName = '', label, tabIndex, placement = 'top' }: { content: ReactNode; children: ReactNode; className?: string; contentClassName?: string; label?: string; tabIndex?: number; placement?: TooltipPlacement | 'auto' }) {
  const [open, setOpen] = useState(false)
  const [resolvedPlacement, setResolvedPlacement] = useState<TooltipPlacement>(placement === 'auto' ? 'right' : placement)
  const id = useId()
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggerHovered = useRef(false)
  const contentHovered = useRef(false)
  const resolvePlacement = () => {
    if (placement !== 'auto') return
    const bounds = tooltipRef.current?.getBoundingClientRect()
    if (!bounds || typeof window === 'undefined') return
    setResolvedPlacement(window.innerWidth - bounds.right >= bounds.left ? 'right' : 'left')
  }
  const openTooltip = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
    resolvePlacement()
    setOpen(true)
  }
  const closeTooltip = () => {
    if (triggerHovered.current || contentHovered.current) return
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => { closeTimer.current = null; setOpen(false) }, 180)
  }
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])
  useEffect(() => {
    if (!open || placement !== 'auto') return
    const handleResize = () => resolvePlacement()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [open, placement])
  const handleTriggerEnter = () => {
    triggerHovered.current = true
    openTooltip()
  }
  const handleTriggerLeave = () => {
    triggerHovered.current = false
    closeTooltip()
  }
  const handleContentEnter = () => {
    contentHovered.current = true
    openTooltip()
  }
  const handleContentLeave = () => {
    contentHovered.current = false
    closeTooltip()
  }
  const handleBlur = (event: FocusEvent<HTMLSpanElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeTooltip()
  }
  return <span ref={tooltipRef} className={`ui-tooltip ui-tooltip-placement-${resolvedPlacement} ${open ? 'is-open' : ''} ${className}`} tabIndex={tabIndex} aria-label={label} onFocus={openTooltip} onBlur={handleBlur}>
    <span className="ui-tooltip-trigger" aria-describedby={open ? id : undefined} onMouseEnter={handleTriggerEnter} onMouseLeave={handleTriggerLeave}>
      {children}
      <span id={id} className={`ui-tooltip-content ${contentClassName}`} role="tooltip" aria-hidden={!open} onMouseEnter={handleContentEnter} onMouseLeave={handleContentLeave}>{content}</span>
    </span>
  </span>
}

export function SearchField({ label, className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }) {
  return <label className={`ui-search ${className}`}><Search size={17} aria-hidden="true" /><input {...props} type="search" aria-label={label} /></label>
}

export function SelectField({ label, value, options, onChange, className = '' }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; className?: string }) {
  const [open, setOpen] = useState(false)
  const selected = options.find(option => option.value === value) || options[0]
  return <div className={`ui-select ${open ? 'is-open' : ''} ${className}`}>
    <button type="button" className="ui-select-trigger" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen(current => !current)}>{selected.label}<span aria-hidden="true">⌄</span></button>
    {open && <div className="ui-select-menu" role="listbox" aria-label={label}>{options.map(option => <button type="button" role="option" aria-selected={option.value === value} key={option.value} onClick={() => { onChange(option.value); setOpen(false) }}>{option.label}</button>)}</div>}
  </div>
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
    <span>共 <b>{total}</b> 条</span>
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
  const index = stages.findIndex(stage => stage.id === app.currentStageId || stage.label === normalizedStatus(app))
  return <div className={`progress-rail ${compact ? 'compact' : ''}`} style={{ gridTemplateColumns: `repeat(${stages.length + 1}, minmax(0, 1fr))` }}>{[...stages, { label: 'Offer', date: '', status: app.status === 'Offer' ? 'Offer' : '未开始' }].map((field, i) => {
    const completed = field.status === '已完成' || field.status === 'Offer'
    const current = i < stages.length && index === i && !isClosed(app)
    return <div className={`progress-step ${completed ? 'done' : ''} ${current ? 'current' : ''}`} key={`${field.label}-${i}`} title={`${field.label}：${field.status || (current ? '当前阶段' : completed ? '已完成' : '未记录')}`}>
      <span className="step-dot">{completed ? <Check size={11} strokeWidth={3} /> : null}</span>
      {!compact && <><strong>{field.label}</strong><small>{i < stages.length ? scheduleShortLabel(stages[i]) : '—'}</small></>}
    </div>
  })}</div>
}
