import { MotionProcessor, AnimationIntent } from '../contracts/animation.types.ts';

class ProcessorRegistry {
  private processors: Map<string, MotionProcessor> = new Map();
  
  register(processor: MotionProcessor): void {
    if (this.processors.has(processor.id)) {
      console.warn(`[AnimationAMP] Processor ${processor.id} already registered, overwriting`);
    }
    this.processors.set(processor.id, processor);
  }
  
  get(id: string): MotionProcessor | undefined {
    return this.processors.get(id);
  }
  
  getAll(): MotionProcessor[] {
    return Array.from(this.processors.values());
  }
  
  getByStage(stage: string): MotionProcessor[] {
    return this.getAll().filter(p => p.stage === stage);
  }
  
  selectForIntent(intent: AnimationIntent): MotionProcessor[] {
    const allProcessors = this.getAll();
    const selected = allProcessors.filter(p => p.supports(intent));
    
    // Sort by stage order and priority
    const stageOrder: Record<string, number> = {
      normalize: 0,
      timing: 1,
      transform: 2,
      visual: 3,
      sequence: 4,
      reactive: 5,
      constraint: 6,
      symmetry: 7,
      finalize: 8,
    };
    
    return selected.sort((a, b) => {
      const stageDiff = (stageOrder[a.stage] ?? 99) - (stageOrder[b.stage] ?? 99);
      if (stageDiff !== 0) return stageDiff;
      return (b.priority ?? 0) - (a.priority ?? 0);
    });
  }
  
  clear(): void {
    this.processors.clear();
  }
}

export const processorRegistry = new ProcessorRegistry();
