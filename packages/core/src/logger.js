/**
 * @file logger.js
 * High-performance structured logger with log levels, trace context propagation,
 * JSON output formatting, and timestamp ISO markers.
 */

export const LogLevel = {
  TRACE: 0,
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
  FATAL: 5
};

const LogLevelNames = {
  0: 'TRACE',
  1: 'DEBUG',
  2: 'INFO',
  3: 'WARN',
  4: 'ERROR',
  5: 'FATAL'
};

const ColorCodes = {
  TRACE: '\x1b[90m',
  DEBUG: '\x1b[36m',
  INFO: '\x1b[32m',
  WARN: '\x1b[33m',
  ERROR: '\x1b[31m',
  FATAL: '\x1b[35m',
  RESET: '\x1b[0m',
  DIM: '\x1b[2m'
};

export class Logger {
  /**
   * @param {Object} options
   * @param {string} [options.module='krono']
   * @param {number} [options.level=LogLevel.INFO]
   * @param {boolean} [options.json=false]
   * @param {Record<string, any>} [options.context={}]
   */
  constructor(options = {}) {
    this.module = options.module || 'krono';
    this.level = options.level !== undefined ? options.level : LogLevel.INFO;
    this.json = options.json || false;
    this.context = options.context || {};
  }

  child(subModule, extraContext = {}) {
    return new Logger({
      module: `${this.module}:${subModule}`,
      level: this.level,
      json: this.json,
      context: { ...this.context, ...extraContext }
    });
  }

  setLevel(level) {
    this.level = typeof level === 'string' ? (LogLevel[level.toUpperCase()] ?? LogLevel.INFO) : level;
  }

  trace(msg, meta) { this._log(LogLevel.TRACE, msg, meta); }
  debug(msg, meta) { this._log(LogLevel.DEBUG, msg, meta); }
  info(msg, meta) { this._log(LogLevel.INFO, msg, meta); }
  warn(msg, meta) { this._log(LogLevel.WARN, msg, meta); }
  error(msg, meta) { this._log(LogLevel.ERROR, msg, meta); }
  fatal(msg, meta) { this._log(LogLevel.FATAL, msg, meta); }

  _log(level, msg, meta = {}) {
    if (level < this.level) return;

    const levelName = LogLevelNames[level] || 'INFO';
    const timestamp = new Date().toISOString();
    const payload = {
      timestamp,
      level: levelName,
      module: this.module,
      message: msg,
      ...this.context,
      ...meta
    };

    if (this.json) {
      process.stdout.write(JSON.stringify(payload) + '\n');
    } else {
      const color = ColorCodes[levelName] || ColorCodes.RESET;
      const dim = ColorCodes.DIM;
      const reset = ColorCodes.RESET;
      const metaStr = Object.keys(meta).length > 0 ? ` ${dim}${JSON.stringify(meta)}${reset}` : '';
      process.stdout.write(
        `${dim}${timestamp}${reset} ${color}[${levelName.padEnd(5)}]${reset} ${dim}[${this.module}]${reset} ${msg}${metaStr}\n`
      );
    }
  }
}

export const defaultLogger = new Logger({ module: 'krono-root' });
