import { getRuntimeConfig } from './config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogFields = Record<string, unknown>;

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  constructor(private readonly defaultFields: LogFields = {}) {}

  child(fields: LogFields): Logger {
    return new Logger({
      ...this.defaultFields,
      ...fields,
    });
  }

  debug(message: string, fields: LogFields = {}): void {
    this.write('debug', message, fields);
  }

  info(message: string, fields: LogFields = {}): void {
    this.write('info', message, fields);
  }

  warn(message: string, fields: LogFields = {}): void {
    this.write('warn', message, fields);
  }

  error(message: string, fields: LogFields = {}): void {
    this.write('error', message, fields);
  }

  private write(level: LogLevel, message: string, fields: LogFields): void {
    const { logLevel } = getRuntimeConfig();
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[logLevel]) {
      return;
    }

    const payload = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.defaultFields,
      ...fields,
    });

    if (level === 'error') {
      console.error(payload);
      return;
    }

    if (level === 'warn') {
      console.warn(payload);
      return;
    }

    console.log(payload);
  }
}

export const logger = new Logger({
  service: 'blind-box-backend',
});
