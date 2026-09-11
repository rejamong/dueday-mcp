import type { Todo } from '../todos/types.js'

export type BrainSyncEvent = 'created' | 'done'

export interface BrainSyncOutcome {
  readonly target_slug: string
  readonly ok: boolean
  readonly error: string | null
}

/** Selective sync of project-linked todos into the gbrain knowledge base. */
export interface BrainSync {
  readonly enabled: boolean
  sync(event: BrainSyncEvent, todo: Todo): Promise<BrainSyncOutcome>
}

export const disabledBrainSync: BrainSync = {
  enabled: false,
  sync: () => Promise.reject(new Error('brain sync가 비활성화되어 있습니다')),
}
