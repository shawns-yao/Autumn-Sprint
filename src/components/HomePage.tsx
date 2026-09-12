import { ArrowRight, BookOpen, BriefcaseBusiness, FolderOpen, Sprout } from 'lucide-react'
import { Button } from './Shared'
import type { View } from '../model'

const entries = [
  { view: 'applications' as const, title: '岗位', subtitle: '心仪岗位，每一步进展都有记录', icon: BriefcaseBusiness, color: 'green', items: ['投递记录', '面试进展', '岗位详情'] },
  { view: 'notes' as const, title: '求职笔记', subtitle: '积累与复盘，成为下一次的底气', icon: BookOpen, color: 'blue', items: ['面试经验', '笔试复盘', '学习总结'] },
  { view: 'documents' as const, title: '投递资源', subtitle: '招聘官网、投递文档与实用链接', icon: FolderOpen, color: 'amber', items: ['校招信息', '招聘官网', '自定义收藏'] },
]

export default function HomePage({ onView }: { onView: (view: View) => void }) {
  return <div className="welcome-page">
    <section className="welcome-hero" aria-labelledby="welcome-title">
      <span className="welcome-kicker"><Sprout size={20} />为你的秋招而生</span>
      <h1 id="welcome-title">秋招速递</h1>
      <p className="welcome-promise">这一轮，<strong>向理想的 Offer 出发</strong></p>
      <p className="welcome-description">整理心仪岗位，记下每一次成长。<br />一步步走好秋招的每一程。</p>
      <div className="welcome-actions">
        <Button variant="primary" onClick={() => onView('overview')}>立即开始<ArrowRight size={20} /></Button>
        <Button onClick={() => onView('applications')}>查看岗位<ArrowRight size={18} /></Button>
      </div>
    </section>
    <section className="welcome-entries" aria-label="秋招工作空间">
      {entries.map(({ view, title, subtitle, icon: Icon, color, items }) => <button className={`welcome-entry entry-${color}`} key={view} onClick={() => onView(view)}>
        <span className="entry-heading"><span className="entry-icon"><Icon size={28} strokeWidth={1.8} /></span><span><strong>{title}</strong><small>{subtitle}</small></span></span>
        <span className="entry-topics">{items.map((item, index) => <span key={item}><span>0{index + 1}</span>{item}<ArrowRight size={15} /></span>)}</span>
        <span className="entry-open">进入{title}<ArrowRight size={17} /></span>
      </button>)}
    </section>
  </div>
}
