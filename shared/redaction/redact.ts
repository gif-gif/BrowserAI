const BEARER_PATTERN = /Bearer\s+[^\s;,]+/gi;

export function redactText(value: string, secrets: string[] = []): string {
  let redacted = value.replace(BEARER_PATTERN, 'Bearer [REDACTED]');
  for (const secret of secrets) {
    if (!secret) continue;
    redacted = redacted.split(secret).join('[REDACTED]');
  }
  return redacted;
}
