import { createElement } from '../../utils.js'
import { statusCountsLine, yearOf } from '../../goals-format.js'
import { render as renderGoalCard } from './goal-card.js'

function gridOf(goals, state, actions) {
  const grid = createElement('<div class="goals-grid"></div>')
  for (const goal of goals) grid.appendChild(renderGoalCard(goal, state, actions))
  return grid
}

/** `2026년 목표` section: heading + status-distribution counts + a 2-column grid of annual goal cards. */
export function renderAnnualSection(annualGoals, state, actions) {
  const year = yearOf(state.today)
  const section = createElement(`
    <section class="goals-section">
      <div class="goals-section-header">
        <h2 class="goals-section-heading">${year ? `${year}년 목표` : '올해 목표'}</h2>
        <span class="goals-section-count">${statusCountsLine(annualGoals)}</span>
      </div>
    </section>
  `)
  if (annualGoals.length === 0) {
    section.appendChild(createElement('<div class="goals-section-empty">아직 연간 목표가 없음</div>'))
  } else {
    section.appendChild(gridOf(annualGoals, state, actions))
  }
  return section
}

function renderKindSection(heading, emptyText, goals, state, actions) {
  const section = createElement(`
    <section class="goals-section">
      <div class="goals-section-header">
        <h2 class="goals-section-heading">${heading}</h2>
      </div>
    </section>
  `)
  if (goals.length === 0) {
    section.appendChild(createElement(`<div class="goal-card-empty-dashed">${emptyText}</div>`))
  } else {
    section.appendChild(gridOf(goals, state, actions))
  }
  return section
}

/** `단기 목표` section: goals with an explicit end date a few weeks or months out. */
export function renderShortSection(shortGoals, state, actions) {
  return renderKindSection('단기 목표', '아직 단기 목표가 없음 — "+ 목표 추가"에서 종류를 단기로', shortGoals, state, actions)
}

/** `장기 목표` section, with a dashed empty-state card when there are none yet. */
export function renderLongSection(longGoals, state, actions) {
  return renderKindSection('장기 목표', '아직 장기 목표가 없음 — "+ 목표 추가"에서 종류를 장기로', longGoals, state, actions)
}
