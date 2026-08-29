/**
 * @file skiplist.js
 * Probabilistic SkipList data structure with O(log N) lookup, insertion,
 * deletion, and range iteration. Used as the core indexing structure of MemTables.
 */

const MAX_LEVEL = 16;
const PROBABILITY = 0.5;

class SkipNode {
  constructor(key, value, level) {
    this.key = key;
    this.value = value;
    this.forward = new Array(level).fill(null);
  }
}

export class SkipList {
  /**
   * @param {(a: string, b: string) => number} [comparator]
   */
  constructor(comparator = (a, b) => (a < b ? -1 : a > b ? 1 : 0)) {
    this.comparator = comparator;
    this.header = new SkipNode(null, null, MAX_LEVEL);
    this.level = 1;
    this.size = 0;
  }

  _randomLevel() {
    let lvl = 1;
    while (Math.random() < PROBABILITY && lvl < MAX_LEVEL) {
      lvl++;
    }
    return lvl;
  }

  /**
   * Finds the value associated with key.
   * @param {string} key
   * @returns {any|undefined}
   */
  get(key) {
    let current = this.header;
    for (let i = this.level - 1; i >= 0; i--) {
      while (current.forward[i] && this.comparator(current.forward[i].key, key) < 0) {
        current = current.forward[i];
      }
    }
    current = current.forward[0];
    if (current && this.comparator(current.key, key) === 0) {
      return current.value;
    }
    return undefined;
  }

  /**
   * Inserts or updates a key-value pair.
   * @param {string} key
   * @param {any} value
   */
  put(key, value) {
    const update = new Array(MAX_LEVEL).fill(null);
    let current = this.header;

    for (let i = this.level - 1; i >= 0; i--) {
      while (current.forward[i] && this.comparator(current.forward[i].key, key) < 0) {
        current = current.forward[i];
      }
      update[i] = current;
    }

    current = current.forward[0];

    // Key already exists, update value in place
    if (current && this.comparator(current.key, key) === 0) {
      current.value = value;
      return;
    }

    // Insert new node
    const newLevel = this._randomLevel();
    if (newLevel > this.level) {
      for (let i = this.level; i < newLevel; i++) {
        update[i] = this.header;
      }
      this.level = newLevel;
    }

    const newNode = new SkipNode(key, value, newLevel);
    for (let i = 0; i < newLevel; i++) {
      newNode.forward[i] = update[i].forward[i];
      update[i].forward[i] = newNode;
    }

    this.size++;
  }

  /**
   * Deletes a key from the skiplist.
   * @param {string} key
   * @returns {boolean} True if deleted, false if not found
   */
  delete(key) {
    const update = new Array(MAX_LEVEL).fill(null);
    let current = this.header;

    for (let i = this.level - 1; i >= 0; i--) {
      while (current.forward[i] && this.comparator(current.forward[i].key, key) < 0) {
        current = current.forward[i];
      }
      update[i] = current;
    }

    current = current.forward[0];

    if (current && this.comparator(current.key, key) === 0) {
      for (let i = 0; i < this.level; i++) {
        if (update[i].forward[i] !== current) break;
        update[i].forward[i] = current.forward[i];
      }

      while (this.level > 1 && this.header.forward[this.level - 1] === null) {
        this.level--;
      }

      this.size--;
      return true;
    }

    return false;
  }

  /**
   * Iterates all entries in ascending key order.
   * @returns {Array<{ key: string, value: any }>}
   */
  entries() {
    const list = [];
    let current = this.header.forward[0];
    while (current) {
      list.push({ key: current.key, value: current.value });
      current = current.forward[0];
    }
    return list;
  }

  /**
   * Scans a range of keys [startKey, endKey].
   * @param {string} [startKey]
   * @param {string} [endKey]
   * @param {number} [limit=1000]
   * @returns {Array<{ key: string, value: any }>}
   */
  scan(startKey, endKey, limit = 1000) {
    const list = [];
    let current = this.header;

    if (startKey !== undefined && startKey !== null) {
      for (let i = this.level - 1; i >= 0; i--) {
        while (current.forward[i] && this.comparator(current.forward[i].key, startKey) < 0) {
          current = current.forward[i];
        }
      }
      current = current.forward[0];
    } else {
      current = current.forward[0];
    }

    while (current && list.length < limit) {
      if (endKey !== undefined && endKey !== null && this.comparator(current.key, endKey) > 0) {
        break;
      }
      list.push({ key: current.key, value: current.value });
      current = current.forward[0];
    }

    return list;
  }

  clear() {
    this.header = new SkipNode(null, null, MAX_LEVEL);
    this.level = 1;
    this.size = 0;
  }
}
