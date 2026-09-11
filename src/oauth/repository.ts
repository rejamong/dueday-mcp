import type { Db } from '../db/connection.js'

export interface CodeRecord {
  readonly code_hash: string
  readonly client_id: string
  readonly redirect_uri: string
  readonly code_challenge: string
  readonly scope: string
  readonly expires_at: string
  readonly used_at: string | null
}

export type TokenKind = 'access' | 'refresh'

export interface TokenRecord {
  readonly token_hash: string
  readonly kind: TokenKind
  readonly client_id: string
  readonly scope: string
  readonly family_id: string
  readonly expires_at: string
  readonly revoked_at: string | null
  readonly created_at: string
}

export function insertCode(db: Db, record: Omit<CodeRecord, 'used_at'>): void {
  db.prepare(
    'INSERT INTO oauth_codes (code_hash, client_id, redirect_uri, code_challenge, scope, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(record.code_hash, record.client_id, record.redirect_uri, record.code_challenge, record.scope, record.expires_at)
}

export function findCode(db: Db, codeHash: string): CodeRecord | undefined {
  return db.prepare('SELECT * FROM oauth_codes WHERE code_hash = ?').get(codeHash) as CodeRecord | undefined
}

export function markCodeUsed(db: Db, codeHash: string, usedAt: string): void {
  db.prepare('UPDATE oauth_codes SET used_at = ? WHERE code_hash = ?').run(usedAt, codeHash)
}

export function insertToken(db: Db, record: Omit<TokenRecord, 'revoked_at'>): void {
  db.prepare(
    'INSERT INTO oauth_tokens (token_hash, kind, client_id, scope, family_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(record.token_hash, record.kind, record.client_id, record.scope, record.family_id, record.expires_at, record.created_at)
}

export function findToken(db: Db, tokenHash: string): TokenRecord | undefined {
  return db.prepare('SELECT * FROM oauth_tokens WHERE token_hash = ?').get(tokenHash) as TokenRecord | undefined
}

export function revokeToken(db: Db, tokenHash: string, revokedAt: string): void {
  db.prepare('UPDATE oauth_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(revokedAt, tokenHash)
}

export function revokeFamily(db: Db, familyId: string, revokedAt: string): void {
  db.prepare('UPDATE oauth_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL').run(revokedAt, familyId)
}

/** Housekeeping: drop codes and tokens that expired more than a day ago. */
export function purgeExpired(db: Db, before: string): void {
  db.prepare('DELETE FROM oauth_codes WHERE expires_at < ?').run(before)
  db.prepare('DELETE FROM oauth_tokens WHERE expires_at < ?').run(before)
}
