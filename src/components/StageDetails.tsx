import { FileText } from 'lucide-react'
import type { WorkflowStage } from '../model'
import ReviewEditor from './ReviewEditor'

export default function StageDetails({ stage }: { stage: WorkflowStage }) {
  return <section className="job-stage-details" aria-labelledby="job-stage-details-title">
    <h4 id="job-stage-details-title"><FileText size={16} aria-hidden="true" />阶段记录</h4>
    <ReviewEditor value={stage} readOnly label={`${stage.label}阶段记录`} />
  </section>
}
