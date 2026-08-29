/**
 * @file joint_consensus.js
 * Joint Consensus membership change protocol (C_old -> C_old,new -> C_new)
 * allowing dynamic cluster expansion and shrinking with mathematical safety.
 */

export const JointConsensusStage = {
  STABLE: 'STABLE',             // Normal single configuration
  JOINT_TRANSITION: 'JOINT',    // In C_old,new joint configuration
  COMMITTED_NEW: 'COMMITTED_NEW' // Committed C_new
};

export class JointConsensusConfig {
  /**
   * @param {string[]} oldNodes
   * @param {string[]} [newNodes]
   * @param {string} [stage=JointConsensusStage.STABLE]
   */
  constructor(oldNodes = [], newNodes = [], stage = JointConsensusStage.STABLE) {
    this.oldNodes = [...oldNodes];
    this.newNodes = [...newNodes];
    this.stage = stage;
  }

  get allNodes() {
    return Array.from(new Set([...this.oldNodes, ...this.newNodes]));
  }

  /**
   * Evaluates whether a set of positive node acks achieves majority quorum.
   * Under Joint Consensus, a proposal requires a majority from BOTH C_old AND C_new.
   * @param {Set<string> | string[]} acks
   * @returns {boolean}
   */
  hasQuorum(acks) {
    const ackSet = acks instanceof Set ? acks : new Set(acks);

    // Check C_old majority
    const oldQuorum = Math.floor(this.oldNodes.length / 2) + 1;
    let oldMatches = 0;
    for (const node of this.oldNodes) {
      if (ackSet.has(node)) oldMatches++;
    }
    if (oldMatches < oldQuorum) return false;

    // If in Joint configuration, check C_new majority as well
    if (this.stage === JointConsensusStage.JOINT_TRANSITION && this.newNodes.length > 0) {
      const newQuorum = Math.floor(this.newNodes.length / 2) + 1;
      let newMatches = 0;
      for (const node of this.newNodes) {
        if (ackSet.has(node)) newMatches++;
      }
      if (newMatches < newQuorum) return false;
    }

    return true;
  }

  /**
   * Initiates joint configuration transition: C_old,new.
   * @param {string[]} targetNewNodes
   * @returns {JointConsensusConfig}
   */
  enterJoint(targetNewNodes) {
    return new JointConsensusConfig(this.oldNodes, targetNewNodes, JointConsensusStage.JOINT_TRANSITION);
  }

  /**
   * Finalizes transition to C_new once C_old,new is committed.
   * @returns {JointConsensusConfig}
   */
  finalizeNew() {
    return new JointConsensusConfig(this.newNodes, [], JointConsensusStage.STABLE);
  }
}
