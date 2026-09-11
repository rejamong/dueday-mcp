import type { Todo } from '../todos/types.js'

const SECTION_HEADING = '## 남은 일'
const HEADER_ROW = '| 항목 | 상태 | 담당자 | 마감 | 대기 대상 | 다음 행동 | 출처 |'
const SEPARATOR_ROW = '| --- | --- | --- | --- | --- | --- | --- |'

interface TableBounds {
  readonly dataStart: number
  readonly dataEnd: number
}

const UNESCAPED_PIPE = /(?<!\\)\|/

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|')
}

/** Splits a table row on pipes that are not escaped as `\|`. */
function splitCells(row: string): string[] {
  return row.split(UNESCAPED_PIPE)
}

function formatDue(dueAt: string | null): string {
  return dueAt === null ? '—' : dueAt.slice(0, 10)
}

function buildRow(todo: Todo, status: string): string {
  const title = escapeCell(todo.title)
  const due = formatDue(todo.due_at)
  return `| ${title} | ${status} | — | ${due} | — | — | todo:${todo.id} |`
}

/** Replaces only the 상태 and 마감 cells of a table row, leaving the rest untouched. */
function replaceStatusCell(row: string, status: string, due: string): string {
  const cells = splitCells(row)
  const updated = cells.map((cell, i) => {
    if (i === 2) return ` ${status} `
    if (i === 4) return ` ${due} `
    return cell
  })
  return updated.join('|')
}

/** Finds the header/separator/data-row range of the table right after a section heading. */
function findTableBounds(lines: readonly string[], headingIdx: number): TableBounds | null {
  let i = headingIdx + 1
  while (i < lines.length) {
    const trimmed = (lines[i] ?? '').trim()
    if (trimmed.startsWith('## ')) return null
    if (trimmed.startsWith('|')) break
    i++
  }
  if (i >= lines.length) return null
  const dataStart = i + 2
  let dataEnd = dataStart
  while (dataEnd < lines.length && (lines[dataEnd] ?? '').trim().startsWith('|')) dataEnd++
  return { dataStart, dataEnd }
}

/**
 * Upserts a todo's row into the `## 남은 일` table of a gbrain project page's markdown.
 * Pure function: never mutates `content` or `todo`, returns a new string.
 */
export function upsertRemainingRow(content: string, todo: Todo, status: '진행' | '완료'): string {
  const marker = `todo:${todo.id}`
  const due = formatDue(todo.due_at)
  const newRow = buildRow(todo, status)
  const lines = content.split('\n')
  const headingIdx = lines.findIndex((line) => line.trim() === SECTION_HEADING)

  if (headingIdx === -1) {
    return `${content}\n${SECTION_HEADING}\n${HEADER_ROW}\n${SEPARATOR_ROW}\n${newRow}`
  }

  const bounds = findTableBounds(lines, headingIdx)
  if (bounds === null) {
    const before = lines.slice(0, headingIdx + 1)
    const after = lines.slice(headingIdx + 1)
    return [...before, HEADER_ROW, SEPARATOR_ROW, newRow, ...after].join('\n')
  }

  const { dataStart, dataEnd } = bounds
  const dataRows = lines.slice(dataStart, dataEnd)
  const matchIdx = dataRows.findIndex((row) => (splitCells(row)[7] ?? '').trim() === marker)
  const updatedRows =
    matchIdx === -1
      ? [...dataRows, newRow]
      : dataRows.map((row, i) => (i === matchIdx ? replaceStatusCell(row, status, due) : row))

  return [...lines.slice(0, dataStart), ...updatedRows, ...lines.slice(dataEnd)].join('\n')
}
