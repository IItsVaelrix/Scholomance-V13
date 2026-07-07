// src/domain/index.ts
// Shared domain primitives contract
export interface Entity {
  id: string;
  type: string;
}

export interface CombatEncounter extends Entity {
  type: 'combat';
  participants: string[];
}

export interface AudioTrack extends Entity {
  type: 'audio';
  url: string;
}
