import { globSync, rmSync } from 'node:fs'

/** Removes the e2e SQLite file (plus -wal/-shm) after the run so it never leaks into git status. */
export default function globalTeardown(): void {
  for (const file of globSync('/tmp/dueday-e2e.db*')) {
    rmSync(file, { force: true })
  }
}
