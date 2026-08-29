/**
 * @file chase_lev_deque.js
 * Chase-Lev Work-Stealing Deque algorithm.
 * Allows the owner thread to push and pop tasks from the bottom (LIFO order for cache locality),
 * while concurrent idle worker threads steal tasks from the top (FIFO order).
 */

export class ChaseLevDeque {
  /**
   * @param {number} [initialCapacity=64]
   */
  constructor(initialCapacity = 64) {
    this.capacity = initialCapacity;
    this.buffer = new Array(initialCapacity);
    this.top = 0;
    this.bottom = 0;
  }

  get size() {
    return Math.max(0, this.bottom - this.top);
  }

  get isEmpty() {
    return this.bottom <= this.top;
  }

  /**
   * Pushes a task to the bottom of the deque (called only by the owner thread).
   * @param {any} task
   */
  push(task) {
    const b = this.bottom;
    const t = this.top;
    const size = b - t;

    if (size >= this.capacity - 1) {
      // Resize buffer
      const newCapacity = this.capacity * 2;
      const newBuffer = new Array(newCapacity);
      for (let i = t; i < b; i++) {
        newBuffer[i % newCapacity] = this.buffer[i % this.capacity];
      }
      this.buffer = newBuffer;
      this.capacity = newCapacity;
    }

    this.buffer[b % this.capacity] = task;
    this.bottom = b + 1;
  }

  /**
   * Pops a task from the bottom of the deque (called only by the owner thread, LIFO).
   * @returns {any|undefined}
   */
  pop() {
    let b = this.bottom - 1;
    this.bottom = b;

    const t = this.top;
    const size = b - t;

    if (size < 0) {
      this.bottom = t;
      return undefined;
    }

    const task = this.buffer[b % this.capacity];
    this.buffer[b % this.capacity] = undefined;

    if (size > 0) {
      return task;
    }

    // size == 0: potential race with concurrent stealer
    if (this.top === t) {
      this.top = t + 1;
      this.bottom = t + 1;
      return task;
    } else {
      // Stealer won race
      this.bottom = t + 1;
      return undefined;
    }
  }

  /**
   * Steals a task from the top of the deque (called by other idle threads, FIFO).
   * @returns {any|undefined}
   */
  steal() {
    const t = this.top;
    const b = this.bottom;
    const size = b - t;

    if (size <= 0) {
      return undefined;
    }

    const task = this.buffer[t % this.capacity];
    this.top = t + 1;
    return task;
  }
}
