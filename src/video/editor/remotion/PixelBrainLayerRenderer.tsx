/* eslint-disable react/no-unknown-property */
import { ThreeCanvas } from '@remotion/three';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { WebGLShaderLayer } from '../../../pages/VideoForge/WebGLShaderLayer';

// Stub for actual pixel brain lattice geometry rendering
function LatticeGeometry({ timeOverride }: { timeOverride: number }) {
  return (
    <mesh rotation={[timeOverride, timeOverride, 0]}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="hotpink" />
    </mesh>
  );
}

export function PixelBrainLayerRenderer({ packet }: { packet: unknown }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  if (
    packet &&
    typeof packet === 'object' &&
    (packet as { contract?: string }).contract === 'PB-SHADER-v1'
  ) {
    return (
      <WebGLShaderLayer
        packet={packet as any}
        frame={frame}
        fps={fps}
        width={width}
        height={height}
      />
    );
  }

  return (
    <ThreeCanvas width={width} height={height}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1} />
      <LatticeGeometry timeOverride={frame / fps} />
    </ThreeCanvas>
  );
}
