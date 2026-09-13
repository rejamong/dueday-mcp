export type TodoStatus = 'open' | 'done' | 'cancelled'
export type TodoSource = 'mcp' | 'web'

export interface TodoRow {
  readonly id: string
  readonly title: string
  readonly note: string | null
  readonly due_at: string | null
  readonly lead_days: number
  readonly status: TodoStatus
  readonly brain_ref: string | null
  readonly goal_id: string | null
  /** JSON of fields filled by the classifier; cleared on manual edit. */
  readonly enrichment: string | null
  readonly enriched_at: string | null
  readonly source: TodoSource
  readonly created_at: string
  readonly updated_at: string
  readonly done_at: string | null
}

export interface EnrichmentApplied {
  readonly tags?: readonly string[]
  readonly goal?: string
  readonly lead_days?: number
  readonly due?: string
}

export interface Todo extends Omit<TodoRow, 'enrichment'> {
  readonly prep_start: string | null
  readonly tags: readonly string[]
  /** Tag of the linked goal; null means 일상 (not tied to a goal). */
  readonly goal_tag: string | null
  /** Fields the classifier filled in, for the "자동" chip; null when untouched or manually edited since. */
  readonly enrichment: EnrichmentApplied | null
}

export interface TagSummary {
  readonly name: string
  readonly color: string | null
  readonly open_count: number
}

export interface UpcomingResult {
  readonly today: string
  readonly overdue: readonly Todo[]
  readonly start_now: readonly Todo[]
  readonly later: readonly Todo[]
  readonly no_due: readonly Todo[]
  readonly summary: string
}
