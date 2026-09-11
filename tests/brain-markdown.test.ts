import { describe, expect, it } from 'vitest'
import { upsertRemainingRow } from '../src/brain/markdown.js'
import type { Todo } from '../src/todos/types.js'

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    title: '분기 보고서 작성',
    note: null,
    due_at: '2026-09-15T18:00:00+09:00',
    lead_days: 0,
    prep_start: null,
    status: 'open',
    tags: [],
    brain_ref: 'projects/sample-project',
    source: 'mcp',
    created_at: '2026-09-11T00:00:00+09:00',
    updated_at: '2026-09-11T00:00:00+09:00',
    done_at: null,
    ...overrides,
  }
}

const HEADER = '| 항목 | 상태 | 담당자 | 마감 | 대기 대상 | 다음 행동 | 출처 |'
const SEPARATOR = '| --- | --- | --- | --- | --- | --- | --- |'

describe('upsertRemainingRow', () => {
  it('appends a new row to an existing table', () => {
    const content = [
      '# 샘플 프로젝트',
      '',
      '## 남은 일',
      HEADER,
      SEPARATOR,
      '| 기존 항목 | 진행 | 홍길동 | 2026-09-01 | — | — | todo:OTHERID |',
      '',
      '## 다음 섹션',
      '내용',
    ].join('\n')

    const todo = makeTodo()
    const result = upsertRemainingRow(content, todo, '진행')

    expect(result).toContain('| 기존 항목 | 진행 | 홍길동 | 2026-09-01 | — | — | todo:OTHERID |')
    expect(result).toContain('| 분기 보고서 작성 | 진행 | — | 2026-09-15 | — | — | todo:01ARZ3NDEKTSV4RRFFQ69G5FAV |')
    expect(result).toContain('## 다음 섹션\n내용')
    expect(result.split('\n').filter((l) => l.startsWith('| 기존')).length).toBe(1)
  })

  it('updates the status and due cells of an existing row, preserving other cells', () => {
    const content = [
      '## 남은 일',
      HEADER,
      SEPARATOR,
      '| 분기 보고서 작성 | 진행 | 홍길동 | 2026-09-01 | 승인 | 문서 작성 | todo:01ARZ3NDEKTSV4RRFFQ69G5FAV |',
    ].join('\n')

    const todo = makeTodo({ due_at: '2026-09-20T18:00:00+09:00' })
    const result = upsertRemainingRow(content, todo, '완료')

    expect(result).toContain(
      '| 분기 보고서 작성 | 완료 | 홍길동 | 2026-09-20 | 승인 | 문서 작성 | todo:01ARZ3NDEKTSV4RRFFQ69G5FAV |',
    )
    // Only one row for this todo, and no duplicate appended.
    expect(result.split('\n').filter((l) => l.includes('todo:01ARZ3NDEKTSV4RRFFQ69G5FAV')).length).toBe(1)
  })

  it('creates the section and table when missing', () => {
    const content = '# 샘플 프로젝트\n\n소개 문단입니다.'
    const todo = makeTodo()
    const result = upsertRemainingRow(content, todo, '진행')

    expect(result.startsWith(content)).toBe(true)
    expect(result).toContain('\n## 남은 일\n')
    expect(result).toContain(HEADER)
    expect(result).toContain(SEPARATOR)
    expect(result).toContain('todo:01ARZ3NDEKTSV4RRFFQ69G5FAV')
  })

  it('leaves YAML frontmatter untouched', () => {
    const frontmatter = ['---', 'title: 샘플 프로젝트', 'tags: [project]', '---', ''].join('\n')
    const content = `${frontmatter}\n## 남은 일\n${HEADER}\n${SEPARATOR}`
    const todo = makeTodo()
    const result = upsertRemainingRow(content, todo, '진행')

    expect(result.startsWith(frontmatter)).toBe(true)
  })

  it('escapes pipe characters in the title', () => {
    const content = `## 남은 일\n${HEADER}\n${SEPARATOR}`
    const todo = makeTodo({ title: 'A | B 작업' })
    const result = upsertRemainingRow(content, todo, '진행')

    expect(result).toContain('| A \\| B 작업 | 진행 |')
  })

  it('formats the due date and handles a null due date as an em dash', () => {
    const content = `## 남은 일\n${HEADER}\n${SEPARATOR}`

    const withDue = upsertRemainingRow(content, makeTodo({ due_at: '2026-09-15T18:00:00+09:00' }), '진행')
    expect(withDue).toContain('| 2026-09-15 |')

    const withoutDue = upsertRemainingRow(content, makeTodo({ due_at: null }), '진행')
    expect(withoutDue).toContain('| — |')
  })

  it('updates a row in place even when the title contains an escaped pipe', () => {
    const piped = makeTodo({ title: 'A | B 리뷰' })
    const page = ['# 샘플 프로젝트', '', '## 남은 일', HEADER, SEPARATOR].join('\n')
    const created = upsertRemainingRow(page, piped, '진행')
    const done = upsertRemainingRow(created, piped, '완료')
    const rows = done.split('\n').filter((line) => line.includes('todo:' + piped.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toContain('| A \\| B 리뷰 | 완료 |')
  })
})
