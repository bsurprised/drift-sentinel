import pino from 'pino';

let defaultLogger: pino.Logger | undefined;

export function createLogger(
  options: { verbose?: boolean; debug?: boolean; level?: string; pretty?: boolean } = {},
): pino.Logger {
  const level = options.level ?? (options.debug ? 'debug' : options.verbose ? 'info' : 'warn');
  const isCI = !!process.env['CI'];
  const usePretty = options.pretty !== undefined ? options.pretty : !isCI;
  const transport = usePretty ? { target: 'pino-pretty', options: { colorize: true } } : undefined;
  // No module-global mutation here — callers must use setDefaultLogger if they want a global.
  return pino({ level, ...(transport ? { transport } : {}) });
}

export function setDefaultLogger(l: pino.Logger): void {
  defaultLogger = l;
}

export function getLogger(): pino.Logger {
  if (!defaultLogger) defaultLogger = createLogger({});
  return defaultLogger;
}
