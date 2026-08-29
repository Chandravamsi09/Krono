/**
 * @file crash_fault_injector.js
 * Injects crash-stop, crash-recovery, and disk faults into cluster nodes.
 */

export class CrashFaultInjector {
  /**
   * @param {Map<string, any>} nodesMap
   */
  constructor(nodesMap) {
    this.nodes = nodesMap;
    this.crashedNodes = new Set();
  }

  crashNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (node && !this.crashedNodes.has(nodeId)) {
      node.stop();
      this.crashedNodes.add(nodeId);
    }
  }

  recoverNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (node && this.crashedNodes.has(nodeId)) {
      node.start();
      this.crashedNodes.delete(nodeId);
    }
  }

  recoverAll() {
    for (const nodeId of this.crashedNodes) {
      const node = this.nodes.get(nodeId);
      if (node) node.start();
    }
    this.crashedNodes.clear();
  }
}
