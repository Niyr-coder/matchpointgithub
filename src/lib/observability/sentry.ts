// Sentry shim. Wires only if SENTRY_DSN is configured; otherwise the helpers
// no-op so dev / preview work without a Sentry account.
//
// We deliberately avoid pulling @sentry/nextjs as a dep until the user opts in:
// the bundle hit isn't worth it for an MVP that may not need it yet.
// Once SENTRY_DSN is set, replace this with @sentry/nextjs and wire properly.

type ErrorContext = Record<string, unknown>;

const ENABLED = Boolean(process.env.SENTRY_DSN);

export function captureError(error: unknown, context?: ErrorContext): void {
  if (!ENABLED) {
     
    console.error("[capture]", error, context);
    return;
  }
  // Future: import('@sentry/nextjs').then(s => s.captureException(error, { extra: context }))
  // Kept inline so we don't pay the bundle cost when disabled.
}

export function addBreadcrumb(message: string, data?: ErrorContext): void {
  if (!ENABLED) return;
  // Future Sentry breadcrumb
  void message;
  void data;
}
