import pino from 'pino';

let logger: pino.Logger | undefined;

export function createLogger(options: { verbose?: boolean; debug?: boolean }): pino.Logger {
  const level = options.debug ? 'debug' : options.verbose ? 'info' : 'warn';

  const isCI = !!process.env['CI'];

  const transport = isCI
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true },
      };

  logger = pino({ level, ...(transport ? { transport } : {}) });
  return logger;
}

export function getLogger(): pino.Logger {
  if (!logger) {
    logger = createLogger({});
  }
  return logger;
}
