import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EqBand } from './hooks/useEqBands';
import { useSchoolTint } from './hooks/useSchoolTint';

interface ParaEQOverlayProps {
  eqBands: EqBand[];
  isPlaying?: boolean;
  detectedSchoolId?: string | null;
  onAddBand: (band: Partial<EqBand>) => string;
  onUpdateBand: (id: string, updates: Partial<EqBand>) => void;
  onRemoveBand: (id: string) => void;
  onEditBand: (id: string) => void;
}

const BandNode: React.FC<{
  band: EqBand;
  index: number;
  isActive: boolean;
  isPlaying?: boolean;
  detectedSchoolId?: string | null;
  x: number;
  y: number;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDoubleClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  onContextMenu: (e: React.MouseEvent<HTMLDivElement>) => void;
}> = ({ band, index, isActive, isPlaying, detectedSchoolId, x, y, onPointerDown, onDoubleClick, onWheel, onContextMenu }) => {
  const { stroke, fill, glow } = useSchoolTint(band.school);
  
  // 4-beat envelope when the school matches and music is playing
  const isPulsing = isPlaying && band.school && band.school === detectedSchoolId;

  return (
    <motion.div
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onWheel={onWheel}
      onContextMenu={onContextMenu}
      animate={{
        left: x,
        top: y,
        scale: isActive ? 1.5 : 1,
        boxShadow: isPulsing 
          ? [
              `0 0 10px ${glow}`,
              `0 0 30px ${stroke}`,
              `0 0 10px ${glow}`
            ]
          : `0 0 10px rgba(0,0,0,0.5)`,
      }}
      transition={isPulsing ? {
        boxShadow: {
          duration: 1.8,
          times: [0, 0.11, 1], // 200ms peak out of 1.8s
          repeat: Infinity,
          ease: "easeOut"
        }
      } : { type: 'spring', stiffness: 500, damping: 30 }}
      style={{
        position: 'absolute',
        width: '16px',
        height: '16px',
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        backgroundColor: isActive ? stroke : fill,
        border: `2px solid ${stroke}`,
        cursor: 'grab',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontFamily: '"PixelBrain", monospace',
        fontSize: '10px',
        fontWeight: 'normal',
        touchAction: 'none',
        zIndex: isActive ? 10 : 1,
      }}
      title={`Q: ${band.q.toFixed(2)}`}
    >
      {index + 1}
    </motion.div>
  );
};

export const ParaEQOverlay: React.FC<ParaEQOverlayProps> = ({
  eqBands,
  isPlaying,
  detectedSchoolId,
  onAddBand,
  onUpdateBand,
  onRemoveBand,
  onEditBand,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeBandId, setActiveBandId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const freqToX = (freq: number, width: number) => {
    if (width === 0) return 0;
    return (Math.log10(freq / 20) / Math.log10(20000 / 20)) * width;
  };

  const xToFreq = (x: number, width: number) => {
    if (width === 0) return 1000;
    const fraction = Math.max(0, Math.min(1, x / width));
    return 20 * Math.pow(10, fraction * Math.log10(20000 / 20));
  };

  const gainToY = (gain: number, height: number) => {
    if (height === 0) return 0;
    const rangeDb = 24;
    let yFraction = (gain + rangeDb) / (rangeDb * 2);
    yFraction = 1 - Math.max(0, Math.min(1, yFraction));
    return height * yFraction;
  };

  const yToGain = (y: number, height: number) => {
    if (height === 0) return 0;
    const rangeDb = 24;
    const yFraction = Math.max(0, Math.min(1, 1 - (y / height)));
    return (yFraction * rangeDb * 2) - rangeDb;
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== containerRef.current) return;
    if (!containerRef.current || dimensions.width === 0) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const freq = xToFreq(x, dimensions.width);
    const gain = yToGain(y, dimensions.height);

    const newId = onAddBand({
      filterType: 'Bell',
      freq: freq,
      gain: gain,
      q: 1,
    });
    setActiveBandId(newId);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setActiveBandId(id);
    
    const currentId = id;
    
    const handlePointerMove = (moveEv: PointerEvent) => {
      if (!containerRef.current || dimensions.width === 0) return;
      const targetRect = containerRef.current.getBoundingClientRect();
      const x = moveEv.clientX - targetRect.left;
      const y = moveEv.clientY - targetRect.top;
      
      const newFreq = Math.max(20, Math.min(20000, xToFreq(x, targetRect.width)));
      const newGain = Math.max(-24, Math.min(24, yToGain(y, targetRect.height)));
      
      onUpdateBand(currentId, { freq: newFreq, gain: newGain });
    };
    
    const handlePointerUp = (upEv: PointerEvent) => {
      e.currentTarget.releasePointerCapture(upEv.pointerId);
      e.currentTarget.removeEventListener('pointermove', handlePointerMove as EventListener);
      e.currentTarget.removeEventListener('pointerup', handlePointerUp as EventListener);
    };

    e.currentTarget.addEventListener('pointermove', handlePointerMove as EventListener);
    e.currentTarget.addEventListener('pointerup', handlePointerUp as EventListener);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>, band: EqBand) => {
    e.preventDefault();
    e.stopPropagation();
    const scrollAmount = e.deltaY;
    let newQ = band.q;
    if (scrollAmount > 0) {
      newQ = Math.max(0.1, band.q * 0.9);
    } else {
      newQ = Math.min(10, band.q * 1.1);
    }
    onUpdateBand(band.id, { q: newQ });
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>, id: string) => {
    e.preventDefault();
    onRemoveBand(id);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!containerRef.current) return;
    
    const textData = e.dataTransfer.getData('text/plain');
    if (!textData) return;

      // Load PhonemeEngine dynamically if needed, or assume it's loaded by the parent.
    // Use the UI adapter layer (src/lib/engine.adapter.js).
    let schoolId = 'NEUTRAL';
    let targetFreq = 1000;
    const targetGain = 6.0;
    let targetQ = 1.414;

    try {
      const { PhonemeEngine, VOWEL_FAMILY_TO_SCHOOL } = await import('../../lib/engine.adapter.js');
      await PhonemeEngine.ensureInitialized();

      
      const analysis = PhonemeEngine.getAnalysis(textData.trim());
      if (analysis && analysis.vowelFamily) {
        const vowelFamily = String(analysis.vowelFamily) as keyof typeof VOWEL_FAMILY_TO_SCHOOL;
        schoolId = VOWEL_FAMILY_TO_SCHOOL[vowelFamily] || 'NEUTRAL';
      }

      // Simple mapping of School to typical Hz centroids
      const SCHOOL_TO_HZ: Record<string, number> = {
        SONIC: 1200,
        PSYCHIC: 3000,
        VOID: 200,
        ALCHEMY: 800,
        WILL: 500,
        NECROMANCY: 250,
        ABJURATION: 100,
        DIVINATION: 4000,
        NEUTRAL: 1000
      };
      
      targetFreq = SCHOOL_TO_HZ[schoolId] || 1000;
      // Q based on syllable count or length
      targetQ = analysis ? Math.max(0.5, 4.0 / (analysis.syllableCount || 1)) : 1.414;
    } catch (err) {
      console.warn("Failed to load PhonemeEngine for drop analysis", err);
    }

    onAddBand({
      filterType: 'Bell',
      freq: targetFreq,
      gain: targetGain,
      q: targetQ,
      school: schoolId,
    });
  };

  return (
    <div
      ref={containerRef}
      onDoubleClick={handleDoubleClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'auto',
      }}
    >
      <AnimatePresence>
        {dimensions.width > 0 && eqBands.map((band, index) => {
          const x = freqToX(band.freq, dimensions.width);
          const y = gainToY(band.gain, dimensions.height);
          const isActive = activeBandId === band.id;

          return (
            <BandNode
              key={band.id}
              band={band}
              index={index}
              isActive={isActive}
              isPlaying={isPlaying}
              detectedSchoolId={detectedSchoolId}
              x={x}
              y={y}
              onPointerDown={(e) => handlePointerDown(e, band.id)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onEditBand(band.id);
              }}
              onWheel={(e) => handleWheel(e, band)}
              onContextMenu={(e) => handleContextMenu(e, band.id)}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
};
