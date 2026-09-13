import { createElement } from '../../utils.js'
import { statusCountsLine, yearOf } from '../../goals-format.js'
import { render as renderGoalCard } from './goal-card.js'

function gridOf(goals, state, actions) {
  const grid = createElement('<div class="goals-grid"></div>')
  for (const goal of goals) grid.appendChild(renderGoalCard(goal, state, actions))
  return grid
}

const KIND_LABEL = { annual: '연간', short: '단기', long: '장기' }

/**
 * One section per goal kind: heading, optional count line, a "+ 추가" button that opens the add form
 * preset to this kind, and either the card grid or a clickable empty state that does the same.
 */
function renderKindSection({ kind, heading, countLine }, goals, state, actions) {
  const section = createElement(`
    <section class="goals-section" data-kind="${kind}">
      <div class="goals-section-header">
        <h2 class="goals-section-heading">${heading}</h2>
        ${countLine ? `<span class="goals-section-count">${countLine}</span>` : ''}
        <button type="button" class="btn btn-ghost goals-section-add" aria-label="${KIND_LABEL[kind]} 목표 추가">+ 추가</button>
      </div>
    </section>
  `)
  section.querySelector('.goals-section-add').addEventListener('click', () => actions.openAddGoalForm(kind))
  if (goals.length === 0) {
    const empty = createElement(
      `<button type="button" class="goal-card-empty-dashed goals-section-empty-add">아직 ${KIND_LABEL[kind]} 목표가 없음 — 눌러서 추가</button>`,
    )
    empty.addEventListener('click', () => actions.openAddGoalForm(kind))
    section.appendChild(empty)
  } else {
    section.appendChild(gridOf(goals, state, actions))
  }
  return section
}

/** `2026년 목표` section: heading + status-distribution counts + a 2-column grid of annual goal cards. */
export function renderAnnualSection(annualGoals, state, actions) {
  const year = yearOf(state.today)
  const heading = year ? `${year}년 목표` : '올해 목표'
  return renderKindSection({ kind: 'annual', heading, countLine: statusCountsLine(annualGoals) }, annualGoals, state, actions)
}

/** `단기 목표` section: goals with an explicit end date a few weeks or months out. */
export function renderShortSection(shortGoals, state, actions) {
  return renderKindSection({ kind: 'short', heading: '단기 목표', countLine: null }, shortGoals, state, actions)
}

/** `장기 목표` section, with a clickable empty-state card when there are none yet. */
export function renderLongSection(longGoals, state, actions) {
  return renderKindSection({ kind: 'long', heading: '장기 목표', countLine: null }, longGoals, state, actions)
}
