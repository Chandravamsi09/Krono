/**
 * @file saga_orchestrator.js
 * Distributed Saga Pattern Orchestrator supporting forward transactional
 * execution and reverse compensation rollbacks upon task failure.
 */

export class SagaStep {
  /**
   * @param {Object} options
   * @param {string} options.stepId
   * @param {Function} options.execute Forward execution action: (ctx) => Promise<result>
   * @param {Function} [options.compensate] Backward rollback action: (ctx, err) => Promise<void>
   */
  constructor(options) {
    this.stepId = options.stepId;
    this.execute = options.execute;
    this.compensate = options.compensate || (async () => {});
  }
}

export class SagaOrchestrator {
  /**
   * @param {SagaStep[]} steps
   */
  constructor(steps = []) {
    this.steps = steps;
  }

  /**
   * Executes saga forward. If any step throws an error, executes compensation
   * steps in reverse order for all completed steps.
   * @param {Object} [initialContext={}]
   * @returns {Promise<{ success: boolean, context: Object, error: Error | null }>}
   */
  async execute(initialContext = {}) {
    const context = { ...initialContext };
    const executedSteps = [];

    for (const step of this.steps) {
      try {
        const res = await step.execute(context);
        if (res && typeof res === 'object') {
          Object.assign(context, res);
        }
        executedSteps.push(step);
      } catch (err) {
        // Step failed, trigger reverse compensation rollbacks
        await this._compensate(executedSteps, context, err);
        return {
          success: false,
          context,
          error: err
        };
      }
    }

    return {
      success: true,
      context,
      error: null
    };
  }

  async _compensate(executedSteps, context, error) {
    // Reverse order
    const reverseList = [...executedSteps].reverse();
    for (const step of reverseList) {
      try {
        await step.compensate(context, error);
      } catch (compErr) {
        // Log compensation error without breaking rollback chain
      }
    }
  }
}
