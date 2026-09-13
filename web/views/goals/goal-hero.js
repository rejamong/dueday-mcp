import { escapeHtml, createElement } from '../../utils.js'
import { annualGoalsForYear, heroSummaryLine } from '../../goals-format.js'

function titleBlockHtml(life) {
  if (life) return `<h1 class="goal-hero-title">${escapeHtml(life.title)}</h1>`
  return `<button type="button" class="goal-hero-empty">+ 인생 목표를 정하세요</button>`
}

/** Life-goal hero card: eyebrow, life goal title (or a prompt to set one), and the year summary. */
export function render(state, actions) {
  const { goals, today } = state
  const life = goals.find((g) => g.kind === 'life') ?? null
  const summary = heroSummaryLine(annualGoalsForYear(goals, today), today)

  const el = createElement(`
    <div class="goal-hero">
      <span class="goal-hero-eyebrow">LIFE GOAL</span>
      ${titleBlockHtml(life)}
      ${summary ? `<p class="goal-hero-summary">${escapeHtml(summary)}</p>` : ''}
      <button type="button" class="btn btn-ghost goal-hero-add">+ 목표 추가</button>
    </div>
  `)

  const emptyBtn = el.querySelector('.goal-hero-empty')
  if (emptyBtn) emptyBtn.addEventListener('click', () => actions.openAddGoalForm('life'))
  el.querySelector('.goal-hero-add').addEventListener('click', () => actions.openAddGoalForm())

  return el
}
