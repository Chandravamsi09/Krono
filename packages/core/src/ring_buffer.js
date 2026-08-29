/**
 * @file ring_buffer.js
 * High-throughput bounded circular RingBuffer for zero-allocation
 * producer-consumer queues and network frame batching.
 */

export class RingBuffer {
  /**
   * @param {number} capacity Fixed capacity (must be positive power of 2 for fast bitwise masking, or positive integer)
   */
  constructor(capacity = 1024) {
    if (capacity <= 0) {
      throw new RangeError('RingBuffer capacity must be > 0');
    }
    // Round up to power of 2 for bitwise optimization if possible
    this.capacity = capacity;
    this.isPowerOfTwo = (capacity & (capacity - 1)) === 0;
    this.mask = this.isPowerOfTwo ? capacity - 1 : 0;
    
    this.buffer = new Array(capacity);
    this.head = 0; // Read position
    this.tail = 0; // Write position
    this.size = 0;
  }

  /**
   * Pushes an item to the buffer.
   * @param {any} item
   * @returns {boolean} True if pushed, false if buffer is full
   */
  push(item) {
    if (this.size >= this.capacity) {
      return false;
    }
    this.buffer[this.tail] = item;
    if (this.isPowerOfTwo) {
      this.tail = (this.tail + 1) & this.mask;
    } else {
      this.tail = (this.tail + 1) % this.capacity;
    }
    this.size++;
    return true;
  }

  /**
   * Pushes an item, overwriting oldest item if buffer is full.
   * @param {any} item
   * @returns {any|undefined} The overwritten item, if any
   */
  pushOverwrite(item) {
    let evicted = undefined;
    if (this.size >= this.capacity) {
      evicted = this.shift();
    }
    this.push(item);
    return evicted;
  }

  /**
   * Removes and returns the oldest item from the buffer.
   * @returns {any|undefined} Oldest item, or undefined if empty
   */
  shift() {
    if (this.size === 0) {
      return undefined;
    }
    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined; // GC reference
    if (this.isPowerOfTwo) {
      this.head = (this.head + 1) & this.mask;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
    this.size--;
    return item;
  }

  /**
   * Peeks at the front item without removing it.
   * @returns {any|undefined}
   */
  peek() {
    if (this.size === 0) return undefined;
    return this.buffer[this.head];
  }

  /**
   * Drains up to `maxItems` into an array.
   * @param {number} [maxItems=Infinity]
   * @returns {any[]}
   */
  drain(maxItems = Infinity) {
    const limit = Math.min(this.size, maxItems);
    const result = new Array(limit);
    for (let i = 0; i < limit; i++) {
      result[i] = this.shift();
    }
    return result;
  }

  get length() {
    return this.size;
  }

  get isFull() {
    return this.size === this.capacity;
  }

  get isEmpty() {
    return this.size === 0;
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) {
      this.buffer[i] = undefined;
    }
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }
}
