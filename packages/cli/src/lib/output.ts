export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function handleCommandError(err: unknown): never {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
