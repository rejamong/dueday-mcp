import { escapeHtml, createElement } from '../../utils.js'
import { formatMetricValue } from '../../goals-format.js'

/**
 * One metric row: name + formatted value, and a progress bar with an optional
 * ink time-marker at the goal's overall `timePercent` (shared across all of a goal's metrics).
 */
export function renderMetricBlock(metric, timePercent) {
  const fillPercent = Math.max(0, Math.min(100, metric.percent))
  const marker = timePercent === null ? '' : `<div class="goal-metric-time-marker" style="left:${timePercent}%"></div>`

  return createElement(`
    <div class="goal-metric">
      <div class="goal-metric-row">
        <span class="goal-metric-name">${escapeHtml(metric.name)}</span>
        <span class="goal-metric-value">${escapeHtml(formatMetricValue(metric))}</span>
      </div>
      <div class="goal-metric-bar">
        <div class="goal-metric-fill" style="width:${fillPercent}%"></div>
        ${marker}
      </div>
    </div>
  `)
}
