// @ts-nocheck
import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, Audio } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useBeatClock } from "./useBeatClock";
import type { GrimoireTrack } from "../pages/Visualiser/tracks/types";

interface Windows98VisualizerProps {
  track: GrimoireTrack;
  themeName?: "beigeOffice" | "crtBlue" | "hauntedGreen";
  reactivityAmount?: number;
}

const THEMES = {
  beigeOffice: {
    wallColor: "#e6decc",
    floorColor: "#7a7d80",
    ceilingColor: "#e6decc",
    lightColor: "#ffffff",
    fogColor: "#d4cdbc",
    fogDensity: 0.04,
  },
  crtBlue: {
    wallColor: "#1a2c4d",
    floorColor: "#0a1326",
    ceilingColor: "#1a2c4d",
    lightColor: "#66ccff",
    fogColor: "#0a1326",
    fogDensity: 0.08,
  },
  hauntedGreen: {
    wallColor: "#111a11",
    floorColor: "#050a05",
    ceilingColor: "#111a11",
    lightColor: "#33ff33",
    fogColor: "#050a05",
    fogDensity: 0.12,
  },
};

const HALLWAY_SEGMENT_LENGTH = 10;
const HALLWAY_SEGMENTS = 8;
const CAMERA_SPEED = 0.15;

function HallwaySegment({ zOffset, theme, pulseAmount }: { zOffset: number; theme: any; pulseAmount: number }) {
  // A simple section of the hallway: floor, left wall, right wall, ceiling.
  // Add some pillars or doors to make motion visible.
  
  const lightIntensity = 1 + pulseAmount * 2;
  
  return (
    <group position={[0, 0, zOffset]}>
      {/* Floor */}
      <mesh position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6, HALLWAY_SEGMENT_LENGTH]} />
        <meshStandardMaterial color={theme.floorColor} roughness={0.8} />
      </mesh>

      {/* Ceiling */}
      <mesh position={[0, 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6, HALLWAY_SEGMENT_LENGTH]} />
        <meshStandardMaterial color={theme.ceilingColor} roughness={0.9} />
      </mesh>

      {/* Left Wall */}
      <mesh position={[-3, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[HALLWAY_SEGMENT_LENGTH, 4]} />
        <meshStandardMaterial color={theme.wallColor} roughness={0.9} />
      </mesh>
      
      {/* Right Wall */}
      <mesh position={[3, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[HALLWAY_SEGMENT_LENGTH, 4]} />
        <meshStandardMaterial color={theme.wallColor} roughness={0.9} />
      </mesh>

      {/* Overhead Fluorescent Light */}
      <mesh position={[0, 1.95, 0]}>
        <planeGeometry args={[1.5, 3]} />
        <meshBasicMaterial color={theme.lightColor} />
      </mesh>
      
      {/* Point light for illumination */}
      <pointLight 
        position={[0, 1.5, 0]} 
        color={theme.lightColor} 
        intensity={lightIntensity} 
        distance={15}
        decay={2}
      />

      {/* Doors / Pillars on the side to show passing motion */}
      <mesh position={[-2.9, 0, 0]}>
        <boxGeometry args={[0.2, 3, 1.5]} />
        <meshStandardMaterial color={"#555"} roughness={0.7} />
      </mesh>
      <mesh position={[2.9, 0, 0]}>
        <boxGeometry args={[0.2, 3, 1.5]} />
        <meshStandardMaterial color={"#555"} roughness={0.7} />
      </mesh>
    </group>
  );
}

function Scene({ track, theme, reactivityAmount }: { track: GrimoireTrack; theme: any; reactivityAmount: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Calculate pulse based on beat clock
  const clock = useBeatClock({ bpm: track.pacing.bpm, offsetMs: track.pacing.leadInS * 1000 });
  
  // Beat phase goes from 0 to 1 over one beat. 
  // We want a sharp decay: max at 0, decaying to 0 quickly.
  const pulse = Math.pow(1 - (clock.beat?.phase || 0), 4) * reactivityAmount;

  // The camera moves backward along the Z axis (into negative Z).
  // Wait, standard ThreeJS camera looks down -Z. So if we move the camera in -Z, we are moving forward.
  // We can just move the camera based on frame.
  const zPosition = -(frame * CAMERA_SPEED);
  
  // To keep the scene looping, we only render segments around the camera.
  // Find which segment index the camera is currently in.
  const currentSegmentIndex = Math.floor(-zPosition / HALLWAY_SEGMENT_LENGTH);

  const segments = useMemo(() => {
    const arr = [];
    // Render a few segments ahead and a couple behind
    for (let i = -1; i < HALLWAY_SEGMENTS; i++) {
      const segIndex = currentSegmentIndex + i;
      arr.push(
        <HallwaySegment 
          key={segIndex} 
          zOffset={-segIndex * HALLWAY_SEGMENT_LENGTH} 
          theme={theme}
          pulseAmount={pulse}
        />
      );
    }
    return arr;
  }, [currentSegmentIndex, theme, pulse]);

  // Subtle camera drift/sway
  const swayX = Math.sin(frame * 0.02) * 0.2;
  const swayY = Math.cos(frame * 0.015) * 0.1;

  return (
    <>
      <color attach="background" args={[theme.fogColor]} />
      <fog attach="fog" args={[theme.fogColor, 5, 25]} />
      <ambientLight intensity={0.2} color={theme.fogColor} />
      
      {/* Dynamic Camera */}
      <perspectiveCamera 
        position={[swayX, swayY, zPosition]} 
        rotation={[0, 0, Math.sin(frame * 0.005) * 0.02]} // subtle tilt
      />
      {segments}
    </>
  );
}

export const Windows98Visualizer: React.FC<Windows98VisualizerProps> = ({ 
  track, 
  themeName = "beigeOffice",
  reactivityAmount = 1.0
}) => {
  const theme = THEMES[themeName];
  
  return (
    <AbsoluteFill style={{ backgroundColor: theme.fogColor }}>
      <ThreeCanvas
        width={1920}
        height={1080}
        camera={{ position: [0, 0, 0], fov: 75 }}
      >
        <Scene track={track} theme={theme} reactivityAmount={reactivityAmount} />
      </ThreeCanvas>
      {track.audioUrl && <Audio src={track.audioUrl} />}
    </AbsoluteFill>
  );
};
