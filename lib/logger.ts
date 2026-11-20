export function logError(
  context: string,
  error: unknown,
  meta?: Record<string, string | number | boolean | null | undefined>
): void {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
  const payload = {
    level: 'error',
    timestamp: new Date().toISOString(),
    context,
    message,
    ...(meta ? { meta } : {}),
  };
  console.error(JSON.stringify(payload));
}

export function logInfo(
  context: string,
  meta?: Record<string, string | number | boolean | null | undefined>
): void {
  const payload = {
    level: 'info',
    timestamp: new Date().toISOString(),
    context,
    ...(meta ? { meta } : {}),
  };
  console.info(JSON.stringify(payload));
}
