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
    const line = await page.locator('.today-line').textContent()
    expect(line ?? '').toMatch(/^TODAY \d{4}-\d{2}-\d{2} /)
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
    await row.locator('.row-check').click()
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
