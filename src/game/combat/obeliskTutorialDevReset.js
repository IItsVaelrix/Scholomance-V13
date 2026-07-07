import { clearStormheartTutorialProgress } from '../inventory/inventoryService.js';
import { clearObeliskTutorialXpDiscoveries } from '../character/scholomanceXpService.js';

/**
 * Dev-only: reset obelisk puzzle progress when entering combat so testers
 * get a fresh tower each visit. Production builds skip this entirely.
 */
export function resetObeliskTutorialForDevSession() {
  if (!import.meta.env.DEV) return false;
  clearStormheartTutorialProgress();
  clearObeliskTutorialXpDiscoveries();
  return true;
}