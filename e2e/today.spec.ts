import { test, expect } from '@playwright/test'

const OWNER_PASSWORD = 'e2e-owner-password'
const TITLE = 'E2E 테스트 할 일'

/** Calendar-date addition matching web/dates.js's UTC-midnight arithmetic (no timezone surprises). */
function addDaysUtc(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

test('login, quick-add, complete, logout', async ({ page }) => {
  let today = ''

  await test.step('unauthenticated visit shows the login form', async () => {
    await page.goto('/')
    await expect(page.locator('#login-password')).toBeVisible()
  })

  await test.step('wrong password shows the inline error', async () => {
    await page.fill('#login-password', 'not-the-password')
    await page.click('button:has-text("로그인")')
    await expect(page.locator('.login-error')).toHaveText('비밀번호가 올바르지 않습니다')
  })

  await test.step("correct password shows the topbar with today's line", async () => {
    await page.fill('#login-password', OWNER_PASSWORD)
    await page.click('button:has-text("로그인")')
    await expect(page.locator('.topbar')).toBeVisible()
    await expect(page.locator('.today-line')).toHaveText(/^TODAY \d{4}-\d{2}-\d{2} /) // retries until today has loaded
    const line = await page.locator('.today-line').textContent()
    today = (line ?? '').match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
    expect(today).not.toBe('')
  })

  await test.step('quick-add a todo 5 days out shows up under 7일 내 예정 with D-5', async () => {
    const dueDate = addDaysUtc(today, 5)
    await page.fill('#qa-title', TITLE)
    await page.fill('#qa-due', dueDate)
    await page.fill('#qa-lead', '3')
    await page.click('.qa-submit')
    await expect(page.locator('#toast')).toContainText('추가됨')

    const laterSection = page.locator('.section').filter({ hasText: '7일 내 예정' })
    const row = laterSection.locator('.todo-row').filter({ hasText: TITLE })
    await expect(row).toBeVisible()
    await expect(row.locator('.due-badge')).toContainText('D-5')
  })

  await test.step('checking it off moves it out of the open lists', async () => {
    const laterSection = page.locator('.section').filter({ hasText: '7일 내 예정' })
    const row = laterSection.locator('.todo-row').filter({ hasText: TITLE })
    await row.locator('.row-toggle').click()
    await expect(row).toHaveCount(0)

    const allSectionOpen = page.locator('.section').filter({ hasText: '전체 목록' })
    await expect(allSectionOpen.locator('.todo-row').filter({ hasText: TITLE })).toHaveCount(0)
  })

  await test.step('전체 목록 shows it under 완료 with the toggle selected', async () => {
    const allSection = page.locator('.section').filter({ hasText: '전체 목록' })
    await allSection.locator('button[data-status="done"]').click()
    await expect(allSection.locator('.todo-row').filter({ hasText: TITLE })).toBeVisible()
    await expect(allSection.locator('button[data-status="done"]')).toHaveClass(/toggle-selected/)
  })

  await test.step('로그아웃 returns to the login screen', async () => {
    await page.click('button:has-text("로그아웃")')
    await expect(page.locator('#login-password')).toBeVisible()
  })
})

test('edit, cancel, restore, delete', async ({ page }) => {
  const EDIT_TITLE = 'E2E 편집 테스트 할 일'
  let today = ''
  let row: ReturnType<typeof page.locator>

  const allSection = page.locator('.section').filter({ hasText: '전체 목록' })

  await test.step('log in', async () => {
    await page.goto('/')
    await page.fill('#login-password', OWNER_PASSWORD)
    await page.click('button:has-text("로그인")')
    await expect(page.locator('.topbar')).toBeVisible()
    const line = await page.locator('.today-line').textContent()
    today = (line ?? '').match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
    expect(today).not.toBe('')
  })

  await test.step('quick-add the todo and pin its row by id', async () => {
    await page.fill('#qa-title', EDIT_TITLE)
    await page.click('.qa-submit')
    await expect(page.locator('#toast')).toContainText('추가됨')

    const initialRow = allSection.locator('.todo-row').filter({ hasText: EDIT_TITLE })
    await expect(initialRow).toBeVisible()
    const todoId = await initialRow.getAttribute('data-id')
    row = page.locator(`.todo-row[data-id="${todoId}"]`)
  })

  await test.step('편집: due date +10d and tags a, b', async () => {
    await row.locator('.row-menu-btn').click()
    await row.locator('button[data-action="edit"]').click()
    await row.locator('.editor-due').fill(addDaysUtc(today, 10))
    await row.locator('.editor-tags').fill('a, b')
    await row.locator('.editor-save').click()

    await expect(page.locator('#toast')).toContainText('저장됨')
    await expect(row.locator('.due-badge')).toContainText('D-10')
    await expect(row.locator('.tag-chip')).toHaveText(['a', 'b'])
  })

  await test.step('취소: leaves 미완료, shows under 취소 with a 취소 badge', async () => {
    await row.locator('.row-menu-btn').click()
    await row.locator('button[data-action="cancel"]').click()
    await expect(page.locator('#toast')).toContainText('취소됨')
    await expect(row).toHaveCount(0)

    await allSection.locator('button[data-status="cancelled"]').click()
    await expect(row).toBeVisible()
    await expect(row.locator('.due-badge')).toContainText('취소')
  })

  await test.step('되살리기: back under 미완료', async () => {
    await row.locator('.row-menu-btn').click()
    await row.locator('button[data-action="restore"]').click()
    await expect(page.locator('#toast')).toContainText('되살림')
    await expect(row).toHaveCount(0)

    await allSection.locator('button[data-status="open"]').click()
    await expect(row).toBeVisible()
  })

  await test.step('삭제: 유지 keeps it, confirming 삭제 removes it everywhere', async () => {
    await row.locator('.row-menu-btn').click()
    await row.locator('button[data-action="delete"]').click()
    await row.locator('.delete-keep').click()
    await expect(row).toBeVisible()

    await row.locator('.row-menu-btn').click()
    await row.locator('button[data-action="delete"]').click()
    await row.locator('.delete-confirm-btn').click()
    await expect(page.locator('#toast')).toContainText('삭제됨')
    await expect(row).toHaveCount(0)

    await allSection.locator('button[data-status="done"]').click()
    await expect(row).toHaveCount(0)
    await allSection.locator('button[data-status="cancelled"]').click()
    await expect(row).toHaveCount(0)
  })
})

const WEEKDAYS_KR = ['일', '월', '화', '수', '목', '금', '토']

/** `9월 14일 (월)` — mirrors web/dates.js's formatDayHeading. */
function formatDayHeadingUtc(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const weekday = WEEKDAYS_KR[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${m}월 ${d}일 (${weekday})`
}

test('calendar view: toggle, chips, month nav, day selection, and persistence', async ({ page }) => {
  const DUE_TITLE = 'E2E 달력 마감 테스트'
  const LATER_TITLE = 'E2E 달력 예정 테스트'
  let today = ''

  await test.step('log in', async () => {
    await page.goto('/')
    await page.fill('#login-password', OWNER_PASSWORD)
    await page.click('button:has-text("로그인")')
    await expect(page.locator('.topbar')).toBeVisible()
    const line = await page.locator('.today-line').textContent()
    today = (line ?? '').match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
    expect(today).not.toBe('')
  })

  const due3 = addDaysUtc(today, 3)
  const due20 = addDaysUtc(today, 20)

  await test.step('quick-add a todo due in 3 days with lead 3 (prep starts today)', async () => {
    await page.fill('#qa-title', DUE_TITLE)
    await page.fill('#qa-due', due3)
    await page.fill('#qa-lead', '3')
    await page.click('.qa-submit')
    await expect(page.locator('#toast')).toContainText('추가됨')
  })

  await test.step('quick-add a todo due in 20 days', async () => {
    await page.fill('#qa-title', LATER_TITLE)
    await page.fill('#qa-due', due20)
    await page.click('.qa-submit')
    await expect(page.locator('#toast')).toContainText('추가됨')
  })

  // Asia/Seoul "now", per the spec's own formula.
  const kst = new Date(Date.now() + 9 * 3600 * 1000)
  const expectedYear = kst.getUTCFullYear()
  const expectedMonth = kst.getUTCMonth() + 1
  const expectedTitle = `${expectedYear}년 ${expectedMonth}월`

  await test.step('전체 목록 defaults to 목록, then 달력 shows the current month with the right chips', async () => {
    await expect(page.locator('.view-toggle-btn[data-view="목록"]')).toHaveClass(/toggle-selected/)

    await page.click('.view-toggle-btn[data-view="달력"]')
    await expect(page.locator('.calendar-title')).toHaveText(expectedTitle)

    const todayCell = page.locator(`.cal-cell[data-date="${today}"]`)
    await expect(todayCell.locator('.cal-chip-prep')).toContainText('▷ 준비')

    const dueCell = page.locator(`.cal-cell[data-date="${due3}"]`)
    await expect(dueCell).toContainText(DUE_TITLE)
  })

  await test.step('clicking the day+3 cell selects it and shows the todo below', async () => {
    await page.locator(`.cal-cell[data-date="${due3}"]`).click()

    await expect(page.locator('.calendar-day-title')).toHaveText(formatDayHeadingUtc(due3))
    await expect(page.locator('.calendar-day-list .todo-row').filter({ hasText: DUE_TITLE })).toBeVisible()
  })

  await test.step('› moves the title to next month', async () => {
    await page.click('.cal-nav-btn[data-nav="next"]')
    const nextMonth = expectedMonth === 12 ? 1 : expectedMonth + 1
    const nextYear = expectedMonth === 12 ? expectedYear + 1 : expectedYear
    await expect(page.locator('.calendar-title')).toHaveText(`${nextYear}년 ${nextMonth}월`)
  })

  await test.step('오늘 returns to the current month', async () => {
    await page.click('.calendar-today-btn')
    await expect(page.locator('.calendar-title')).toHaveText(expectedTitle)
  })

  await test.step('reloading the page keeps 달력 selected (persisted in localStorage)', async () => {
    await page.reload()
    await expect(page.locator('.view-toggle-btn[data-view="달력"]')).toHaveClass(/toggle-selected/)
    await expect(page.locator('.calendar-cells')).toBeVisible()
  })
})

test('goals page: life goal, annual goal metric tracking, check-in, and todo linking', async ({ page }) => {
  const LIFE_TITLE = '나와 가족의 자유와 행복'
  const ANNUAL_TITLE = '15권 이상 독서'
  const GOAL_TAG = 'reading'
  const LINKED_TODO_TITLE = 'E2E 목표 연결 할 일'

  let goalCard: ReturnType<typeof page.locator>

  await test.step('log in and switch to the 목표 tab', async () => {
    await page.goto('/')
    await page.fill('#login-password', OWNER_PASSWORD)
    await page.click('button:has-text("로그인")')
    await expect(page.locator('.topbar')).toBeVisible()
    await page.click('.nav-tabs button:has-text("목표")')
    await expect(page.locator('.goals-page')).toBeVisible()
  })

  await test.step('create the life goal from the hero prompt', async () => {
    await page.click('.goal-hero-empty')
    await page.fill('#ga-title', LIFE_TITLE)
    await page.click('.ga-submit')
    await expect(page.locator('#toast')).toContainText('목표 추가됨')
    await expect(page.locator('.goal-hero-title')).toHaveText(LIFE_TITLE)
  })

  await test.step('create the annual reading goal with a count/gte metric', async () => {
    await page.click('.goal-hero-add')
    await page.fill('#ga-title', ANNUAL_TITLE)
    await page.fill('#ga-tag', GOAL_TAG)
    await page.click('.ga-add-metric')
    const row = page.locator('.metric-row').first()
    await row.locator('.mr-name').fill('읽은 책')
    await row.locator('.mr-target').fill('15')
    await row.locator('.mr-unit').fill('권')
    await page.click('.ga-submit')
    await expect(page.locator('#toast')).toContainText('목표 추가됨')

    goalCard = page.locator(`.goal-card[data-tag="${GOAL_TAG}"]`)
    await expect(goalCard).toBeVisible()
  })

  await test.step('shows 뒤처짐 (0% vs elapsed time) and 0 / 15 권 · 0%', async () => {
    await expect(goalCard.locator('.status-pill')).toHaveText('뒤처짐')
    await expect(goalCard.locator('.goal-metric-value')).toContainText('0 / 15 권 · 0%')
  })

  await test.step('체크인 value 3 updates the metric to 3 / 15 권 · 20%', async () => {
    await goalCard.locator('.goal-checkin-btn').click()
    await goalCard.locator('.ci-value').fill('3')
    await goalCard.locator('.ci-submit').click()
    await expect(page.locator('#toast')).toContainText('기록됨')
    await expect(goalCard.locator('.goal-metric-value')).toContainText('3 / 15 권 · 20%')
  })

  await test.step('quick-add a todo linked to 목표: reading from 오늘, shows the ◎ chip', async () => {
    await page.click('.nav-tabs button:has-text("오늘")')
    await page.fill('#qa-title', LINKED_TODO_TITLE)
    await page.selectOption('#qa-goal', GOAL_TAG)
    await page.click('.qa-submit')
    await expect(page.locator('#toast')).toContainText('추가됨')

    const allSection = page.locator('.section').filter({ hasText: '전체 목록' })
    const row = allSection.locator('.todo-row').filter({ hasText: LINKED_TODO_TITLE })
    await expect(row.locator('.goal-chip')).toContainText(GOAL_TAG)
  })

  await test.step('back on 목표, 자세히 shows the linked todo and the footer counts it', async () => {
    await page.click('.nav-tabs button:has-text("목표")')
    await expect(goalCard.locator('.goal-footer-text')).toContainText('할 일 1 열림')

    await goalCard.locator('.goal-detail-btn').click()
    await expect(goalCard.locator('.goal-detail-todos').getByText(LINKED_TODO_TITLE)).toBeVisible()
  })

  await test.step('status chips filter the annual grid and toggle off', async () => {
    const chip = page.locator('.goals-section[data-kind="annual"] .goals-status-chip[data-status="done"]')
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.goals-section[data-kind="annual"] .goal-card, .goals-section[data-kind="annual"] .goals-section-empty').first()).toBeVisible()
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.goal-card', { hasText: '독서' }).first()).toBeVisible()
  })

  await test.step('completing from the panel moves the todo to 완료 and the circle reopens it', async () => {
    const goalCard = page.locator('.goal-card', { hasText: '독서' }).first()
    const openRow = goalCard.locator('.goal-detail-todos').first().locator('.todo-row', { hasText: LINKED_TODO_TITLE })
    await openRow.locator('.row-toggle').click()
    const doneRow = goalCard.locator('.goal-detail-todos-done .todo-row', { hasText: LINKED_TODO_TITLE })
    await expect(doneRow).toBeVisible()
    await expect(goalCard.locator('.goal-detail-todos').first().locator('.todo-row', { hasText: LINKED_TODO_TITLE })).toHaveCount(0)
    await doneRow.locator('.row-toggle').click()
    await expect(goalCard.locator('.goal-detail-todos').first().locator('.todo-row', { hasText: LINKED_TODO_TITLE })).toBeVisible()
    await expect(goalCard.locator('.goal-detail-todos-done')).toHaveCount(0)
  })
})

test('AI 제안 panel: absent with no suggestions, goals page loads cleanly', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  await test.step('log in via the REST API (never type the password into the login form)', async () => {
    const res = await page.request.post('/login', { data: { password: OWNER_PASSWORD } })
    expect(res.ok()).toBe(true)
    await page.request.post('/api/todos', { data: { title: 'E2E 제안 패널 테스트 할 일' } })
  })

  await test.step('goals page renders with no AI 제안 section and no console errors', async () => {
    await page.goto('/')
    await expect(page.locator('.topbar')).toBeVisible()
    await page.click('.nav-tabs button:has-text("목표")')
    await expect(page.locator('.goals-page')).toBeVisible()
    await expect(page.locator('.goal-suggestions')).toHaveCount(0)
    expect(consoleErrors).toEqual([])
  })
})

test('calendar quick-add: + on a day cell adds a todo inline without changing month', async ({ page }) => {
  const TITLE = 'E2E 달력 퀵애드 테스트'
  let today = ''
  let targetDate = ''

  await test.step('log in via the REST API (never type the password into the login form)', async () => {
    const res = await page.request.post('/login', { data: { password: OWNER_PASSWORD } })
    expect(res.ok()).toBe(true)
  })

  await test.step('open the app, read today, and switch to 달력', async () => {
    await page.goto('/')
    await expect(page.locator('.topbar')).toBeVisible()
    const line = await page.locator('.today-line').textContent()
    today = (line ?? '').match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
    expect(today).not.toBe('')

    // A day near today but guaranteed to stay in the same displayed month (falls back to -2 near month end).
    targetDate = addDaysUtc(today, 2)
    if (targetDate.slice(0, 7) !== today.slice(0, 7)) targetDate = addDaysUtc(today, -2)

    await page.click('.view-toggle-btn[data-view="달력"]')
    await expect(page.locator('.calendar-cells')).toBeVisible()
  })

  const calendarTitleBefore = await page.locator('.calendar-title').textContent()

  await test.step('click + on the target day cell, type a title, and press Enter', async () => {
    const addBtn = page.locator(`.cal-cell-add[data-date="${targetDate}"]`)
    await addBtn.hover()
    await addBtn.click()

    const input = page.locator('.cal-quick-add-input')
    await expect(input).toBeFocused()
    await input.fill(TITLE)
    await input.press('Enter')

    await expect(page.locator('#toast')).toContainText('추가됨')
  })

  await test.step('the chip shows up in that same day cell, and the month did not change', async () => {
    const dayCell = page.locator(`.cal-cell[data-date="${targetDate}"]`)
    await expect(dayCell).toContainText(TITLE)
    await expect(page.locator('.calendar-title')).toHaveText(calendarTitleBefore ?? '')
  })

  await test.step('clean up the todo via the API', async () => {
    const searchRes = await page.request.get(`/api/todos?q=${encodeURIComponent(TITLE)}`)
    expect(searchRes.ok()).toBe(true)
    const { data } = await searchRes.json()
    const todo = data.find((t: { title: string }) => t.title === TITLE)
    expect(todo).toBeTruthy()

    const deleteRes = await page.request.delete(`/api/todos/${todo.id}`)
    expect(deleteRes.ok()).toBe(true)
  })
})

test('규모(size): quick-add derives 준비 date, row editor updates it, and the size filter narrows the list', async ({ page }) => {
  const TITLE = `E2E 규모 테스트 ${Date.now()}`
  let today = ''
  let row: ReturnType<typeof page.locator>
  let todoId = ''

  const allSection = page.locator('.section').filter({ hasText: '전체 목록' })

  await test.step('log in via the REST API (never type the password into the login form)', async () => {
    const res = await page.request.post('/login', { data: { password: OWNER_PASSWORD } })
    expect(res.ok()).toBe(true)
  })

  await test.step('open the app and read today', async () => {
    await page.goto('/')
    await expect(page.locator('.topbar')).toBeVisible()
    const line = await page.locator('.today-line').textContent()
    today = (line ?? '').match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
    expect(today).not.toBe('')
  })

  // size 3 (일주일) derives lead_days=5 server-side when lead_days is left untouched — see src/todos/size.ts.
  const dueDate = addDaysUtc(today, 20)
  const expectedPrep = addDaysUtc(dueDate, -5)
  const [, prepMonth, prepDay] = expectedPrep.split('-').map(Number)
  const expectedPrepShort = `준비 ${prepMonth}/${prepDay}`

  await test.step('quick-add with size 3 and no lead_days shows the 규모 chip and the derived 준비 date', async () => {
    await page.fill('#qa-title', TITLE)
    await page.fill('#qa-due', dueDate)
    await page.selectOption('#qa-size', '3')
    await page.click('.qa-submit')
    await expect(page.locator('#toast')).toContainText('추가됨')

    row = allSection.locator('.todo-row').filter({ hasText: TITLE })
    await expect(row).toBeVisible()
    todoId = (await row.getAttribute('data-id')) ?? ''
    expect(todoId).not.toBe('')
    row = page.locator(`.todo-row[data-id="${todoId}"]`)

    await expect(row.locator('.chip-size')).toHaveText('규모 3 · 일주일')
    await expect(row.locator('.row-prep')).toContainText(expectedPrepShort)
  })

  await test.step('editing to size 1 via the row editor updates the chip', async () => {
    await row.locator('.row-menu-btn').click()
    await row.locator('button[data-action="edit"]').click()
    await row.locator('.editor-size').selectOption('1')
    await row.locator('.editor-save').click()

    await expect(page.locator('#toast')).toContainText('저장됨')
    await expect(row.locator('.chip-size')).toHaveText('규모 1 · 반나절')
  })

  await test.step('the 규모 filter narrows 전체 목록 to just this row', async () => {
    await allSection.locator('.chip[data-size="1"]').click()
    await expect(allSection.locator('.todo-row')).toHaveCount(1)
    await expect(row).toBeVisible()
  })

  await test.step('clean up via the API', async () => {
    const deleteRes = await page.request.delete(`/api/todos/${todoId}`)
    expect(deleteRes.ok()).toBe(true)
  })
})

test('mobile: quick-add collapses behind a button and stat cards become one line', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const login = await page.request.post('/login', { data: { password: OWNER_PASSWORD } })
  expect(login.ok()).toBeTruthy()
  await page.goto('/')
  await expect(page.locator('.quick-add')).toBeHidden()
  await expect(page.locator('.stat-strip')).toBeHidden()
  await expect(page.locator('.stat-line')).toBeVisible()
  await page.click('.quick-add-toggle')
  await expect(page.locator('.quick-add')).toBeVisible()
  const TITLE = `모바일 등록 ${Date.now()}`
  await page.fill('#qa-title', TITLE)
  await page.press('#qa-title', 'Enter')
  await expect(page.locator('.todo-row', { hasText: TITLE })).toBeVisible()
  await expect(page.locator('.quick-add')).toBeHidden()
  const res = await page.request.get(`/api/todos?q=${encodeURIComponent(TITLE)}`)
  const { data } = await res.json()
  for (const t of data) await page.request.delete(`/api/todos/${t.id}`)
})
