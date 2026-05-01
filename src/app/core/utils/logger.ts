/**
 * Structured Logger for Session Management
 * Provides consistent logging with context, level, timestamp, and data
 */

import { environment } from '../../../environments/environment';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  context: string;
  message: string;
  data?: any;
  error?: Error;
}

/**
 * Internal log buffer for aggregation and batch sending to observability services
 */
let logBuffer: LogEntry[] = [];

/**
 * Check if logging is enabled based on environment and level
 */
function shouldLog(level: LogLevel): boolean {
  if (!environment.observability?.enabled) {
    return false;
  }

  // In development with authDebugConsole, log everything
  if (environment.authDebugConsole) {
    return true;
  }

  // In production, log warn and error only
  return level === 'warn' || level === 'error';
}

/**
 * Send log to observability service (Sentry)
 */
function sendToObservability(entry: LogEntry): void {
  try {
    // Check if Sentry is available
    const Sentry = (window as any).__SENTRY__;
    if (!Sentry) {
      return;
    }

    const message = `[${entry.context}] ${entry.message}`;

    if (entry.level === 'error' || entry.level === 'warn') {
      if (entry.error) {
        Sentry.captureException(entry.error, {
          level: entry.level === 'error' ? 'error' : 'warning',
          tags: { context: entry.context },
          extra: entry.data
        });
      } else {
        Sentry.captureMessage(message, {
          level: entry.level === 'error' ? 'error' : 'warning',
          tags: { context: entry.context },
          extra: entry.data
        });
      }
    }
  } catch (e) {
    // Silently fail if Sentry is not available
  }
}

/**
 * Format log entry for console output
 */
function formatLogEntry(entry: LogEntry): [string, any] {
  const timestamp = entry.timestamp.toISOString();
  const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.context}]`;
  const message = `${prefix} ${entry.message}`;
  return [message, entry.data || {}];
}

/**
 * Create a logger instance for a specific context
 * @param context - Namespace (e.g., "SessionManager", "SessionStorage")
 */
export const createLogger = (context: string) => ({
  /**
   * Debug level - detailed information, disabled in production
   */
  debug: (message: string, data?: any): void => {
    if (!shouldLog('debug')) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level: 'debug',
      context,
      message,
      data
    };

    logBuffer.push(entry);

    if (environment.authDebugConsole) {
      const [formattedMessage, formattedData] = formatLogEntry(entry);
      console.debug(formattedMessage, formattedData);
    }
  },

  /**
   * Info level - general information about session operations
   */
  info: (message: string, data?: any): void => {
    if (!shouldLog('info')) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level: 'info',
      context,
      message,
      data
    };

    logBuffer.push(entry);

    if (environment.authDebugConsole) {
      const [formattedMessage, formattedData] = formatLogEntry(entry);
      console.info(formattedMessage, formattedData);
    }
  },

  /**
   * Warning level - unexpected conditions that don't prevent operation
   */
  warn: (message: string, data?: any): void => {
    if (!shouldLog('warn')) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level: 'warn',
      context,
      message,
      data
    };

    logBuffer.push(entry);

    const [formattedMessage, formattedData] = formatLogEntry(entry);
    console.warn(formattedMessage, formattedData);

    sendToObservability(entry);
  },

  /**
   * Error level - critical conditions that prevent operation
   */
  error: (message: string, error?: Error | unknown, additionalData?: any): void => {
    if (!shouldLog('error')) {
      return;
    }

    const errorObj = error instanceof Error ? error : new Error(String(error));

    const entry: LogEntry = {
      timestamp: new Date(),
      level: 'error',
      context,
      message,
      error: errorObj,
      data: additionalData
    };

    logBuffer.push(entry);

    const [formattedMessage, formattedData] = formatLogEntry(entry);
    console.error(formattedMessage, errorObj, formattedData);

    sendToObservability(entry);
  }
});

/**
 * Get all log entries from buffer
 */
export const getLogBuffer = (): LogEntry[] => {
  return [...logBuffer];
};

/**
 * Clear log buffer
 */
export const clearLogBuffer = (): void => {
  logBuffer = [];
};

/**
 * Get logs for a specific context
 */
export const getLogsForContext = (context: string): LogEntry[] => {
  return logBuffer.filter((entry) => entry.context === context);
};

/**
 * Get logs of a specific level
 */
export const getLogsByLevel = (level: LogLevel): LogEntry[] => {
  return logBuffer.filter((entry) => entry.level === level);
};

/**
 * Export logs in JSON format (for debugging)
 */
export const exportLogsAsJson = (): string => {
  return JSON.stringify(logBuffer, null, 2);
};
