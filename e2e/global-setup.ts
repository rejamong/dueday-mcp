import { globSync, rmSync } from 'node:fs'

/** Removes any leftover e2e SQLite file (plus -wal/-shm) so each run starts clean. */
function cleanDb(): void {
  for (const file of globSync('/tmp/dueday-e2e.db*')) {
    rmSync(file, { force: true })
  }
}

export default function globalSetup(): void {
  cleanDb()
}
