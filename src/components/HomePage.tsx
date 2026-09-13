import { ArrowRight, BookOpen, BriefcaseBusiness, FolderOpen, Sprout } from 'lucide-react'
import { Button } from './Shared'
import HomeFlight from './HomeFlight'
import type { View } from '../model'

const entries = [
  { view: 'applications' as const, title: '管理岗位', subtitle: '心仪岗位，每一步进展都有记录', icon: BriefcaseBusiness, color: 'green' },
  { view: 'notes' as const, title: '沉淀笔记', subtitle: '积累与复盘，成为下一次的底气', icon: BookOpen, color: 'blue' },
  { view: 'documents' as const, title: '整合资源', subtitle: '招聘官网、投递文档与实用链接', icon: FolderOpen, color: 'amber' },
]

export default function HomePage({ onView }: { onView: (view: View) => void }) {
  return <div className="welcome-page">
    <section className="welcome-hero" aria-labelledby="welcome-title">
      <img className="welcome-landscape" src="/images/home-landscape.webp" alt="" width="1800" height="360" draggable={false} />
      <HomeFlight />
      <div className="welcome-copy">
        <span className="welcome-kicker"><Sprout size={18} aria-hidden="true" />为你的秋招而生</span>
        <h1 id="welcome-title">秋招速递</h1>
        <p className="welcome-promise">这一轮，一定有 <strong>Offer。</strong></p>
        <p className="welcome-description">整理心仪岗位，记下每一次成长。<br />一步步走好秋招的每一程。</p>
        <div className="welcome-actions">
          <Button variant="primary" onClick={() => onView('overview')}>立即开始<ArrowRight size={20} aria-hidden="true" /></Button>
          <Button onClick={() => onView('applications')}>查看岗位<ArrowRight size={20} aria-hidden="true" /></Button>
        </div>
      </div>
    </section>
    <section className="welcome-entries" aria-label="秋招工作空间">
      {entries.map(({ view, title, subtitle, icon: Icon, color }) => <button className={`welcome-entry entry-${color}`} key={view} onClick={() => onView(view)}>
        <span className="entry-icon"><Icon size={25} strokeWidth={1.8} aria-hidden="true" /></span>
        <span className="entry-heading"><strong>{title}</strong><small>{subtitle}</small></span>
        <ArrowRight className="entry-arrow" size={18} aria-hidden="true" />
      </button>)}
    </section>
  </div>
}
