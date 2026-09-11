import type { z } from 'zod'
import { ValidationError } from './errors.js'

export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  const issues = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
    return `${path}${issue.message}`
  })
  throw new ValidationError(`입력이 올바르지 않습니다 — ${issues.join('; ')}`, issues)
}
