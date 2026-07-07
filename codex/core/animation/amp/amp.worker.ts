/// <reference lib="webworker" />
import { AnimationIntent, DEFAULT_AMP_CONFIG, AMP_ERROR_CODES, AnimationAmpError, AnimationAmpConfig, MotionWorkingState } from '../contracts/animation.types.ts';
import { validateAnimationIntent } from '../contracts/animation.schemas.ts';
import { normalizeAnimationIntent } from './normalizeAnimationIntent.ts';
import { fuseMotionOutput } from './fuseMotionOutput.ts';
import { registerAllProcessors } from '../processors/registerAllProcessors.ts';
import { processorRegistry } from './registry.ts';

let isInitialized = false;
let ampConfig = { ...DEFAULT_AMP_CONFIG };

function initWorker() {
  if (isInitialized) return;
  registerAllProcessors();
  isInitialized = true;
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data;
  
  if (type === 'INIT') {
    ampConfig = { ...DEFAULT_AMP_CONFIG, ...payload };
    initWorker();
    self.postMessage({ id, type: 'INIT_ACK' });
    return;
  }
  
  if (type === 'RUN_INTENT') {
    initWorker();
    try {
      const intent = payload as AnimationIntent;
      const validation = validateAnimationIntent(intent);
      if (!validation.success) {
        throw new AnimationAmpError(
          `Intent validation failed: ${validation.error.message}`,
          AMP_ERROR_CODES.INTENT_VALIDATION_FAILED,
          intent,
          validation.error
        );
      }

      let workingState = await normalizeAnimationIntent(intent);
      const processors = processorRegistry.selectForIntent(intent);
      
      const limitedProcessors = processors.slice(0, ampConfig.maxProcessors);
      const pipelineStart = performance.now();

      for (const processor of limitedProcessors) {
        const processorStart = performance.now();
        try {
          workingState = await processor.run(workingState);
          const processorTime = performance.now() - processorStart;
          if (ampConfig.performanceMonitoring && processorTime > ampConfig.frameBudgetMs) {
            workingState.diagnostics.push(`Processor ${processor.id} took ${processorTime.toFixed(2)}ms (budget: ${ampConfig.frameBudgetMs}ms)`);
          }
        } catch (error) {
          if (error instanceof AnimationAmpError && error.code === AMP_ERROR_CODES.AESTHETIC_VIOLATION) {
            throw error;
          }
          workingState.diagnostics.push(`Processor ${processor.id} failed: ${(error as Error).message}`);
        }
      }

      const totalTime = performance.now() - pipelineStart;
      if (ampConfig.performanceMonitoring) {
        workingState.diagnostics.push(`AMP pipeline completed in ${totalTime.toFixed(2)}ms`);
      }

      const output = fuseMotionOutput(workingState, ampConfig.bytecodeEnabled, ampConfig);
      
      self.postMessage({ id, type: 'SUCCESS', output, trace: workingState.diagnostics });
    } catch (err: any) {
      self.postMessage({ id, type: 'ERROR', error: err.message || 'Unknown worker error' });
    }
  }
};
