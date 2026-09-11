export class ValidationError extends Error {
  readonly code = 'VALIDATION' as const
  readonly issues: readonly string[]

  constructor(message: string, issues: readonly string[] = []) {
    super(message)
    this.name = 'ValidationError'
    this.issues = issues
  }
}

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const

  constructor(message = '항목을 찾을 수 없습니다') {
    super(message)
    this.name = 'NotFoundError'
  }
}
