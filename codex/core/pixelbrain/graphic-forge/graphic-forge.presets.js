import { GraphicForgePipeline } from './graphic-forge.pipeline.js';
import { QBITSeedMicroprocessor } from './microprocessors/qbit-seed.microprocessor.js';
import { QBITPropagateMicroprocessor } from './microprocessors/qbit-propagate.microprocessor.js';
import { MaterialQuantizeMicroprocessor } from './microprocessors/material-quantize.microprocessor.js';
import { ImageReceiverMicroprocessor } from './microprocessors/image-receiver.microprocessor.js';
import { SCDLExporterMicroprocessor } from './microprocessors/scdl-exporter.microprocessor.js';

export function createSinisterVoidGraphicForge() {
  const pipeline = new GraphicForgePipeline();
  
  pipeline
    .add(new QBITSeedMicroprocessor())
    .add(new QBITPropagateMicroprocessor())
    .add(new MaterialQuantizeMicroprocessor());
    
  return pipeline;
}

export function createImageReceiverGraphicForge() {
  const pipeline = new GraphicForgePipeline();
  
  pipeline
    .add(new ImageReceiverMicroprocessor())
    .add(new SCDLExporterMicroprocessor());
    
  return pipeline;
}
