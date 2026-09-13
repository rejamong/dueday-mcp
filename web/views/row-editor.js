import { escapeHtml, createElement, showToast } from '../utils.js'

function toDateOnly(value) {
  return value ? String(value).slice(0, 10) : ''
}

function parseTags(raw) {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

/** 목표 select options: 일상 + every non-life goal, defaulting to the todo's current goal. */
function goalSelectHtml(todo, goals) {
  const options = goals
    .filter((g) => g.kind !== 'life')
    .map((g) => `<option value="${escapeHtml(g.tag)}" ${g.tag === todo.goal_tag ? 'selected' : ''}>${escapeHtml(g.title)}</option>`)
    .join('')
  return `
    <label class="visually-hidden" for="editor-goal">목표</label>
    <select id="editor-goal" class="editor-goal">
      <option value="" ${todo.goal_tag ? '' : 'selected'}>일상</option>
      ${options}
    </select>
  `
}

/** Diffs the editor fields against the original todo, returning only the fields that changed. */
function buildPatch(todo, fields) {
  const patch = {}
  if (fields.title !== todo.title) patch.title = fields.title
  if (fields.due !== toDateOnly(todo.due_at)) patch.due = fields.due === '' ? null : fields.due
  if (fields.leadDays !== todo.lead_days) patch.lead_days = fields.leadDays
  const currentTags = (todo.tags || []).join(', ')
  if (fields.tagsRaw !== currentTags) patch.tags = parseTags(fields.tagsRaw)
  if (fields.goal !== (todo.goal_tag || '')) patch.goal = fields.goal === '' ? null : fields.goal
  return patch
}

function readFields(todo, refs) {
  return {
    title: refs.title.value.trim(),
    due: refs.due.value,
    leadDays: refs.lead.value === '' ? todo.lead_days : Number(refs.lead.value),
    tagsRaw: refs.tags.value,
    goal: refs.goal ? refs.goal.value : todo.goal_tag || '',
  }
}

/** Inline editor that replaces a row's content while `state.editingId === todo.id`. */
export function render(todo, state, actions) {
  const dueValue = toDateOnly(todo.due_at)
  const tagsValue = (todo.tags || []).join(', ')

  const el = createElement(`
    <div class="todo-row is-editing" data-id="${escapeHtml(todo.id)}">
      <div class="row-editor">
        <label class="visually-hidden" for="editor-title">제목</label>
        <input id="editor-title" class="editor-title" type="text" aria-label="제목" value="${escapeHtml(todo.title)}" />
        <div class="editor-line2">
          <label class="visually-hidden" for="editor-due">마감일</label>
          <input id="editor-due" class="editor-due" type="date" aria-label="마감일" value="${dueValue}" />
          <label class="qa-lead-wrap editor-lead-wrap" title="마감 며칠 전부터 준비를 시작할지">
            <span>준비</span>
            <input class="qa-lead editor-lead" type="number" min="0" max="60" aria-label="준비 시작 리드타임(일)" value="${todo.lead_days}" />
            <span>일 전</span>
          </label>
          <label class="visually-hidden" for="editor-tags">태그</label>
          <input id="editor-tags" class="editor-tags" type="text" aria-label="태그" placeholder="태그 (쉼표로 구분)" value="${escapeHtml(tagsValue)}" />
          ${goalSelectHtml(todo, state.goals)}
          <span class="editor-spacer"></span>
          <span class="editor-hint">ENTER 저장 · ESC 닫기</span>
          <button type="button" class="btn btn-ghost editor-close">닫기</button>
          <button type="button" class="btn btn-primary editor-save">저장</button>
        </div>
      </div>
    </div>
  `)

  const refs = {
    title: el.querySelector('.editor-title'),
    due: el.querySelector('.editor-due'),
    lead: el.querySelector('.editor-lead'),
    tags: el.querySelector('.editor-tags'),
    goal: el.querySelector('.editor-goal'),
  }
  const controls = [refs.title, refs.due, refs.lead, refs.tags, refs.goal, el.querySelector('.editor-close'), el.querySelector('.editor-save')]

  function setDisabled(disabled) {
    controls.forEach((node) => (node.disabled = disabled))
  }

  function close() {
    actions.cancelEdit()
  }

  async function save() {
    const fields = readFields(todo, refs)
    if (!fields.title) return
    const patch = buildPatch(todo, fields)
    if (Object.keys(patch).length === 0) {
      close()
      return
    }

    setDisabled(true)
    try {
      await actions.saveEdit(todo.id, patch)
    } catch (err) {
      showToast(err.message || '저장에 실패했습니다', { error: true })
    } finally {
      setDisabled(false)
    }
  }

  el.querySelector('.editor-save').addEventListener('click', () => void save())
  el.querySelector('.editor-close').addEventListener('click', close)

  controls.forEach((node) => {
    if (node.tagName !== 'INPUT') return
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        void save()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    })
  })

  queueMicrotask(() => refs.title.focus())

  return el
}
