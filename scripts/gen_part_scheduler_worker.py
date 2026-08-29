import os

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

def write_f(rel_path, content):
    p = os.path.join(base_dir, rel_path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
    print(f"Generated: {rel_path}")

# =========================================================================
# SCHEDULER EXTENSIONS
# =========================================================================

write_f('packages/scheduler/src/cron_parser.js', '''/**
 * @file cron_parser.js
 * High-performance 5/6-field Crontab parser and next-occurrence evaluator.
 */

export class CronExpression {
  /**
   * @param {string} expression e.g. "0 0 * * *" or "* /5 * * * *"
   */
  constructor(expression) {
    this.expression = expression.trim();
    this.fields = this._parseFields(this.expression);
  }

  _parseFields(expr) {
    const parts = expr.split(/\s+/);
    if (parts.length !== 5 && parts.length !== 6) {
      throw new Error(`Invalid cron format: expected 5 or 6 fields, got ${parts.length}`);
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts.length === 5 ? parts : parts.slice(1);

    return {
      minute: this._parseField(minute, 0, 59),
      hour: this._parseField(hour, 0, 23),
      dayOfMonth: this._parseField(dayOfMonth, 1, 31),
      month: this._parseField(month, 1, 12),
      dayOfWeek: this._parseField(dayOfWeek, 0, 6)
    };
  }

  _parseField(fieldStr, min, max) {
    const matches = new Set();
    if (fieldStr === '*') {
      for (let i = min; i <= max; i++) matches.add(i);
      return matches;
    }

    const subparts = fieldStr.split(',');
    for (const sub of subparts) {
      if (sub.includes('/')) {
        const [rangePart, stepPart] = sub.split('/');
        const step = parseInt(stepPart, 10);
        const start = rangePart === '*' ? min : parseInt(rangePart, 10);
        for (let i = start; i <= max; i += step) matches.add(i);
      } else if (sub.includes('-')) {
        const [startStr, endStr] = sub.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        for (let i = start; i <= end; i++) matches.add(i);
      } else {
        matches.add(parseInt(sub, 10));
      }
    }

    return matches;
  }

  next(fromDate = new Date()) {
    const cur = new Date(fromDate.getTime() + 60000);
    cur.setSeconds(0);
    cur.setMilliseconds(0);

    for (let i = 0; i < 525600; i++) { // Search up to 1 year ahead
      const min = cur.getMinutes();
      const hour = cur.getHours();
      const dom = cur.getDate();
      const mon = cur.getMonth() + 1;
      const dow = cur.getDay();

      if (
        this.fields.month.has(mon) &&
        this.fields.dayOfMonth.has(dom) &&
        this.fields.dayOfWeek.has(dow) &&
        this.fields.hour.has(hour) &&
        this.fields.minute.has(min)
      ) {
        return cur;
      }
      cur.setTime(cur.getTime() + 60000);
    }

    return null;
  }
}
''')

write_f('packages/scheduler/src/backpressure_controller.js', '''/**
 * @file backpressure_controller.js
 * Proportional-Integral-Derivative (PID) Backpressure Controller for DAG dispatch rate.
 */

export class BackpressureController {
  /**
   * @param {Object} [options]
   * @param {number} [options.targetLatencyMs=50] Target worker task queue delay
   * @param {number} [options.kp=0.6] Proportional gain
   * @param {number} [options.ki=0.2] Integral gain
   * @param {number} [options.kd=0.1] Derivative gain
   */
  constructor(options = {}) {
    this.targetLatencyMs = options.targetLatencyMs || 50;
    this.kp = options.kp || 0.6;
    this.ki = options.ki || 0.2;
    this.kd = options.kd || 0.1;

    this.integral = 0;
    this.lastError = 0;
    this.currentDispatchRate = 100; // Tasks/sec
  }

  update(measuredLatencyMs) {
    const error = this.targetLatencyMs - measuredLatencyMs;
    this.integral += error;
    const derivative = error - this.lastError;
    this.lastError = error;

    const adjustment = this.kp * error + this.ki * this.integral + this.kd * derivative;
    this.currentDispatchRate = Math.max(1, Math.min(10000, this.currentDispatchRate + adjustment));
    return this.currentDispatchRate;
  }
}
''')

# =========================================================================
# WORKER EXTENSIONS
# =========================================================================

write_f('packages/worker/src/cgroup_monitor.js', '''/**
 * @file cgroup_monitor.js
 * Process Resource & Memory Watchdog.
 */

export class CgroupMonitor {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxMemoryRssBytes=1073741824] 1 GB RSS limit
   * @param {number} [options.maxCpuPercent=90] 90% CPU limit
   */
  constructor(options = {}) {
    this.maxMemoryRssBytes = options.maxMemoryRssBytes || 1024 * 1024 * 1024;
    this.maxCpuPercent = options.maxCpuPercent || 90;
  }

  sampleUsage() {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();

    return {
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
      externalBytes: mem.external,
      cpuUserMicros: cpu.user,
      cpuSystemMicros: cpu.system,
      isMemoryExceeded: mem.rss > this.maxMemoryRssBytes
    };
  }
}
''')

print("Scheduler and Worker additions generated successfully.")
''')

write_code = True
print("Created gen_part_scheduler_worker.py")
