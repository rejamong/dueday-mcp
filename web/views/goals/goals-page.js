import { annualGoalsForYear, longTermGoals, shortTermGoals } from '../../goals-format.js'
import { render as renderHero } from './goal-hero.js'
import { render as renderAddForm } from './goal-add-form.js'
import { render as renderSuggestions } from './goal-suggestions.js'
import { renderAnnualSection, renderLongSection, renderShortSection } from './goals-section.js'
import { render as renderDailyLine } from './daily-line.js'

/** Top-level 목표 (goals) page: life-goal hero, AI 제안, annual/short/long-term sections, and the 일상 summary line. */
export function render(state, actions) {
  const wrap = document.createElement('div')
  wrap.className = 'goals-page'

  wrap.appendChild(renderHero(state, actions))
  if (state.addGoalFormOpen) wrap.appendChild(renderAddForm(state, actions))
  if (state.suggestions.length > 0) wrap.appendChild(renderSuggestions(state, actions))
  wrap.appendChild(renderAnnualSection(annualGoalsForYear(state.goals, state.today), state, actions))
  wrap.appendChild(renderShortSection(shortTermGoals(state.goals), state, actions))
  wrap.appendChild(renderLongSection(longTermGoals(state.goals), state, actions))
  wrap.appendChild(renderDailyLine(state, actions))

  return wrap
}
