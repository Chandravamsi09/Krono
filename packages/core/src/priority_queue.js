/**
 * @file priority_queue.js
 * Binary Heap Priority Queue implementation with configurable comparator,
 * O(log N) insertion/extraction, and in-place element removal.
 */

export class PriorityQueue {
  /**
   * @param {(a: any, b: any) => number} [comparator] Comparator function (default Min-Heap: a < b gives negative)
   */
  constructor(comparator = (a, b) => (a < b ? -1 : a > b ? 1 : 0)) {
    this.heap = [];
    this.comparator = comparator;
  }

  get length() {
    return this.heap.length;
  }

  get size() {
    return this.heap.length;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  /**
   * Pushes one or more items into the priority queue.
   * @param {...any} items
   */
  push(...items) {
    for (const item of items) {
      this.heap.push(item);
      this._siftUp(this.heap.length - 1);
    }
  }

  /**
   * Peeks the highest priority item without removing it.
   * @returns {any|undefined}
   */
  peek() {
    return this.heap.length > 0 ? this.heap[0] : undefined;
  }

  /**
   * Pops and returns the highest priority item.
   * @returns {any|undefined}
   */
  pop() {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this._siftDown(0);
    }
    return top;
  }

  /**
   * Removes an element matching predicate.
   * @param {(item: any) => boolean} predicate
   * @returns {any|undefined}
   */
  removeMatching(predicate) {
    const idx = this.heap.findIndex(predicate);
    if (idx === -1) return undefined;
    const removed = this.heap[idx];
    const bottom = this.heap.pop();
    if (idx < this.heap.length) {
      this.heap[idx] = bottom;
      this._siftDown(idx);
      this._siftUp(idx);
    }
    return removed;
  }

  toArray() {
    return [...this.heap];
  }

  clear() {
    this.heap = [];
  }

  _siftUp(idx) {
    while (idx > 0) {
      const parentIdx = (idx - 1) >>> 1;
      if (this.comparator(this.heap[idx], this.heap[parentIdx]) < 0) {
        this._swap(idx, parentIdx);
        idx = parentIdx;
      } else {
        break;
      }
    }
  }

  _siftDown(idx) {
    const length = this.heap.length;
    const half = length >>> 1;
    while (idx < half) {
      const left = (idx << 1) + 1;
      const right = left + 1;
      let best = left;

      if (right < length && this.comparator(this.heap[right], this.heap[left]) < 0) {
        best = right;
      }

      if (this.comparator(this.heap[best], this.heap[idx]) < 0) {
        this._swap(idx, best);
        idx = best;
      } else {
        break;
      }
    }
  }

  _swap(i, j) {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }
}
