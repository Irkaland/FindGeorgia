import * as Sentry from "@sentry/node";

let initialized = false;

export function initMonitoring(config) {
  if (initialized || !config.errorMonitorDsn) return;
  Sentry.init({
    dsn: config.errorMonitorDsn,
    environment: config.env,
    release: config.deployVersion,
    sendDefaultPii: false,
    tracesSampleRate: Number(process.env.ERROR_MONITOR_TRACES_SAMPLE_RATE || 0.1),
  });
  initialized = true;
}

export function captureException(error, context = {}) {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (context.requestId) scope.setTag("request_id", context.requestId);
    if (context.path) scope.setTag("request_path", context.path);
    Sentry.captureException(error);
  });
}
