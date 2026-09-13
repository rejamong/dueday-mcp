export interface EnrichContext {
  readonly today: string
  readonly existingTags: readonly string[]
  readonly goals: ReadonlyArray<{ readonly tag: string; readonly title: string; readonly kind: string }>
}

/** Frozen rules — identical bytes on every call so the prompt cache hits. Volatile context goes in the user turn. */
export function buildSystemPrompt(): string {
  return [
    '너는 개인 할 일 관리 서비스의 분류기다. 새 할 일 하나를 받아 비어 있는 필드를 채우는 제안을 JSON으로만 낸다. 사용자가 이미 채운 필드(provided=true)는 판단하지 말고 무시한다.',
    '',
    '[태그] 기존 태그 목록에서 가장 맞는 것을 최대 2개 고른다. 맞는 것이 없을 때만 짧은 한글 명사 하나를 새로 만든다. 프로젝트·고객 이름이 제목에 있으면 그것이 태그다.',
    '[준비 기간 lead_days] 보고서·리서치·발표 자료 5 / 신청·서류·예약 3 / 구매·심부름·연락 1 / 그 밖의 단순 작업 1. 판단이 안 되면 null.',
    '[마감 due] 제목에 날짜 표현이 있을 때만 today(Asia/Seoul) 기준으로 YYYY-MM-DD를 계산한다. "이번주"는 today가 속한 월~일, "다음주"는 그 다음 월~일. 요일 없이 "다음주까지"면 그 주 금요일. 날짜 표현이 없으면 null. 추측하지 않는다.',
    '[목표 goal] 활성 목표 목록 중 이 할 일이 분명히 기여하는 목표가 있으면 그 tag를 넣고 goal_confidence를 high로 한다. 관련은 있지만 애매하면 medium/low로 두고 tag를 넣어도 된다(서버는 high만 적용한다). 없으면 null. 목표 목록에 없는 tag를 지어내지 않는다.',
    '[목표 상향 promote_to_goal] 이 항목이 한 번 끝나는 작업이 아니라 기간 동안 유지·반복해야 하거나(매주·매달·꾸준히·유지), 수치 목표를 담고 있거나(N권·N회·N kg·N명), 결과가 여러 할 일의 합으로 만들어지는 상태(되기·만들기·모으기·줄이기)라면 목표 초안을 낸다. 신호가 둘 이상일 때만. kind는 올해 안에 끝나는 연중 목표면 annual, 몇 주~몇 달의 기한이 분명하면 short(period_end 필수), 기한 없는 지속 목표면 long. 이미 있는 목표에 속하는 반복 행동은 상향이 아니라 goal 연결이다. 아니면 null.',
    '[reason] 한 문장, 한국어, 100자 이내.',
  ].join('\n')
}

export function buildUserMessage(input: EnrichContext & { title: string; note: string | null; provided: Record<string, boolean> }): string {
  const goals = input.goals.length === 0 ? '(없음)' : input.goals.map((g) => `- ${g.tag}: ${g.title} (${g.kind})`).join('\n')
  const tags = input.existingTags.length === 0 ? '(없음)' : input.existingTags.join(', ')
  return [
    `today: ${input.today}`,
    `기존 태그: ${tags}`,
    `활성 목표:\n${goals}`,
    `이미 채워진 필드: ${Object.entries(input.provided).filter(([, v]) => v).map(([k]) => k).join(', ') || '(없음)'}`,
    '',
    `할 일 제목: ${input.title}`,
    input.note ? `메모: ${input.note}` : '',
  ].join('\n')
}
