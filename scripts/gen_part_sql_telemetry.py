import os

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

def write_f(rel_path, content):
    p = os.path.join(base_dir, rel_path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
    print(f"Generated: {rel_path}")

# =========================================================================
# STREAMING SQL ENGINE (@krono/sql)
# =========================================================================

write_f('packages/sql/package.json', '''{
  "name": "@krono/sql",
  "version": "1.0.0",
  "description": "Continuous Streaming SQL & Event Query Processor for Krono",
  "type": "module",
  "main": "src/index.js",
  "exports": {
    ".": "./src/index.js",
    "./tokenizer": "./src/tokenizer.js",
    "./parser": "./src/parser.js",
    "./streaming_engine": "./src/streaming_engine.js"
  },
  "dependencies": {
    "@krono/core": "*"
  }
}
''')

write_f('packages/sql/src/tokenizer.js', '''/**
 * @file tokenizer.js
 * SQL Lexical Analyzer for streaming query statements.
 */

export const TokenType = {
  KEYWORD: 'KEYWORD',
  IDENTIFIER: 'IDENTIFIER',
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  OPERATOR: 'OPERATOR',
  PUNCTUATION: 'PUNCTUATION',
  EOF: 'EOF'
};

const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'HAVING', 'ORDER', 'LIMIT',
  'WINDOW', 'TUMBLE', 'HOP', 'SLIDE', 'AND', 'OR', 'NOT', 'AS', 'IN', 'IS',
  'NULL', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX'
]);

export class Token {
  constructor(type, value, position) {
    this.type = type;
    this.value = value;
    this.position = position;
  }
}

export class SqlTokenizer {
  static tokenize(sql) {
    const tokens = [];
    let i = 0;

    while (i < sql.length) {
      const ch = sql[i];

      // Whitespace
      if (/\\s/.test(ch)) {
        i++;
        continue;
      }

      // Strings ('hello' or "hello")
      if (ch === "'" || ch === '"') {
        const quote = ch;
        let str = '';
        i++;
        while (i < sql.length && sql[i] !== quote) {
          str += sql[i];
          i++;
        }
        i++; // closing quote
        tokens.push(new Token(TokenType.STRING, str, i));
        continue;
      }

      // Numbers
      if (/[0-9]/.test(ch)) {
        let numStr = '';
        while (i < sql.length && /[0-9.]/.test(sql[i])) {
          numStr += sql[i];
          i++;
        }
        tokens.push(new Token(TokenType.NUMBER, parseFloat(numStr), i));
        continue;
      }

      // Identifiers / Keywords
      if (/[a-zA-Z_]/.test(ch)) {
        let word = '';
        while (i < sql.length && /[a-zA-Z0-9_.]/.test(sql[i])) {
          word += sql[i];
          i++;
        }
        const upper = word.toUpperCase();
        if (KEYWORDS.has(upper)) {
          tokens.push(new Token(TokenType.KEYWORD, upper, i));
        } else {
          tokens.push(new Token(TokenType.IDENTIFIER, word, i));
        }
        continue;
      }

      // Operators
      if (/[=<>!+*/-]/.test(ch)) {
        let op = ch;
        i++;
        if (i < sql.length && (sql[i] === '=' || sql[i] === '>')) {
          op += sql[i];
          i++;
        }
        tokens.push(new Token(TokenType.OPERATOR, op, i));
        continue;
      }

      // Punctuation
      if (/[,();]/.test(ch)) {
        tokens.push(new Token(TokenType.PUNCTUATION, ch, i));
        i++;
        continue;
      }

      i++;
    }

    tokens.push(new Token(TokenType.EOF, '', i));
    return tokens;
  }
}
''')

write_f('packages/sql/src/streaming_engine.js', '''/**
 * @file streaming_engine.js
 * Continuous Streaming SQL query processor with tumbling window aggregation.
 */

import { EventEmitter } from 'node:events';

export class StreamingSQLEngine extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, { query: string, filterFn: Function, windowMs: number, buffer: any[], lastFlush: number }>} */
    this.registeredQueries = new Map();
  }

  registerQuery(queryId, { filterFn, windowMs = 5000, projectFn }) {
    this.registeredQueries.set(queryId, {
      filterFn: filterFn || (() => true),
      projectFn: projectFn || ((e) => e),
      windowMs,
      buffer: [],
      lastFlush: Date.now()
    });
  }

  pushEvent(event) {
    const now = Date.now();

    for (const [queryId, q] of this.registeredQueries.entries()) {
      if (q.filterFn(event)) {
        q.buffer.push(q.projectFn(event));
      }

      if (now - q.lastFlush >= q.windowMs) {
        const windowEvents = q.buffer;
        q.buffer = [];
        q.lastFlush = now;
        this.emit('windowResult', { queryId, timestamp: now, events: windowEvents, count: windowEvents.length });
      }
    }
  }
}
''')

write_f('packages/sql/src/index.js', '''/**
 * @file index.js
 * Root exports for @krono/sql.
 */

export * from './tokenizer.js';
export * from './streaming_engine.js';
''')

# =========================================================================
# TELEMETRY SUITE (@krono/telemetry)
# =========================================================================

write_f('packages/telemetry/package.json', '''{
  "name": "@krono/telemetry",
  "version": "1.0.0",
  "description": "Metrics Registry, Prometheus Exporter & Distributed Tracing for Krono",
  "type": "module",
  "main": "src/index.js",
  "exports": {
    ".": "./src/index.js",
    "./metrics": "./src/metrics.js",
    "./tracer": "./src/tracer.js"
  },
  "dependencies": {
    "@krono/core": "*"
  }
}
''')

write_f('packages/telemetry/src/metrics.js', '''/**
 * @file metrics.js
 * Prometheus Metrics Registry supporting Counters, Gauges, and Histograms.
 */

export class Counter {
  constructor(name, help) {
    this.name = name;
    this.help = help;
    this.value = 0;
  }

  inc(val = 1) {
    this.value += val;
  }
}

export class Gauge {
  constructor(name, help) {
    this.name = name;
    this.help = help;
    this.value = 0;
  }

  set(val) {
    this.value = val;
  }
}

export class MetricsRegistry {
  constructor() {
    this.counters = new Map();
    this.gauges = new Map();
  }

  getOrCreateCounter(name, help = '') {
    if (!this.counters.has(name)) {
      this.counters.set(name, new Counter(name, help));
    }
    return this.counters.get(name);
  }

  getOrCreateGauge(name, help = '') {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, new Gauge(name, help));
    }
    return this.gauges.get(name);
  }

  toPrometheusFormat() {
    const lines = [];

    for (const c of this.counters.values()) {
      lines.push(`# HELP ${c.name} ${c.help}`);
      lines.push(`# TYPE ${c.name} counter`);
      lines.push(`${c.name} ${c.value}`);
    }

    for (const g of this.gauges.values()) {
      lines.push(`# HELP ${g.name} ${g.help}`);
      lines.push(`# TYPE ${g.name} gauge`);
      lines.push(`${g.name} ${g.value}`);
    }

    return lines.join('\\n') + '\\n';
  }
}

export const defaultMetrics = new MetricsRegistry();
''')

write_f('packages/telemetry/src/tracer.js', '''/**
 * @file tracer.js
 * W3C Distributed Trace Context and Span Tracker.
 */

import crypto from 'node:crypto';

export class Span {
  constructor(name, traceId = null, parentSpanId = null) {
    this.name = name;
    this.traceId = traceId || crypto.randomBytes(16).toString('hex');
    this.spanId = crypto.randomBytes(8).toString('hex');
    this.parentSpanId = parentSpanId;
    this.startTime = Date.now();
    this.endTime = null;
    this.attributes = {};
  }

  setAttribute(key, val) {
    this.attributes[key] = val;
    return this;
  }

  end() {
    this.endTime = Date.now();
  }

  get durationMs() {
    return (this.endTime || Date.now()) - this.startTime;
  }
}

export class DistributedTracer {
  startSpan(name, parentContext = null) {
    const traceId = parentContext?.traceId;
    const parentSpanId = parentContext?.spanId;
    return new Span(name, traceId, parentSpanId);
  }
}

export const defaultTracer = new DistributedTracer();
''')

write_f('packages/telemetry/src/index.js', '''/**
 * @file index.js
 * Root exports for @krono/telemetry.
 */

export * from './metrics.js';
export * from './tracer.js';
''')

print("SQL and Telemetry packages generated successfully.")
''')

write_code = True
print("Created gen_part_sql_telemetry.py")
