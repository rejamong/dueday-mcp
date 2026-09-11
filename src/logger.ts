/** Single-line structured log to stdout; keeps request bodies and secrets out. */
export function logLine(scope: string, message: string): void {
  process.stdout.write(`${new Date().toISOString()} [${scope}] ${message}\n`)
}
