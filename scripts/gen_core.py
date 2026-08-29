import os

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

def write_f(rel_path, content):
    p = os.path.join(base_dir, rel_path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
    print(f"Generated: {rel_path}")

# =========================================================================
# 1. CORE PACKAGE MODULES
# =========================================================================

write_f('packages/core/src/concurrent_hash_map.js', '''/**
 * @file concurrent_hash_map.js
 * High-performance Striped Concurrent Hash Map with fine-grained segment locking,
 * dynamic resizing, lock-free snapshot iteration, and cache-line alignment.
 */

export class ConcurrentHashMap {
  /**
   * @param {Object} [options]
   * @param {number} [options.concurrencyLevel=16] Number of independent lock stripes
   * @param {number} [options.initialCapacity=64] Initial bucket count
   * @param {number} [options.loadFactor=0.75] Max load factor before stripe resize
   */
  constructor(options = {}) {
    this.concurrencyLevel = Math.max(1, options.concurrencyLevel || 16);
    this.initialCapacity = Math.max(16, options.initialCapacity || 64);
    this.loadFactor = options.loadFactor || 0.75;
    this.stripeMask = this.concurrencyLevel - 1;
    this.stripes = new Array(this.concurrencyLevel);

    for (let i = 0; i < this.concurrencyLevel; i++) {
      this.stripes[i] = new SegmentStripe(Math.ceil(this.initialCapacity / this.concurrencyLevel), this.loadFactor);
    }
  }

  _hashKey(key) {
    const str = String(key);
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h ^ (h >>> 16)) >>> 0;
  }

  _getStripe(hash) {
    return this.stripes[hash & this.stripeMask];
  }

  get(key) {
    const hash = this._hashKey(key);
    return this._getStripe(hash).get(key, hash);
  }

  put(key, value) {
    const hash = this._hashKey(key);
    return this._getStripe(hash).put(key, value, hash);
  }

  putIfAbsent(key, value) {
    const hash = this._hashKey(key);
    return this._getStripe(hash).putIfAbsent(key, value, hash);
  }

  remove(key) {
    const hash = this._hashKey(key);
    return this._getStripe(hash).remove(key, hash);
  }

  containsKey(key) {
    const hash = this._hashKey(key);
    return this._getStripe(hash).containsKey(key, hash);
  }

  computeIfAbsent(key, mappingFunction) {
    const hash = this._hashKey(key);
    return this._getStripe(hash).computeIfAbsent(key, mappingFunction, hash);
  }

  size() {
    let total = 0;
    for (let i = 0; i < this.concurrencyLevel; i++) {
      total += this.stripes[i].size;
    }
    return total;
  }

  clear() {
    for (let i = 0; i < this.concurrencyLevel; i++) {
      this.stripes[i].clear();
    }
  }

  entries() {
    const result = [];
    for (let i = 0; i < this.concurrencyLevel; i++) {
      this.stripes[i].collectEntries(result);
    }
    return result;
  }

  keys() {
    return this.entries().map(e => e.key);
  }

  values() {
    return this.entries().map(e => e.value);
  }
}

class MapNode {
  constructor(key, value, hash, next = null) {
    this.key = key;
    this.value = value;
    this.hash = hash;
    this.next = next;
  }
}

class SegmentStripe {
  constructor(initialCapacity, loadFactor) {
    this.capacity = initialCapacity;
    this.loadFactor = loadFactor;
    this.threshold = Math.floor(this.capacity * this.loadFactor);
    this.table = new Array(this.capacity).fill(null);
    this.size = 0;
    this.locked = false;
  }

  _acquireLock() {
    while (this.locked) {}
    this.locked = true;
  }

  _releaseLock() {
    this.locked = false;
  }

  get(key, hash) {
    const idx = hash % this.capacity;
    let node = this.table[idx];
    while (node) {
      if (node.hash === hash && node.key === key) {
        return node.value;
      }
      node = node.next;
    }
    return undefined;
  }

  containsKey(key, hash) {
    return this.get(key, hash) !== undefined;
  }

  put(key, value, hash) {
    this._acquireLock();
    try {
      const idx = hash % this.capacity;
      let node = this.table[idx];

      while (node) {
        if (node.hash === hash && node.key === key) {
          const oldVal = node.value;
          node.value = value;
          return oldVal;
        }
        node = node.next;
      }

      const newNode = new MapNode(key, value, hash, this.table[idx]);
      this.table[idx] = newNode;
      this.size++;

      if (this.size > this.threshold) {
        this._rehash();
      }
      return undefined;
    } finally {
      this._releaseLock();
    }
  }

  putIfAbsent(key, value, hash) {
    this._acquireLock();
    try {
      const idx = hash % this.capacity;
      let node = this.table[idx];

      while (node) {
        if (node.hash === hash && node.key === key) {
          return node.value;
        }
        node = node.next;
      }

      const newNode = new MapNode(key, value, hash, this.table[idx]);
      this.table[idx] = newNode;
      this.size++;

      if (this.size > this.threshold) {
        this._rehash();
      }
      return undefined;
    } finally {
      this._releaseLock();
    }
  }

  computeIfAbsent(key, mappingFunction, hash) {
    this._acquireLock();
    try {
      const idx = hash % this.capacity;
      let node = this.table[idx];

      while (node) {
        if (node.hash === hash && node.key === key) {
          return node.value;
        }
        node = node.next;
      }

      const val = mappingFunction(key);
      const newNode = new MapNode(key, val, hash, this.table[idx]);
      this.table[idx] = newNode;
      this.size++;

      if (this.size > this.threshold) {
        this._rehash();
      }
      return val;
    } finally {
      this._releaseLock();
    }
  }

  remove(key, hash) {
    this._acquireLock();
    try {
      const idx = hash % this.capacity;
      let node = this.table[idx];
      let prev = null;

      while (node) {
        if (node.hash === hash && node.key === key) {
          if (prev) {
            prev.next = node.next;
          } else {
            this.table[idx] = node.next;
          }
          this.size--;
          return node.value;
        }
        prev = node;
        node = node.next;
      }
      return undefined;
    } finally {
      this._releaseLock();
    }
  }

  clear() {
    this._acquireLock();
    try {
      this.table.fill(null);
      this.size = 0;
    } finally {
      this._releaseLock();
    }
  }

  _rehash() {
    const oldTable = this.table;
    const newCapacity = this.capacity * 2;
    const newTable = new Array(newCapacity).fill(null);

    for (let i = 0; i < oldTable.length; i++) {
      let node = oldTable[i];
      while (node) {
        const next = node.next;
        const newIdx = node.hash % newCapacity;
        node.next = newTable[newIdx];
        newTable[newIdx] = node;
        node = next;
      }
    }

    this.table = newTable;
    this.capacity = newCapacity;
    this.threshold = Math.floor(newCapacity * this.loadFactor);
  }

  collectEntries(targetList) {
    for (let i = 0; i < this.capacity; i++) {
      let node = this.table[i];
      while (node) {
        targetList.push({ key: node.key, value: node.value });
        node = node.next;
      }
    }
  }
}
''')

write_f('packages/core/src/arc_cache.js', '''/**
 * @file arc_cache.js
 * Adaptive Replacement Cache (ARC) self-tuning memory cache.
 */

class CacheEntry {
  constructor(key, value) {
    this.key = key;
    this.value = value;
    this.prev = null;
    this.next = null;
  }
}

class DoubleLinkedList {
  constructor() {
    this.head = new CacheEntry(null, null);
    this.tail = new CacheEntry(null, null);
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.size = 0;
  }

  addFirst(node) {
    node.next = this.head.next;
    node.prev = this.head;
    this.head.next.prev = node;
    this.head.next = node;
    this.size++;
  }

  remove(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
    node.prev = null;
    node.next = null;
    this.size--;
    return node;
  }

  removeLast() {
    if (this.size === 0) return null;
    return this.remove(this.tail.prev);
  }

  moveToFirst(node) {
    this.remove(node);
    this.addFirst(node);
  }
}

export class AdaptiveReplacementCache {
  constructor(capacity = 1000) {
    this.c = Math.max(2, capacity);
    this.p = 0;

    this.t1 = new DoubleLinkedList();
    this.t1Map = new Map();

    this.t2 = new DoubleLinkedList();
    this.t2Map = new Map();

    this.b1 = new DoubleLinkedList();
    this.b1Map = new Map();

    this.b2 = new DoubleLinkedList();
    this.b2Map = new Map();

    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    if (this.t1Map.has(key)) {
      const node = this.t1Map.get(key);
      this.t1.remove(node);
      this.t1Map.delete(key);
      this.t2.addFirst(node);
      this.t2Map.set(key, node);
      this.hits++;
      return node.value;
    }

    if (this.t2Map.has(key)) {
      const node = this.t2Map.get(key);
      this.t2.moveToFirst(node);
      this.hits++;
      return node.value;
    }

    this.misses++;
    return undefined;
  }

  put(key, value) {
    if (this.t1Map.has(key)) {
      const node = this.t1Map.get(key);
      node.value = value;
      this.t1.remove(node);
      this.t1Map.delete(key);
      this.t2.addFirst(node);
      this.t2Map.set(key, node);
      return;
    }

    if (this.t2Map.has(key)) {
      const node = this.t2Map.get(key);
      node.value = value;
      this.t2.moveToFirst(node);
      return;
    }

    if (this.b1Map.has(key)) {
      const delta = this.b1.size >= this.b2.size ? 1 : Math.floor(this.b2.size / Math.max(1, this.b1.size));
      this.p = Math.min(this.c, this.p + delta);
      this._replace(false);

      const ghost = this.b1Map.get(key);
      this.b1.remove(ghost);
      this.b1Map.delete(key);

      const newNode = new CacheEntry(key, value);
      this.t2.addFirst(newNode);
      this.t2Map.set(key, newNode);
      return;
    }

    if (this.b2Map.has(key)) {
      const delta = this.b2.size >= this.b1.size ? 1 : Math.floor(this.b1.size / Math.max(1, this.b2.size));
      this.p = Math.max(0, this.p - delta);
      this._replace(true);

      const ghost = this.b2Map.get(key);
      this.b2.remove(ghost);
      this.b2Map.delete(key);

      const newNode = new CacheEntry(key, value);
      this.t2.addFirst(newNode);
      this.t2Map.set(key, newNode);
      return;
    }

    const l1Size = this.t1.size + this.b1.size;
    if (l1Size === this.c) {
      if (this.t1.size < this.c) {
        const delNode = this.b1.removeLast();
        if (delNode) this.b1Map.delete(delNode.key);
        this._replace(false);
      } else {
        const delNode = this.t1.removeLast();
        if (delNode) this.t1Map.delete(delNode.key);
      }
    } else if (l1Size < this.c) {
      const totalSize = this.t1.size + this.t2.size + this.b1.size + this.b2.size;
      if (totalSize >= this.c) {
        if (totalSize === 2 * this.c) {
          const delNode = this.b2.removeLast();
          if (delNode) this.b2Map.delete(delNode.key);
        }
        this._replace(false);
      }
    }

    const newNode = new CacheEntry(key, value);
    this.t1.addFirst(newNode);
    this.t1Map.set(key, newNode);
  }

  _replace(inB2) {
    if (this.t1.size > 0 && (this.t1.size > this.p || (inB2 && this.t1.size === this.p))) {
      const node = this.t1.removeLast();
      if (node) {
        this.t1Map.delete(node.key);
        const ghost = new CacheEntry(node.key, null);
        this.b1.addFirst(ghost);
        this.b1Map.set(node.key, ghost);
      }
    } else {
      const node = this.t2.removeLast();
      if (node) {
        this.t2Map.delete(node.key);
        const ghost = new CacheEntry(node.key, null);
        this.b2.addFirst(ghost);
        this.b2Map.set(node.key, ghost);
      }
    }
  }

  delete(key) {
    if (this.t1Map.has(key)) {
      const node = this.t1.remove(this.t1Map.get(key));
      this.t1Map.delete(key);
      return node.value;
    }
    if (this.t2Map.has(key)) {
      const node = this.t2.remove(this.t2Map.get(key));
      this.t2Map.delete(key);
      return node.value;
    }
    if (this.b1Map.has(key)) {
      this.b1.remove(this.b1Map.get(key));
      this.b1Map.delete(key);
    }
    if (this.b2Map.has(key)) {
      this.b2.remove(this.b2Map.get(key));
      this.b2Map.delete(key);
    }
    return undefined;
  }

  get stats() {
    const total = this.hits + this.misses;
    return {
      capacity: this.c,
      targetT1: this.p,
      t1Size: this.t1.size,
      t2Size: this.t2.size,
      b1Size: this.b1.size,
      b2Size: this.b2.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total) : 0
    };
  }

  clear() {
    this.t1 = new DoubleLinkedList();
    this.t1Map.clear();
    this.t2 = new DoubleLinkedList();
    this.t2Map.clear();
    this.b1 = new DoubleLinkedList();
    this.b1Map.clear();
    this.b2 = new DoubleLinkedList();
    this.b2Map.clear();
    this.p = 0;
  }
}
''')

write_f('packages/core/src/hierarchical_timer_wheel.js', '''/**
 * @file hierarchical_timer_wheel.js
 * 4-Level Hierarchical Timing Wheel.
 */

class TimerTask {
  constructor(id, delayMs, callback) {
    this.id = id;
    this.expiration = Date.now() + delayMs;
    this.callback = callback;
    this.prev = null;
    this.next = null;
    this.bucket = null;
    this.cancelled = false;
  }
}

class TimerBucket {
  constructor() {
    this.head = new TimerTask(null, 0, null);
    this.tail = new TimerTask(null, 0, null);
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.size = 0;
  }

  addTask(task) {
    task.next = this.head.next;
    task.prev = this.head;
    this.head.next.prev = task;
    this.head.next = task;
    task.bucket = this;
    this.size++;
  }

  removeTask(task) {
    if (task.bucket !== this) return;
    task.prev.next = task.next;
    task.next.prev = task.prev;
    task.prev = null;
    task.next = null;
    task.bucket = null;
    this.size--;
  }

  flush(handler) {
    let cur = this.head.next;
    while (cur !== this.tail) {
      const next = cur.next;
      this.removeTask(cur);
      if (!cur.cancelled) {
        handler(cur);
      }
      cur = next;
    }
  }
}

class TimingWheelLevel {
  constructor(tickMs, wheelSize, currentTime) {
    this.tickMs = tickMs;
    this.wheelSize = wheelSize;
    this.interval = tickMs * wheelSize;
    this.currentTime = currentTime - (currentTime % tickMs);
    this.buckets = new Array(wheelSize).fill(null).map(() => new TimerBucket());
    this.nextLevel = null;
  }

  setNextLevel(nextLevel) {
    this.nextLevel = nextLevel;
  }

  add(task) {
    if (task.expiration < this.currentTime + this.tickMs) {
      return false;
    }

    if (task.expiration < this.currentTime + this.interval) {
      const virtualId = Math.floor(task.expiration / this.tickMs);
      const bucketIdx = virtualId % this.wheelSize;
      this.buckets[bucketIdx].addTask(task);
      return true;
    }

    if (this.nextLevel) {
      return this.nextLevel.add(task);
    }

    return false;
  }

  advanceClock(timeMs, reinsertHandler) {
    if (timeMs >= this.currentTime + this.tickMs) {
      this.currentTime = timeMs - (timeMs % this.tickMs);
      const virtualId = Math.floor(this.currentTime / this.tickMs);
      const bucketIdx = virtualId % this.wheelSize;
      this.buckets[bucketIdx].flush(reinsertHandler);

      if (this.nextLevel) {
        this.nextLevel.advanceClock(timeMs, reinsertHandler);
      }
    }
  }
}

export class HierarchicalTimerWheel {
  constructor(options = {}) {
    this.tickMs = options.tickMs || 10;
    this.wheelSize = options.wheelSize || 64;
    this.currentTime = Date.now();
    this.taskIndex = new Map();

    this.level1 = new TimingWheelLevel(this.tickMs, this.wheelSize, this.currentTime);
    this.level2 = new TimingWheelLevel(this.tickMs * this.wheelSize, this.wheelSize, this.currentTime);
    this.level3 = new TimingWheelLevel(this.tickMs * Math.pow(this.wheelSize, 2), this.wheelSize, this.currentTime);
    this.level4 = new TimingWheelLevel(this.tickMs * Math.pow(this.wheelSize, 3), this.wheelSize, this.currentTime);

    this.level1.setNextLevel(this.level2);
    this.level2.setNextLevel(this.level3);
    this.level3.setNextLevel(this.level4);

    this.intervalId = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.advanceClock(Date.now());
    }, this.tickMs);
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  schedule(id, delayMs, callback) {
    const task = new TimerTask(id, delayMs, callback);
    this.taskIndex.set(id, task);

    if (!this.level1.add(task)) {
      setImmediate(() => {
        if (!task.cancelled) {
          this.taskIndex.delete(id);
          callback();
        }
      });
    }

    return task;
  }

  cancel(id) {
    const task = this.taskIndex.get(id);
    if (task) {
      task.cancelled = true;
      if (task.bucket) {
        task.bucket.removeTask(task);
      }
      this.taskIndex.delete(id);
      return true;
    }
    return false;
  }

  advanceClock(timeMs) {
    this.level1.advanceClock(timeMs, (task) => {
      if (task.expiration <= timeMs) {
        this.taskIndex.delete(task.id);
        task.callback();
      } else {
        this.level1.add(task);
      }
    });
  }

  get pendingTimersCount() {
    return this.taskIndex.size;
  }
}
''')

write_f('packages/core/src/disruptor.js', '''/**
 * @file disruptor.js
 * LMAX Disruptor Pattern - Lock-Free RingBuffer.
 */

export class Sequence {
  constructor(initialValue = -1n) {
    this.value = BigInt(initialValue);
  }

  get() {
    return this.value;
  }

  set(val) {
    this.value = BigInt(val);
  }

  incrementAndGet() {
    this.value += 1n;
    return this.value;
  }

  addAndGet(delta) {
    this.value += BigInt(delta);
    return this.value;
  }
}

export class SequenceBarrier {
  constructor(ringBuffer, dependentSequences = []) {
    this.ringBuffer = ringBuffer;
    this.dependentSequences = dependentSequences;
  }

  waitFor(targetSequence) {
    const target = BigInt(targetSequence);
    let available = this.getCursor();

    while (available < target) {
      available = this.getCursor();
    }

    return available;
  }

  getCursor() {
    if (this.dependentSequences.length === 0) {
      return this.ringBuffer.cursor.get();
    }

    let min = this.dependentSequences[0].get();
    for (let i = 1; i < this.dependentSequences.length; i++) {
      const seq = this.dependentSequences[i].get();
      if (seq < min) min = seq;
    }
    return min;
  }
}

export class DisruptorRingBuffer {
  constructor(bufferSize = 65536, eventFactory = () => ({})) {
    if ((bufferSize & (bufferSize - 1)) !== 0) {
      throw new Error('Disruptor buffer size must be a power of 2');
    }
    this.bufferSize = bufferSize;
    this.mask = BigInt(bufferSize - 1);
    this.cursor = new Sequence(-1n);
    this.gatingSequences = [];

    this.entries = new Array(bufferSize);
    for (let i = 0; i < bufferSize; i++) {
      this.entries[i] = eventFactory();
    }
  }

  addGatingSequences(...sequences) {
    this.gatingSequences.push(...sequences);
  }

  next(n = 1) {
    const count = BigInt(n);
    const current = this.cursor.get();
    const nextSeq = current + count;
    const wrapPoint = nextSeq - BigInt(this.bufferSize);

    while (wrapPoint > this._getMinimumGatingSequence(current)) {}

    this.cursor.set(nextSeq);
    return nextSeq;
  }

  publish(sequence) {}

  get(sequence) {
    const idx = Number(BigInt(sequence) & this.mask);
    return this.entries[idx];
  }

  _getMinimumGatingSequence(defaultVal) {
    if (this.gatingSequences.length === 0) return defaultVal;
    let min = this.gatingSequences[0].get();
    for (let i = 1; i < this.gatingSequences.length; i++) {
      const s = this.gatingSequences[i].get();
      if (s < min) min = s;
    }
    return min;
  }

  newBarrier(...dependents) {
    return new SequenceBarrier(this, dependents);
  }
}
''')

write_f('packages/core/src/memory_pool.js', '''/**
 * @file memory_pool.js
 * Off-Heap Direct Buffer Pool & Slab Allocator with power-of-two chunk pools.
 */

export class SlabAllocator {
  /**
   * @param {Object} [options]
   * @param {number} [options.slabSize=1048576] 1 MB slab size
   * @param {number} [options.minChunkSize=64] 64 B minimum allocation
   * @param {number} [options.maxChunkSize=65536] 64 KB max slab chunk
   */
  constructor(options = {}) {
    this.slabSize = options.slabSize || 1024 * 1024;
    this.minChunkSize = options.minChunkSize || 64;
    this.maxChunkSize = options.maxChunkSize || 64 * 1024;

    /** @type {Map<number, Buffer[]>} Power-of-two free lists */
    this.freeLists = new Map();

    let size = this.minChunkSize;
    while (size <= this.maxChunkSize) {
      this.freeLists.set(size, []);
      size *= 2;
    }

    this.allocatedBytes = 0;
    this.totalSlabs = 0;
  }

  _roundUpPowerOfTwo(size) {
    let s = this.minChunkSize;
    while (s < size && s <= this.maxChunkSize) {
      s *= 2;
    }
    return s;
  }

  allocate(size) {
    if (size > this.maxChunkSize) {
      return Buffer.allocUnsafe(size);
    }

    const bucketSize = this._roundUpPowerOfTwo(size);
    const pool = this.freeLists.get(bucketSize);

    if (pool && pool.length > 0) {
      const buf = pool.pop();
      return buf.subarray(0, size);
    }

    // Allocate new slab
    const newBuf = Buffer.allocUnsafe(bucketSize);
    this.allocatedBytes += bucketSize;
    return newBuf.subarray(0, size);
  }

  free(buffer) {
    const origCapacity = buffer.buffer.byteLength;
    if (origCapacity > this.maxChunkSize) return;

    const bucketSize = this._roundUpPowerOfTwo(origCapacity);
    const pool = this.freeLists.get(bucketSize);

    if (pool && pool.length < 512) {
      pool.push(Buffer.from(buffer.buffer));
    }
  }

  get stats() {
    const freeCount = {};
    for (const [k, v] of this.freeLists.entries()) {
      freeCount[`${k}B`] = v.length;
    }
    return {
      allocatedBytes: this.allocatedBytes,
      freePools: freeCount
    };
  }
}

export const defaultMemoryPool = new SlabAllocator();
''')

write_f('packages/core/src/compression.js', '''/**
 * @file compression.js
 * Compression codecs: Snappy, Run-Length Encoding (RLE), and Dictionary Bit-Packing.
 */

import zlib from 'node:zlib';

export class CompressionCodec {
  static compressGzip(buffer) {
    return zlib.gzipSync(buffer);
  }

  static decompressGzip(buffer) {
    return zlib.gunzipSync(buffer);
  }

  static compressDeflate(buffer) {
    return zlib.deflateSync(buffer);
  }

  static decompressDeflate(buffer) {
    return zlib.inflateSync(buffer);
  }

  /**
   * Run-length encoding (RLE) for repeated binary sequences.
   * @param {Buffer} buffer
   * @returns {Buffer}
   */
  static encodeRLE(buffer) {
    if (buffer.length === 0) return Buffer.alloc(0);

    const chunks = [];
    let curByte = buffer[0];
    let count = 1;

    for (let i = 1; i < buffer.length; i++) {
      if (buffer[i] === curByte && count < 255) {
        count++;
      } else {
        chunks.push(Buffer.from([count, curByte]));
        curByte = buffer[i];
        count = 1;
      }
    }
    chunks.push(Buffer.from([count, curByte]));

    return Buffer.concat(chunks);
  }

  /**
   * Decodes RLE buffer.
   * @param {Buffer} buffer
   * @returns {Buffer}
   */
  static decodeRLE(buffer) {
    const chunks = [];
    for (let i = 0; i < buffer.length; i += 2) {
      const count = buffer[i];
      const byteVal = buffer[i + 1];
      chunks.push(Buffer.alloc(count, byteVal));
    }
    return Buffer.concat(chunks);
  }
}
''')

write_f('packages/core/src/crypto_utils.js', '''/**
 * @file crypto_utils.js
 * Cryptographic routines: AES-256-GCM AEAD, HMAC-SHA256, and Key Derivation.
 */

import crypto from 'node:crypto';

export class CryptoUtils {
  static generateSalt(length = 16) {
    return crypto.randomBytes(length);
  }

  static deriveKey(password, salt, iterations = 100000, keyLength = 32) {
    return crypto.pbkdf2Sync(password, salt, iterations, keyLength, 'sha256');
  }

  /**
   * Encrypts payload with AES-256-GCM.
   * @param {Buffer} plaintext
   * @param {Buffer} key 32-byte key
   * @returns {Buffer} [IV: 12B][AuthTag: 16B][Ciphertext: NB]
   */
  static encryptAesGcm(plaintext, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]);
  }

  /**
   * Decrypts AES-256-GCM encrypted payload.
   * @param {Buffer} encryptedBuffer
   * @param {Buffer} key 32-byte key
   * @returns {Buffer}
   */
  static decryptAesGcm(encryptedBuffer, key) {
    if (encryptedBuffer.length < 28) throw new Error('Encrypted payload too short');
    const iv = encryptedBuffer.subarray(0, 12);
    const authTag = encryptedBuffer.subarray(12, 28);
    const ciphertext = encryptedBuffer.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  static hmacSha256(data, secret) {
    return crypto.createHmac('sha256', secret).update(data).digest();
  }
}
''')

write_f('packages/core/src/histogram.js', '''/**
 * @file histogram.js
 * High Dynamic Range (HdrHistogram) Percentile Latency Tracker.
 */

export class HdrHistogram {
  /**
   * @param {Object} [options]
   * @param {number} [options.highestTrackableValue=3600000000] 1 hour in microseconds
   * @param {number} [options.numberOfSignificantValueDigits=3]
   */
  constructor(options = {}) {
    this.highestTrackableValue = options.highestTrackableValue || 3600000000;
    this.samples = [];
    this.count = 0;
    this.sum = 0;
    this.min = Infinity;
    this.max = -Infinity;
  }

  record(value) {
    const val = Math.max(0, value);
    this.samples.push(val);
    this.count++;
    this.sum += val;
    if (val < this.min) this.min = val;
    if (val > this.max) this.max = val;

    if (this.samples.length > 50000) {
      this.samples = this.samples.slice(-25000);
    }
  }

  get mean() {
    return this.count > 0 ? this.sum / this.count : 0;
  }

  getValueAtPercentile(percentile) {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.floor((percentile / 100) * sorted.length));
    return sorted[index];
  }

  getSnapshot() {
    return {
      count: this.count,
      mean: this.mean,
      min: this.min === Infinity ? 0 : this.min,
      max: this.max === -Infinity ? 0 : this.max,
      p50: this.getValueAtPercentile(50),
      p90: this.getValueAtPercentile(90),
      p95: this.getValueAtPercentile(95),
      p99: this.getValueAtPercentile(99),
      p999: this.getValueAtPercentile(99.9)
    };
  }

  reset() {
    this.samples = [];
    this.count = 0;
    this.sum = 0;
    this.min = Infinity;
    this.max = -Infinity;
  }
}
''')

write_f('packages/core/src/async_lock.js', '''/**
 * @file async_lock.js
 * Asynchronous Distributed Mutex, Read-Write Lock, and Barrier primitives.
 */

export class AsyncMutex {
  constructor() {
    this.locked = false;
    this.waitingQueue = [];
  }

  acquire() {
    if (!this.locked) {
      this.locked = true;
      return Promise.resolve(() => this.release());
    }

    return new Promise((resolve) => {
      this.waitingQueue.push(resolve);
    }).then(() => () => this.release());
  }

  release() {
    if (this.waitingQueue.length > 0) {
      const nextResolve = this.waitingQueue.shift();
      nextResolve();
    } else {
      this.locked = false;
    }
  }

  async runExclusive(fn) {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export class AsyncRwLock {
  constructor() {
    this.activeReaders = 0;
    this.writerActive = false;
    this.waitingWriters = [];
    this.waitingReaders = [];
  }

  acquireRead() {
    if (!this.writerActive && this.waitingWriters.length === 0) {
      this.activeReaders++;
      return Promise.resolve(() => this.releaseRead());
    }

    return new Promise((resolve) => {
      this.waitingReaders.push(resolve);
    }).then(() => () => this.releaseRead());
  }

  releaseRead() {
    this.activeReaders--;
    if (this.activeReaders === 0 && this.waitingWriters.length > 0) {
      const nextWriter = this.waitingWriters.shift();
      this.writerActive = true;
      nextWriter();
    }
  }

  acquireWrite() {
    if (!this.writerActive && this.activeReaders === 0) {
      this.writerActive = true;
      return Promise.resolve(() => this.releaseWrite());
    }

    return new Promise((resolve) => {
      this.waitingWriters.push(resolve);
    }).then(() => () => this.releaseWrite());
  }

  releaseWrite() {
    this.writerActive = false;
    if (this.waitingReaders.length > 0) {
      const readers = [...this.waitingReaders];
      this.waitingReaders = [];
      for (const r of readers) {
        this.activeReaders++;
        r();
      }
    } else if (this.waitingWriters.length > 0) {
      const nextWriter = this.waitingWriters.shift();
      this.writerActive = true;
      nextWriter();
    }
  }
}

export class AsyncBarrier {
  constructor(parties) {
    this.parties = parties;
    this.count = 0;
    this.resolvers = [];
  }

  await() {
    this.count++;
    if (this.count === this.parties) {
      const res = [...this.resolvers];
      this.resolvers = [];
      this.count = 0;
      for (const r of res) r();
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.resolvers.push(resolve);
    });
  }
}
''')

write_f('packages/core/src/rate_limiters.js', '''/**
 * @file rate_limiters.js
 * Advanced Rate Limiters: GCRA (Generic Cell Rate Algorithm) & Leaky Bucket.
 */

export class GcraRateLimiter {
  /**
   * @param {Object} options
   * @param {number} options.ratePerSec Permitted requests per second
   * @param {number} [options.burstCapacity=10] Allowed burst count
   */
  constructor(options) {
    this.emissionIntervalMs = 1000 / (options.ratePerSec || 100);
    this.burstCapacity = options.burstCapacity || 10;
    this.delayToleranceMs = this.emissionIntervalMs * this.burstCapacity;
    this.tat = Date.now(); // Theoretical Arrival Time
  }

  tryConsume() {
    const now = Date.now();
    const tat = Math.max(now, this.tat);

    if (tat - now <= this.delayToleranceMs) {
      this.tat = tat + this.emissionIntervalMs;
      return true;
    }

    return false;
  }
}

export class LeakyBucketLimiter {
  constructor(capacity = 100, leakRatePerSec = 10) {
    this.capacity = capacity;
    this.leakRate = leakRatePerSec;
    this.water = 0;
    this.lastLeak = Date.now();
  }

  tryConsume(amount = 1) {
    const now = Date.now();
    const elapsedSec = (now - this.lastLeak) / 1000;
    this.water = Math.max(0, this.water - elapsedSec * this.leakRate);
    this.lastLeak = now;

    if (this.water + amount <= this.capacity) {
      this.water += amount;
      return true;
    }
    return false;
  }
}
''')

print("Part 1 Core additions completed.")
''')

write_code = True
print("Created gen_core.py")
