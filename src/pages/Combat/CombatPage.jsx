import { useState, useRef, useEffect, useMemo } from 'react';
import { resetObeliskTutorialForDevSession } from '../../game/combat/obeliskTutorialDevReset.js';
import ArenaCombatView from './ArenaCombatView.jsx';
import { resolveCombatCastScore } from '../../game/combat/combatCastScoring.js';
import { resolveCombatWeaveCast } from '../../game/combat/combatWeaveCast.js';
import {
  installSceneContextBridge,
  requestSceneContext,
} from '../../game/combat/sceneContextBridge.js';
import { mergeSelectedCombatTarget } from '../../game/combat/combatTargetSelection.js';
import {
  deriveCastModeHint,
  extractParsedClauses,
  findSceneTargetLabel,
  lookupSceneEnemyToken,
  resolveWeaveTargetsFromParsed,
} from '../../game/combat/weave-scene-targets.js';
import { shouldEngageCombatBattle } from '../../game/combat/sentinelRobots.js';
import {
  computeThreatMap,
  lookupWeaveToken,
  OBELISK_DISCOVERY_FLASH_XP,
  parseWeave,
  resolveWeaveLexeme,
  SCHOLOMANCE_XP_ACTIONS,
  tokenize,
} from '../../lib/combat/combatCodex.adapter.js';
import { Sparkles, Zap, Trash2, Terminal } from 'lucide-react';
import CombatCommandsConsole from '../../ui/combat/CombatCommandsConsole.jsx';
import '../DivWand/DivWandPage.css'; // Reuse the sleek DivWand CSS
import './CombatPage.css';
import { getScholomanceCombatBlock, grantScholomanceXpForAction } from '../../game/character/scholomanceXpService.js';
import {
  buildCompendiumRuntimeContext,
  getSpellweaveCompendiumLedger,
  recordCompendiumDiscoveries,
} from '../../game/combat/spellweaveCompendium.persistence.js';
import DiscoveryFlash from '../../ui/combat/DiscoveryFlash.jsx';
import CombatResultsOverlay from '../../ui/combat/CombatResultsOverlay.jsx';
import CombatBeastiaryOverlay from '../../ui/combat/CombatBeastiaryOverlay.jsx';
import SpellweaveCompendiumOverlay from '../../ui/combat/SpellweaveCompendiumOverlay.jsx';
import CombatResourceBars from '../../ui/combat/CombatResourceBars.jsx';
import CombatMatrixIntro from '../../ui/combat/CombatMatrixIntro.jsx';
import PolarisMatrixIntro from '../../ui/world/PolarisMatrixIntro.jsx';
import TacticalTileTooltip from './TacticalTileTooltip.jsx';
import TacticalOverlayControls from './TacticalOverlayControls.jsx';
import { resolveTransitionMode } from '../../phaser/battle-transition.fx.js';
import './TacticalBattleBoard.css';
import {
  buildBestiaryContextFromScene,
  buildBestiaryRuntimeContext,
  buildCombatBestiaryDossier,
  buildCombatDefenderProfile,
} from '../../game/combat/bestiary/index.js';
import {
  COMBAT_BATTLE_ENDED_EVENT,
  COMBAT_BATTLE_STARTED_EVENT,
  markCombatBattleStarted,
  resetCombatBattleEngagement,
} from '../../game/combat/combatBattleIntro.js';
import { getGameVictoryService } from '../../lib/audio/gameVictory.service.js';
import { hasApForSpellweaveInvoke, SPELL_CAST_AP_COST } from '../../game/combat/combatMana.js';
import { ICICLE_SLAM_AP_COST } from '../../game/combat/iceSlimeStaffAbilities.js';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';
import { tryExecuteCombatCommandInput } from '../../game/combat/combatCommands.js';

const WEAVE_FILLER_TOKENS = new Set([
  'THE', 'A', 'AN', 'MY', 'YOUR', 'HIS', 'HER', 'THEIR', 'OUR', 'ITS',
  'OF', 'FOR', 'FROM', 'INTO', 'THROUGH', 'UPON', 'AGAINST', 'WITHIN',
  'THIS', 'THAT', 'THESE', 'THOSE',
]);

const CLAUSE_LABELS = {
  legal: 'BRIDGE STABLE',
  inverted: 'ORDER INVERTED',
  unfocused: 'NEEDS OBJECT',
  dangling: 'DANGLING MODIFIER',
  collapsed: 'SYNTACTIC COLLAPSE',
  inert: 'AWAITING ANCHOR',
};

const CLAUSE_MESSAGES = {
  legal: 'Intent and object are bound in spoken order.',
  inverted: 'Object appears before its intent; the clause recoils.',
  unfocused: 'An intent has force, but no registry object to receive it.',
  dangling: 'A modifier is present without an intent to bind.',
  collapsed: 'A clause is carrying too many intents.',
  inert: 'No weave intent, object, or modifier has been found.',
};

function classifyToken(token, sceneContext = null) {
  const semantic = lookupWeaveToken(token);
  if (semantic) {
    return {
      token,
      role: semantic.type,
      status: 'semantic',
      detail: semantic.manner || semantic.octantLabel || semantic.intent || semantic.category || semantic.chainType || 'registered',
    };
  }
  const nlp = resolveWeaveLexeme(token);
  if (nlp && nlp.source !== 'registry') {
    const resolved = lookupWeaveToken(nlp.token);
    return {
      token,
      role: resolved?.type || 'LEXEME',
      status: 'nlp',
      canonical: nlp.token,
      detail: `${nlp.source} → ${nlp.token.toLowerCase()}`,
    };
  }
  const enemy = lookupSceneEnemyToken(token, sceneContext);
  if (enemy) {
    return {
      token,
      role: 'ENEMY',
      status: 'semantic',
      detail: enemy.target.label,
    };
  }
  if (WEAVE_FILLER_TOKENS.has(token)) {
    return {
      token,
      role: 'FILLER',
      status: 'filler',
      detail: 'ignored grammar glue',
    };
  }
  return {
    token,
    role: 'UNKNOWN',
    status: 'unknown',
    detail: 'not in spellweave registry',
  };
}

function buildWeaveFeedback(weave, sceneContext = null) {
  const rawTokens = tokenize(weave).map((token) => token.toUpperCase());
  const tokens = rawTokens.map((token) => classifyToken(token, sceneContext));
  const unknownTokens = tokens.filter((token) => token.status === 'unknown');
  const nlpTokens = tokens.filter((token) => token.status === 'nlp');
  const parsed = parseWeave(weave);
  const resolvedTargets = sceneContext
    ? resolveWeaveTargetsFromParsed(parsed, sceneContext, weave)
    : null;
  const modeHint = resolvedTargets?.modeHint
    || deriveCastModeHint(extractParsedClauses(parsed));
  const targetHints = (resolvedTargets?.clauses || []).map((clause) => {
    const source = clause.nameToken || clause.objectToken || 'TARGET';
    if (!clause.resolvedTarget) {
      return `${source} → unresolved`;
    }
    const label = findSceneTargetLabel(sceneContext, clause.resolvedTarget.id);
    return `${source} → ${label}`;
  });
  const activeClauses = parsed.clauses.filter((clause) => clause.legality !== 'inert');
  const worstClause = activeClauses.find((clause) => clause.legality === 'collapsed')
    || activeClauses.find((clause) => clause.legality === 'inverted')
    || activeClauses.find((clause) => clause.legality === 'dangling')
    || activeClauses.find((clause) => clause.legality === 'unfocused')
    || activeClauses[0]
    || parsed.clauses[0]
    || { legality: 'inert' };

  if (!weave.trim()) {
    return {
      status: 'IDLE',
      label: 'AWAITING WEAVE',
      message: 'Type an intent-object clause, for example: REND FLESH or OFFENSIVE FLESH.',
      parsed,
      tokens,
      targetHints,
      resolvedTargets,
      modeHint,
    };
  }

  if (unknownTokens.length > 0) {
    return {
      status: 'RED',
      label: 'TOKEN UNRESOLVED',
      message: `${unknownTokens.map((token) => token.token).join(', ')} ignored by the parser.`,
      parsed,
      tokens,
      targetHints,
      resolvedTargets,
      modeHint,
    };
  }

  if (nlpTokens.length > 0 && activeClauses.every((clause) => clause.legality === 'legal')) {
    const counsel = nlpTokens.map((token) => `${token.token}→${token.canonical}`).join(', ');
    return {
      status: 'GREEN',
      label: 'NLP BRIDGE',
      message: `Natural speech resolved (${counsel}). ${CLAUSE_MESSAGES.legal}`,
      parsed,
      tokens,
      targetHints,
      resolvedTargets,
      modeHint,
    };
  }

  const legality = worstClause.legality;
  const status = legality === 'legal'
    ? 'GREEN'
    : (legality === 'inverted' || legality === 'collapsed' ? 'RED' : 'YELLOW');

  const targetMessage = [
    modeHint ? `Mode: ${modeHint}` : null,
    targetHints.length > 0 ? `Targets: ${targetHints.join(' · ')}` : null,
  ].filter(Boolean).join(' · ') || null;

  return {
    status,
    label: CLAUSE_LABELS[legality] || 'WEAVE UNSTABLE',
    message: targetMessage || CLAUSE_MESSAGES[legality] || 'The weave needs a clearer intent-object bridge.',
    parsed,
    tokens,
    targetHints,
    resolvedTargets,
    modeHint,
  };
}

export default function CombatPage() {
  const devObeliskResetRef = useRef(false);
  if (import.meta.env.DEV && !devObeliskResetRef.current) {
    devObeliskResetRef.current = true;
    resetObeliskTutorialForDevSession();
  }

  const [verse, setVerse] = useState('');
  const [weave, setWeave] = useState('');
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [commandLogs, setCommandLogs] = useState([]);
  const [commandInput, setCommandInput] = useState('');
  const [commandsOpen, setCommandsOpen] = useState(() => import.meta.env.DEV);
  const terminalRef = useRef(null);
  const verseEditorRef = useRef(null);
  const weaveInputRef = useRef(null);
  const handleArenaCastRef = useRef(() => {});
  
  const [tooltip, setTooltip] = useState(null);
  const [combatStats, setCombatStats] = useState(null);
  const [sceneContext, setSceneContext] = useState(null);
  const [discoveryFlash, setDiscoveryFlash] = useState(null);
  const [combatResults, setCombatResults] = useState(null);
  const [battleStarted, setBattleStarted] = useState(false);
  const [battleIntroActive, setBattleIntroActive] = useState(false);
  const [polarisIntroActive, setPolarisIntroActive] = useState(false);
  const [selectedCombatTarget, setSelectedCombatTarget] = useState(null);
  const [beastiaryDossier, setBeastiaryDossier] = useState(null);
  const [compendiumOpen, setCompendiumOpen] = useState(false);
  const [compendiumLedger, setCompendiumLedger] = useState(() => getSpellweaveCompendiumLedger());
  const [battleBoard, setBattleBoard] = useState(null);
  const [threatMap, setThreatMap] = useState(null);
  const [transitionMode, setTransitionMode] = useState('full');
  const [activeOverlays, setActiveOverlays] = useState({
    movement: false,
    threat: false,
    spell: false,
    premium: true,
    school: true,
    lineOfSight: false,
  });
  const battleStartedRef = useRef(false);
  const battleIntroActiveRef = useRef(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    battleStartedRef.current = battleStarted;
  }, [battleStarted]);

  useEffect(() => {
    battleIntroActiveRef.current = battleIntroActive;
  }, [battleIntroActive]);

  useEffect(() => {
    const onEscape = (e) => {
      if (e.key === 'Escape') {
        if (beastiaryDossier) setBeastiaryDossier(null);
        else if (compendiumOpen) setCompendiumOpen(false);
        else if (commandsOpen) setCommandsOpen(false);
        else if (tooltip) {
          setTooltip(null);
        }
      }
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [beastiaryDossier, compendiumOpen, commandsOpen, tooltip]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target?.isContentEditable) return;
      const tag = event.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (event.key === 'k' || event.key === 'K') {
        setCompendiumOpen((open) => !open);
      }
      if (event.key === '`') {
        event.preventDefault();
        setCommandsOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handlePolarisIntroComplete = () => {
    setPolarisIntroActive(false);
  };

  const handleBattleIntroComplete = () => {
    setBattleIntroActive(false);
    setBattleStarted(true);
    markCombatBattleStarted();
    try {
      const countKey = 'tactical-battle-count:combat-arena';
      const battleCount = Number(sessionStorage.getItem(countKey) || 0) + 1;
      sessionStorage.setItem(countKey, String(battleCount));
    } catch {
      // ignore storage failures
    }
    // Auto-enable school and premium terrain overlays so tile types are
    // immediately visible when the battle board appears.
    setActiveOverlays((prev) => {
      const next = { ...prev, school: true, premium: true };
      window.dispatchEvent(new CustomEvent('tactical-overlay-change', { detail: next }));
      return next;
    });
    window.dispatchEvent(new CustomEvent(COMBAT_BATTLE_STARTED_EVENT));
  };

  const handleToggleOverlay = (key) => {
    setActiveOverlays((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      window.dispatchEvent(new CustomEvent('tactical-overlay-change', { detail: next }));
      return next;
    });
  };

  const handleCombatResultsDismiss = () => {
    setCombatResults(null);
    setBattleStarted(false);
    resetCombatBattleEngagement();
    getGameVictoryService().stopVictory();
    window.dispatchEvent(new CustomEvent(COMBAT_BATTLE_ENDED_EVENT));
  };
  const weaveFeedback = useMemo(
    () => buildWeaveFeedback(weave, sceneContext),
    [weave, sceneContext],
  );
  const hasInvokeAp = combatStats == null
    ? true
    : hasApForSpellweaveInvoke(combatStats.attackPointsRemaining);
  const canInvoke = Boolean(
    verse.trim()
    && weave.trim()
    && weaveFeedback.status !== 'RED'
    && hasInvokeAp
    && !combatStats?.spellweaveUsed,
  );
  const hasIcicleSlam = combatStats?.grantedAbilities?.includes('icicle_slam');
  const canIcicleSlam = Boolean(
    battleStarted
    && !combatResults
    && hasIcicleSlam
    && (combatStats?.icicleSlamCooldown ?? 0) === 0
    && (combatStats?.attackPointsRemaining ?? 0) >= ICICLE_SLAM_AP_COST
    && (
      selectedCombatTarget?.targetId
      || sceneContext?.targets?.some((entry) => entry.kind === 'combatant' && entry.inRange)
    ),
  );

  useEffect(() => {
    if (verseEditorRef.current && verseEditorRef.current.textContent !== verse) {
      verseEditorRef.current.textContent = verse;
    }
  }, [verse]);

  const isSpellweaveFocused = () => {
    const active = document.activeElement;
    return active === verseEditorRef.current || active === weaveInputRef.current;
  };

  const blurSpellweaveFocus = () => {
    const active = document.activeElement;
    if (active === verseEditorRef.current || active === weaveInputRef.current) {
      active.blur();
    }
  };

  const runCombatCommand = (rawInput) => {
    const trimmed = String(rawInput ?? '').trim();
    if (!trimmed) return false;

    const result = tryExecuteCombatCommandInput(trimmed, {
      onArenaAction: (action) => handleArenaCastRef.current(action),
    });
    if (!result) return false;

    const ts = new Date().toISOString().split('T')[1].slice(0, 8);
    setCommandLogs((prev) => [
      ...prev,
      { type: 'info', text: `> ${trimmed}`, ts },
      {
        type: result.ok ? 'success' : 'error',
        text: result.message,
        ts,
      },
    ]);

    if (result.sideEffects?.includes('skip-polaris-intro')) {
      setPolarisIntroActive(false);
      setBattleIntroActive(false);
      setBattleStarted(false);
      resetCombatBattleEngagement();
    }

    setCommandInput('');
    return true;
  };

  const handleSpellweaveKeyDown = (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      blurSpellweaveFocus();
    }
  };

  const handleSpellweaveKeyUp = (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
    }
  };

  useEffect(() => {
    const onEscape = (event) => {
      if (event.key !== 'Escape' || !isSpellweaveFocused()) return;
      event.preventDefault();
      event.stopPropagation();
      blurSpellweaveFocus();
    };
    window.addEventListener('keydown', onEscape, true);
    return () => window.removeEventListener('keydown', onEscape, true);
  }, []);

  const handleVerseInput = (event) => {
    setVerse(event.currentTarget.textContent || '');
  };

  useEffect(() => {
    const onStats = (e) => {
      setCombatStats(e?.detail ?? null);
    };
    window.addEventListener('combat-stats-changed', onStats);
    return () => window.removeEventListener('combat-stats-changed', onStats);
  }, []);

  useEffect(() => {
    const uninstall = installSceneContextBridge();
    const onSceneContext = (e) => {
      if (e?.detail) setSceneContext(e.detail);
    };
    window.addEventListener('scene-context-state', onSceneContext);
    return () => {
      uninstall();
      window.removeEventListener('scene-context-state', onSceneContext);
    };
  }, []);

  useEffect(() => {
    const onSpellFizzle = (e) => {
      const reason = e?.detail?.reason;
      const ts = new Date().toISOString().split('T')[1].slice(0, 8);
      const message = reason === 'no_ap'
        ? `Not enough AP to Invoke (costs ${SPELL_CAST_AP_COST}).`
        : reason === 'already_invoked'
          ? 'You already Invoked spellweave this turn.'
          : reason === 'out_of_range'
            ? 'Target is out of spell range.'
            : reason === 'syntactic_collapse'
              ? 'The weave collapsed before it could land.'
              : 'The spell fizzled.';
      setTerminalLogs((prev) => [...prev, { type: 'error', text: `[INVOKE] ${message}`, ts }]);
    };
    window.addEventListener('combat-spell-fizzle', onSpellFizzle);
    return () => window.removeEventListener('combat-spell-fizzle', onSpellFizzle);
  }, []);

  useEffect(() => {
    const onTargetMiss = (e) => {
      const message = e?.detail?.message || 'No valid target bound to the weave.';
      const ts = new Date().toISOString().split('T')[1].slice(0, 8);
      setTerminalLogs((prev) => [...prev, { type: 'error', text: `[TARGET] ${message}`, ts }]);
    };
    window.addEventListener('combat-target-miss', onTargetMiss);
    return () => window.removeEventListener('combat-target-miss', onTargetMiss);
  }, []);

  useEffect(() => {
    const onTargetSelected = (e) => {
      const detail = e?.detail || {};
      setSelectedCombatTarget(detail.targetId ? detail : null);
      if (!detail.targetId) return;
      const ts = new Date().toISOString().split('T')[1].slice(0, 8);
      const label = detail.shortLabel || detail.label || detail.targetId;
      const range = detail.inRange ? 'in range' : 'out of range';
      setTerminalLogs((prev) => [
        ...prev,
        { type: 'info', text: `[TARGET] Locked ${label} (${range})`, ts },
      ]);
    };
    window.addEventListener('combat-target-selected', onTargetSelected);
    return () => window.removeEventListener('combat-target-selected', onTargetSelected);
  }, []);

  useEffect(() => {
    if (sceneContext?.selectedCombatTargetId) {
      const label = findSceneTargetLabel(sceneContext, sceneContext.selectedCombatTargetId);
      setSelectedCombatTarget({
        targetId: sceneContext.selectedCombatTargetId,
        label,
      });
    } else if (sceneContext && !sceneContext.selectedCombatTargetId) {
      setSelectedCombatTarget(null);
    }
  }, [sceneContext]);

  // Feed the current incantation (verse + weave) to the Phaser scene so a swing
  // can be enchanted. Respond to the scene's request, and push on every change.
  useEffect(() => {
    const emit = () => window.dispatchEvent(new CustomEvent('incantation-state', { detail: { verse, weave } }));
    const onRequest = () => emit();
    window.addEventListener('request-incantation-state', onRequest);
    emit(); // push current value now (covers scene mounting before/after this effect)
    return () => window.removeEventListener('request-incantation-state', onRequest);
  }, [verse, weave]);

  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (e.button !== 0) return;
      // Keep inspect tooltip alive for in-tooltip actions (e.g. View Beastiary).
      if (e.target.closest?.('.combat-tooltip')) return;
      setTooltip(null);
    };
    window.addEventListener('mousedown', handleGlobalClick);
    return () => window.removeEventListener('mousedown', handleGlobalClick);
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  const ensureBattleEngaged = async (context = sceneContext) => {
    if (battleStartedRef.current) return;
    const freshContext = context || await requestSceneContext();
    if (!shouldEngageCombatBattle({
      sentinels: freshContext?.sentinels,
      combatVictoryAchieved: freshContext?.combatVictoryAchieved,
    })) {
      return;
    }
    setBattleIntroActive(false);
    setBattleStarted(true);
    markCombatBattleStarted();
    window.dispatchEvent(new CustomEvent(COMBAT_BATTLE_STARTED_EVENT));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  };

  const openBeastiaryForEnemy = (enemyId, entitySnapshot = null) => {
    if (!enemyId) return;
    const authorityContext = sceneContext;
    const context = entitySnapshot
      ? buildBestiaryRuntimeContext({
        enemyId,
        target: authorityContext?.targets?.find((entry) => entry.id === enemyId),
        entitySnapshot,
      })
      : buildBestiaryContextFromScene(authorityContext, enemyId);
    const dossier = buildCombatBestiaryDossier(context);
    if (dossier) setBeastiaryDossier(dossier);
    setTooltip(null);
  };

  const handleCast = async () => {
    try {
      const freshContext = await requestSceneContext();
      if (freshContext) setSceneContext(freshContext);
      await ensureBattleEngaged(freshContext || sceneContext);
      const authorityContext = freshContext || sceneContext;
      const parsed = parseWeave(weave);
      const weaveResolved = resolveWeaveTargetsFromParsed(parsed, authorityContext || undefined, weave);
      const resolvedTargets = mergeSelectedCombatTarget(
        weaveResolved,
        authorityContext?.selectedCombatTargetId ?? null,
        authorityContext || undefined,
      );
      const defender = resolvedTargets.primaryTargetId
        ? buildCombatDefenderProfile(
          buildBestiaryContextFromScene(authorityContext, resolvedTargets.primaryTargetId),
        )
        : null;
      const scholomance = getScholomanceCombatBlock();
      const compendiumContext = buildCompendiumRuntimeContext();
      const castScore = await resolveCombatCastScore({
        verse,
        weave,
        defender,
        defenderSchool: defender?.school ?? null,
        scholomance,
        compendiumContext,
      });
      const result = resolveCombatWeaveCast({
        verse,
        weave,
        sceneContext: authorityContext,
        scoreData: castScore.scoreData,
        analyzedDoc: castScore.analyzedDoc,
        defender,
        defenderSchool: defender?.school ?? null,
      });
      const ts = new Date().toISOString().split('T')[1].slice(0, 8);
      
      window.dispatchEvent(new CustomEvent('combat-cast', { 
        detail: { ...result, text: verse, weave, sceneContext: authorityContext } 
      }));
      
      const newLogs = [];
      newLogs.push({ type: 'info', text: `[CAST] Verse: "${verse}" | Weave: "${weave}"`, ts });

      const targetId = result.resolvedTargets?.primaryTargetId;
      if (targetId) {
        const targetLabel = findSceneTargetLabel(authorityContext, targetId) || targetId;
        const mode = result.resolvedTargets?.modeHint ? ` [${result.resolvedTargets.modeHint}]` : '';
        newLogs.push({ type: 'info', text: `[TARGET] ${targetLabel}${mode}`, ts });
      } else if (result.resolvedTargets?.unresolvedObjects?.length) {
        newLogs.push({
          type: 'error',
          text: `[TARGET] Unresolved: ${result.resolvedTargets.unresolvedObjects.join(', ')}`,
          ts,
        });
      }
      
      if (result.failureCast) {
        grantScholomanceXpForAction(SCHOLOMANCE_XP_ACTIONS.WEAVE_CAST_FAILURE);
        newLogs.push({ type: 'error', text: `SYNTACTIC COLLAPSE! The weave has frayed.`, ts });
      } else {
        const intentStr = result.intent.bridgeIntent || result.intent.speechAct || 'UNKNOWN';
        newLogs.push({
          type: 'success',
          text: `Intent: ${intentStr} | Damage: ${result.damage} | School: ${result.school} | AP: ${SPELL_CAST_AP_COST}`,
          ts,
        });
        if (result.commentary) {
          newLogs.push({ type: 'info', text: `Analysis: ${result.commentary}`, ts });
        }
        const tierLines = castScore.scoreData?.compendiumCounselLines
          || castScore.scoreData?.tierBreakdown?.map((entry) => (
            `[COMPENDIUM] ${entry.counsel} (+${entry.amplifier.toFixed(2)})`
          ))
          || [];
        for (const line of tierLines.slice(0, 3)) {
          newLogs.push({ type: 'success', text: line, ts });
        }
        if (castScore.scoreData?.newlyDiscoveredEntryIds?.length) {
          const ledger = recordCompendiumDiscoveries(castScore.scoreData.newlyDiscoveredEntryIds);
          setCompendiumLedger(ledger);
          grantScholomanceXpForAction(SCHOLOMANCE_XP_ACTIONS.COMPENDIUM_DISCOVERY);
        }
      }
      
      setTerminalLogs(prev => [...prev, ...newLogs]);
    } catch (e) {
      setTerminalLogs(prev => [...prev, { type: 'error', text: `Engine Error: ${e.message}`, ts: new Date().toISOString().split('T')[1].slice(0, 8) }]);
    }
  };

  const handleArenaCast = (action) => {
    console.log('[Combat] Action from arena:', action);
    const ts = new Date().toISOString().split('T')[1].slice(0, 8);
    
    if (action.type === 'error') {
      setTerminalLogs(prev => [...prev, { type: 'error', text: `Phaser Input Crash: ${action.text}`, ts }]);
      return;
    }

    if (action.type === 'combat-victory') {
      const victory = getGameVictoryService();
      victory.prime();
      void victory.playVictory();
      setTerminalLogs(prev => [
        ...prev,
        { type: 'success', text: `[VICTORY] ${action.text}`, ts },
      ]);
      if (action.report) {
        setCombatResults({
          id: Date.now(),
          report: action.report,
        });
      }
      return;
    }

    if (action.type === 'polaris-teleport-start') {
      setPolarisIntroActive(true);
      setTerminalLogs((prev) => [
        ...prev,
        { type: 'info', text: '[PORTAL] Dimensional transit to Polaris initiated...', ts },
      ]);
      return;
    }

    if (action.type === 'polaris-forest-ready') {
      setTerminalLogs((prev) => [
        ...prev,
        { type: 'success', text: `[POLARIS] ${action.text || 'Welcome to Polaris.'}`, ts },
      ]);
      return;
    }

    if (action.type === 'battle-board-compiled') {
      const boardState = action.boardState;
      setBattleBoard(boardState || null);
      if (boardState) {
        const entities = (boardState.units || []).map((unit) => ({
          id: unit.entityId,
          x: unit.x,
          y: unit.y,
          side: unit.side,
          meleeRange: 1,
          spellRange: unit.side === 'enemy' ? 3 : 1,
          attack: 10,
          spellPower: 10,
        }));
        setThreatMap(computeThreatMap(boardState, entities));
      }
      return;
    }

    if (action.type === 'sentinel-aggro') {
      setTerminalLogs(prev => [
        ...prev,
        { type: 'error', text: `[SENTINEL] ${action.text}`, ts },
      ]);
      if (!battleStartedRef.current && !battleIntroActiveRef.current) {
        try {
          const countKey = 'tactical-battle-count:combat-arena';
          const battleCount = Number(sessionStorage.getItem(countKey) || 0);
          setTransitionMode(resolveTransitionMode({ battleCount, isBoss: false, isDiscovery: battleCount === 0 }));
        } catch {
          setTransitionMode('full');
        }
        setBattleIntroActive(true);
      }
      return;
    }

    if (action.type === 'portal-unsealed') {
      setBattleIntroActive(false);
      setBattleStarted(false);
      resetCombatBattleEngagement();
      setTerminalLogs(prev => [
        ...prev,
        { type: 'info', text: `[PORTAL] ${action.text}`, ts },
        { type: 'info', text: '[PORTAL] Free roam — walk to the northeast gate and click the portal from an adjacent tile.', ts },
      ]);
      return;
    }

    if (action.type === 'portal-warden-spawn') {
      setTerminalLogs(prev => [
        ...prev,
        { type: 'error', text: `[PORTAL] ${action.text}`, ts },
      ]);
      setBattleIntroActive(false);
      setBattleStarted(true);
      markCombatBattleStarted();
      window.dispatchEvent(new CustomEvent(COMBAT_BATTLE_STARTED_EVENT));
      return;
    }

    if (action.type === 'sentinel-defeated') {
      setTerminalLogs(prev => [
        ...prev,
        {
          type: 'success',
          text: `[SENTINEL] ${action.label || action.id} offline — containment matrix collapsed.`,
          ts,
        },
      ]);
      return;
    }

    if (action.type === 'sentinel-ability') {
      const lines = Array.isArray(action.logLines) ? action.logLines : [];
      if (lines.length) {
        setTerminalLogs((prev) => [
          ...prev,
          ...lines.map((text) => ({
            type: action.missed ? 'info' : 'error',
            text,
            ts,
          })),
        ]);
      }
      return;
    }

    if (action.type === 'obelisk-reject') {
      const label = action.text || 'rejected';
      const hintLine = action.hint ? ` ${action.hint}` : '';
      setTerminalLogs(prev => [
        ...prev,
        { type: 'info', text: `[OBELISK] ${label}${hintLine}`, ts },
      ]);
      return;
    }

    if (action.type === 'obelisk-discovery') {
      const pathLabel = action.path === 'siphon' ? 'SIPHON' : 'OVERLOAD';
      const discoveryLogs = [
        { type: 'success', text: `[OBELISK ${pathLabel}] ${action.text}`, ts },
        { type: 'info', text: `Stormheart Orb exposed at central crown socket.`, ts },
      ];
      if (action.path === 'siphon' && action.verdict?.manaGrant) {
        discoveryLogs.push({
          type: 'success',
          text: `[SIPHON REWARD] +${action.verdict.manaGrant} movement points restored.`,
          ts,
        });
      }
      setTerminalLogs(prev => [...prev, ...discoveryLogs]);
      setDiscoveryFlash({
        id: Date.now(),
        xpAmount: action.xpAmount ?? OBELISK_DISCOVERY_FLASH_XP,
      });
      return;
    }

    if (action.type === 'gather') {
      const gatherTitle = action.ok ? 'Gather Success' : 'Gather Failed';
      const gatherDetails = [
        action.ok ? `Yield: ${action.yield}` : `Denied: ${action.code}`,
        action.toolId ? `Tool: ${action.toolId}` : null,
      ].filter(Boolean);
      if (action.characterLine) {
        setTerminalLogs(prev => [
          ...prev,
          {
            type: action.ok ? 'success' : 'error',
            text: action.ok ? `[GATHER] ${action.characterLine}` : `[GATHER] ${action.code}`,
            ts,
          },
        ]);
      }
      setTooltip({
        x: action.screenX || window.innerWidth / 2,
        y: action.screenY || window.innerHeight / 2,
        title: gatherTitle,
        details: action.characterLine ? [...gatherDetails, action.characterLine] : gatherDetails,
      });
      return;
    }

    if (action.type === 'obelisk-loot') {
      setTerminalLogs(prev => [
        ...prev,
        {
          type: action.duplicate ? 'info' : 'success',
          text: action.duplicate ? `[REWARD] ${action.text}` : `[REWARD] ${action.itemName || action.itemId} acquired.`,
          ts,
        },
      ]);
      setTooltip({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        title: action.duplicate ? 'Empty Crown Socket' : 'Stormheart Orb',
        details: [
          action.text,
          action.itemId,
        ].filter(Boolean),
      });
      return;
    }

    if (action.type === 'combat-chest-spawn') {
      setTerminalLogs(prev => [
        ...prev,
        {
          type: 'info',
          text: `[CHEST] ${action.label} materializes at (${action.tx}, ${action.ty}).`,
          ts,
        },
      ]);
      return;
    }

    if (action.type === 'combat-loot') {
      const logType = action.duplicate || action.inventoryFull || action.empty ? 'info' : 'success';
      setTerminalLogs(prev => [
        ...prev,
        {
          type: logType,
          text: `[LOOT] ${action.text}`,
          ts,
        },
      ]);
      if (action.granted || action.duplicate || action.empty) {
        setTooltip({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
          title: action.chestLabel || (action.duplicate ? 'Already Claimed' : (action.itemName || 'Loot Chest')),
          details: [
            action.text,
            action.itemId,
          ].filter(Boolean),
        });
      }
      return;
    }
    
    const title = action.title || 'Combat Grid';
    const details = Array.isArray(action.details) ? [...action.details] : [];
    const characterLine = action.characterLine || null;
    const text = characterLine
      ? `Inspected (${action.tx}, ${action.ty}) — "${characterLine}"`
      : `Inspected Tile (${action.tx}, ${action.ty})`;

    setTerminalLogs(prev => [
      ...prev,
      { type: 'info', text, ts },
      ...(characterLine ? [{ type: 'info', text: `"${characterLine}"`, ts }] : []),
    ]);


    if (action.screenX && action.screenY) {
      setTooltip({
        x: action.screenX,
        y: action.screenY,
        title,
        details: characterLine ? [...details, characterLine] : details,
        enemyId: action.enemyId || action.sentinelId || null,
        bestiaryAvailable: !!action.bestiaryAvailable,
        entitySnapshot: action.bestiarySnapshot || null,
        battleTile: action.isGrid ? action.battleTile : null,
      });
    }
  };
  handleArenaCastRef.current = handleArenaCast;

  return (
    <div className="combat-page-shell">
      <ArenaCombatView onCast={handleArenaCast} />

      {battleIntroActive && (
        <CombatMatrixIntro
          reducedMotion={prefersReducedMotion}
          mode={transitionMode}
          onComplete={handleBattleIntroComplete}
        />
      )}

      {polarisIntroActive && (
        <PolarisMatrixIntro
          reducedMotion={prefersReducedMotion}
          onComplete={handlePolarisIntroComplete}
        />
      )}

      {battleStarted && !battleIntroActive && (
        <TacticalOverlayControls
          activeOverlays={activeOverlays}
          onToggleOverlay={handleToggleOverlay}
          compact
        />
      )}

      {discoveryFlash && (
        <DiscoveryFlash
          key={discoveryFlash.id}
          xpAmount={discoveryFlash.xpAmount}
          reducedMotion={prefersReducedMotion}
          onComplete={() => setDiscoveryFlash(null)}
        />
      )}

      {combatResults && (
        <CombatResultsOverlay
          key={combatResults.id}
          report={combatResults.report}
          reducedMotion={prefersReducedMotion}
          onDismiss={handleCombatResultsDismiss}
        />
      )}

      {beastiaryDossier && (
        <CombatBeastiaryOverlay
          dossier={beastiaryDossier}
          onDismiss={() => setBeastiaryDossier(null)}
        />
      )}

      {compendiumOpen && (
        <SpellweaveCompendiumOverlay
          ledger={compendiumLedger}
          onDismiss={() => setCompendiumOpen(false)}
        />
      )}
      
      {/* Tooltip Overlay */}
      {tooltip && (
        <div
          className={`combat-tooltip${tooltip.bestiaryAvailable ? ' combat-tooltip--interactive' : ''}`}
          role={tooltip.bestiaryAvailable ? 'dialog' : 'tooltip'}
          style={{
            left: tooltip.x + 15,
            top: tooltip.y + 15,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="combat-tooltip__close-btn"
            aria-label="Close tooltip"
            onClick={(e) => {
              e.stopPropagation();
              setTooltip(null);
            }}
          >
            ×
          </button>
          <h4 className="combat-tooltip__title">
            {tooltip.title}
          </h4>
          <ul className="combat-tooltip__list">
            {tooltip.details.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>

          {tooltip.battleTile && (
            <TacticalTileTooltip
              tile={tooltip.battleTile}
              threatMap={threatMap}
              visible={true}
              inline={true}
            />
          )}

          {tooltip.enemyId && tooltip.entitySnapshot && (
            <button
              type="button"
              className="combat-tooltip__beastiary-btn"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openBeastiaryForEnemy(tooltip.enemyId, tooltip.entitySnapshot);
              }}
            >
              View Beastiary
            </button>
          )}
        </div>
      )}
      
      <div className="combat-hud-stack" aria-label="Combat interface">
        {/* Combat Stat Tree — centered top rail */}
        {!combatResults && combatStats && (
          <div className="combat-stat-card">
            <CombatResourceBars stats={combatStats} />
            {battleStarted && (
              <>
                <div className="combat-stat-card__target" aria-live="polite">
                  <span className="combat-stat-card__target-label">Target</span>
                  <b className="combat-stat-card__target-value">
                    {selectedCombatTarget?.shortLabel
                      || selectedCombatTarget?.label
                      || (selectedCombatTarget?.targetId
                        ? findSceneTargetLabel(sceneContext, selectedCombatTarget.targetId)
                        : null)
                      || 'Tab / right-click enemy'}
                  </b>
                </div>
                <div className="combat-stat-card__actions">
                  <button
                    className="combat-action-btn combat-action-btn--attack"
                    onClick={() => window.dispatchEvent(new CustomEvent('combat-attack'))}
                    disabled={combatStats.attackUsed}
                  >
                    Attack (F)
                  </button>
                  {hasIcicleSlam && (
                    <button
                      className="combat-action-btn combat-action-btn--icicle"
                      onClick={() => window.dispatchEvent(new CustomEvent('combat-icicle-slam'))}
                      disabled={!canIcicleSlam}
                      title={canIcicleSlam
                        ? `Icicle Slam (${ICICLE_SLAM_AP_COST} AP, 3 hits)`
                        : (combatStats?.icicleSlamCooldown ?? 0) > 0
                          ? `Icicle Slam cooling down (${combatStats.icicleSlamCooldown} turns)`
                          : `Need ${ICICLE_SLAM_AP_COST} AP and a distant target`}
                    >
                      Icicle Slam
                    </button>
                  )}
                  <button
                    className="combat-action-btn combat-action-btn--turn"
                    onClick={() => window.dispatchEvent(new CustomEvent('combat-endturn'))}
                  >
                    End Turn (Space)
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* DivWand HUD — centered bottom dock */}
        <div className="dw-container combat-hud">
        <header className="dw-header combat-hud__header">
          <div className="dw-header-title">
            <Sparkles className="dw-header-icon" size={16} aria-hidden="true" />
            <h1 className="dw-header-h1">Combat Spellweave</h1>
            <span className="dw-header-sub">Spellweave Syntactic Bridge</span>
          </div>
          <div className="dw-header-actions">
            <button
              type="button"
              className="dw-btn"
              onClick={() => setCompendiumOpen(true)}
              title="Spellweave Compendium (K)"
            >
              Compendium
            </button>
            <button
              type="button"
              className={`dw-btn combat-commands-console-toggle${commandsOpen ? ' dw-btn--active' : ''}`}
              onClick={() => setCommandsOpen((open) => !open)}
              title="Directive console (`)"
              aria-pressed={commandsOpen}
            >
              <Terminal size={13} aria-hidden="true" />
              CMD
            </button>
            <button
              className="dw-btn dw-btn--primary"
              onClick={handleCast}
              disabled={!canInvoke}
              title={canInvoke
                ? `Invoke Spellweave (${SPELL_CAST_AP_COST} AP, once per turn) — engages battle if needed`
                : combatStats?.spellweaveUsed
                  ? 'Already Invoked this turn'
                  : `Need ${SPELL_CAST_AP_COST} AP to Invoke`}
              aria-label="Cast this spell"
            >
              <Zap size={13} aria-hidden="true" />
              Invoke
            </button>
          </div>
        </header>

        <div className="dw-body combat-hud__body">
          {/* Input Pane */}
          <div className="dw-pane dw-pane--editor combat-hud__editor-pane">
            <div className="dw-pane-bar combat-hud__pane-bar">
              <span className="dw-pane-label">Verse (Incantation)</span>
            </div>
            <div className="dw-textarea-wrap combat-hud__verse-wrap">
              <div
                ref={verseEditorRef}
                className="combat-hud__verse-editor"
                contentEditable
                role="textbox"
                tabIndex={0}
                aria-multiline="true"
                aria-label="Verse input"
                data-placeholder="Speak your verse to shape the aether..."
                onInput={handleVerseInput}
                onKeyDown={handleSpellweaveKeyDown}
                onKeyUp={handleSpellweaveKeyUp}
                onBeforeInput={(event) => event.stopPropagation()}
                onPaste={(event) => event.stopPropagation()}
                suppressContentEditableWarning
              />
            </div>
            <div className="dw-pane-bar combat-hud__pane-bar combat-hud__pane-bar--spaced">
              <span className="dw-pane-label">Weave (Intent Object)</span>
            </div>
            <div className="dw-textarea-wrap combat-hud__weave-wrap">
              <input
                ref={weaveInputRef}
                className="combat-hud__weave-input"
                value={weave}
                onChange={e => setWeave(e.target.value)}
                placeholder="e.g. REND FLESH"
                aria-label="Weave input"
                aria-describedby="combat-syntactic-integrity"
                onKeyDown={handleSpellweaveKeyDown}
                onKeyUp={handleSpellweaveKeyUp}
              />
            </div>
            <div
              id="combat-syntactic-integrity"
              className={`combat-integrity combat-integrity--${weaveFeedback.status.toLowerCase()}`}
              role="status"
              aria-live="polite"
              aria-label="Syntactic integrity"
            >
              <div className="combat-integrity__copy">
                <span className="combat-integrity__label">{weaveFeedback.label}</span>
                <span className="combat-integrity__message">{weaveFeedback.message}</span>
              </div>
              <div className="combat-integrity__metrics" aria-hidden="true">
                <span>{weaveFeedback.parsed.chainType}</span>
                <span>{weaveFeedback.parsed.syntax.clauseCount} clause</span>
                <span>x{weaveFeedback.parsed.syntax.modifierPower.toFixed(2)}</span>
              </div>
            </div>
            <div className="combat-token-strip" aria-label="Live weave token classification">
              {weaveFeedback.tokens.length === 0 ? (
                <span className="combat-token-pill combat-token-pill--ghost">INTENT OBJECT</span>
              ) : weaveFeedback.tokens.map((token, index) => (
                <span
                  key={`${token.token}-${index}`}
                  className={`combat-token-pill combat-token-pill--${token.status}`}
                  title={`${token.role}: ${token.detail}`}
                >
                  <b>{token.token}</b>
                  <small>{token.role}</small>
                </span>
              ))}
            </div>
          </div>

          {/* Terminal / Output Pane */}
          <div className="dw-pane dw-pane--terminal combat-hud__terminal-pane">
            <div className="dw-terminal combat-terminal">
              <div className="combat-terminal__header">
                <div className="combat-terminal__title-group">
                  <span className="combat-terminal__eyebrow">Parser Trace</span>
                  <span className="combat-terminal__label">Syntactic Feedback</span>
                </div>
                <span className="combat-terminal__status">
                  <span className="combat-terminal__status-dot" aria-hidden="true" />
                  linked
                </span>
                <button
                  className="dw-tool-btn combat-terminal__clear"
                  onClick={() => setTerminalLogs([])}
                  aria-label="Clear syntactic feedback terminal"
                >
                  <Trash2 size={12} /> Clear
                </button>
              </div>
              <div className="combat-terminal__content" ref={terminalRef}>
                <div className="combat-terminal__scanline" aria-hidden="true" />
                <div className="combat-terminal__log">
                  {terminalLogs.length === 0 && (
                    <div className="combat-terminal__empty" aria-live="polite">
                      <span className="combat-terminal__prompt">scholo://combat/syntax</span>
                      <span className="combat-terminal__empty-line">parser armed; awaiting verse payload</span>
                      <span className="combat-terminal__empty-line">bridge state: lexical channel open</span>
                      <span className="combat-terminal__empty-line">dev console: ` or Console — /warp polaris</span>
                      <span className="combat-terminal__cursor" aria-hidden="true" />
                    </div>
                  )}
                  {terminalLogs.map((log, i) => (
                    <div key={i} className={`combat-terminal__line combat-terminal__line--${log.type}`}>
                      <span className="combat-terminal__ts">[{log.ts}]</span>
                      <span className="combat-terminal__text">{log.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>

        <div className="combat-commands-anchor" aria-hidden={!commandsOpen}>
          <CombatCommandsConsole
            open={commandsOpen}
            onOpenChange={setCommandsOpen}
            commandInput={commandInput}
            onCommandInputChange={setCommandInput}
            onSubmit={runCombatCommand}
            logs={commandLogs}
            onClearLogs={() => setCommandLogs([])}
          />
        </div>
      </div>
    </div>
  );
}
