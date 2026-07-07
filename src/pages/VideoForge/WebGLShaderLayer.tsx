import { useEffect, useMemo, useRef, useState } from 'react';
import {
  compileShaderProgram,
  createFullscreenQuad,
  disposeFullscreenQuad,
  disposeShaderProgram,
  renderShaderFrame,
  resolveShaderUniforms,
} from '../../lib/pixelbrain.adapter.js';

type ShaderPacket = {
  contract?: string;
  id?: string;
  label?: string;
  fragmentSource?: string;
  uniforms?: Record<string, unknown>;
};

type WebGLShaderLayerProps = {
  packet: ShaderPacket;
  frame: number;
  fps: number;
  width: number;
  height: number;
};

export function WebGLShaderLayer({
  packet,
  frame,
  fps,
  width,
  height,
}: WebGLShaderLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const quadRef = useRef<ReturnType<typeof createFullscreenQuad> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fragmentSource = String(packet?.fragmentSource || '');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: true,
      stencil: false,
    });

    if (!gl) {
      setError('WebGL2 unavailable');
      return undefined;
    }

    let program: WebGLProgram | null = null;
    let quad: ReturnType<typeof createFullscreenQuad> | null = null;

    try {
      program = compileShaderProgram(gl, fragmentSource);
      quad = createFullscreenQuad(gl);
      glRef.current = gl;
      programRef.current = program;
      quadRef.current = quad;
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Shader compile failed');
    }

    return () => {
      if (quad) disposeFullscreenQuad(gl, quad);
      if (program) disposeShaderProgram(gl, program);
      if (quadRef.current === quad) quadRef.current = null;
      if (programRef.current === program) programRef.current = null;
      if (glRef.current === gl) glRef.current = null;
    };
  }, [fragmentSource]);

  const runtimeState = useMemo(() => ({
    clock: {
      elapsedSeconds: fps > 0 ? frame / fps : 0,
    },
    canvas: {
      size: [width, height],
    },
    spell: {
      schoolIndex: 4,
    },
    verse: {
      resonance: 0.85,
      vowelDensity: 0.62,
    },
    palette: [
      {
        rgb01: [0.47, 0.15, 0.92],
      },
    ],
  }), [fps, frame, height, width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = glRef.current;
    const program = programRef.current;
    const quad = quadRef.current;
    if (!canvas || !gl || !program || !quad) return;

    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const uniforms = resolveShaderUniforms(packet, runtimeState);
    renderShaderFrame(gl, program, quad, uniforms);
  }, [height, packet, runtimeState, width]);

  if (error) {
    return (
      <div
        style={{
          alignItems: 'center',
          background: '#170b12',
          color: '#fca5a5',
          display: 'flex',
          fontFamily: 'JetBrains Mono, monospace',
          height: '100%',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
          width: '100%',
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-label={`WebGL shader layer ${packet?.label || packet?.id || 'shader'}`}
      width={width}
      height={height}
      style={{
        display: 'block',
        height: '100%',
        width: '100%',
      }}
    />
  );
}
