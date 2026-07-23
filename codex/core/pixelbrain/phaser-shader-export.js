/**
 * PixelBrain Phaser Shader Exporter
 *
 * Compiles a declarative PB-SHADER-v1 packet into a Phaser WebGL Pipeline registration class.
 *
 * Moved here from src/lib/exporters/ to eliminate the forbidden codex/core → src/
 * import (LING-0F03). src/lib/exporters/pixelbrainPhaserShaderExport.js re-exports
 * from here for backward compatibility.
 */

import { validateShaderPacket } from './shader-packet.js';

export function exportToPhaserPipeline(packet) {
  // Validate packet contract
  validateShaderPacket(packet);

  // PascalCase the ID to create a safe JS class name
  const className = String(packet.id || 'Custom')
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

  return `/**
 * Phaser WebGL PostFXPipeline for "${packet.label}" (${packet.id})
 * Generated deterministically from Scholomance custom shader packet.
 */
export class ${className}Pipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({
      game,
      name: '${packet.id}',
      fragShader: \`#version 300 es
precision highp float;

out vec4 fragColor;

uniform float u_time;
uniform vec2 u_resolution;
uniform float u_resonance;
uniform int u_school;
uniform float u_vowel_density;
uniform vec3 u_palette0;

${packet.fragmentSource}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  fragColor = pbMain(uv, u_time, u_resonance);
}
\`
    });
  }

  onPreRender() {
    // Inject variables from spelling/time registry
    this.set1f('u_time', this.game.registry.get('clock.elapsedSeconds') || 0.0);
    this.set2f('u_resolution', this.renderer.width, this.renderer.height);
    this.set1f('u_resonance', this.game.registry.get('verse.resonance') || 0.5);
    this.set1i('u_school', this.game.registry.get('spell.schoolIndex') || 0);
    this.set1f('u_vowel_density', this.game.registry.get('verse.vowelDensity') || 0.5);
  }
}
`;
}
