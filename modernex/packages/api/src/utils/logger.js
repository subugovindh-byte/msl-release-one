import pino from 'pino';
import { config } from '../config.js';

const transport = config.isDev()
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: true,
      },
    }
  : undefined;

export const logger = pino({
  level: config.logLevel || 'warn', // Minimal logging by default
  transport,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  // Redact sensitive data
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'token', 'secret'],
    remove: true,
  },
});
