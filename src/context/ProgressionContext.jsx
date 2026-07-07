import { createContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { z } from "zod";
import { useAuth } from "../hooks/useAuth.jsx";
import { emitNetworkBytecodeError } from "../lib/bytecode-error.adapter.js";
import { SCHOOLS, getSchoolsByUnlock } from "../data/schools";
import { getLevelFromXp, getLevelProgress, getTierForLevel } from "../lib/progressionUtils";
import { buildAuthorityUrl } from "../lib/apiUrl.js";
import { MASTERY_LEVELS } from "../lib/nexusRegistry.js";
import { emitXPEvent } from "../lib/progressionEvents.js";

export const ProgressionContext = createContext(null);

const defaultProgression = {
  xp: 0,
  unlockedSchools: ["SONIC"],
  lastUpdated: 0,
  achievements: [],
  discoveryHistory: [],
  nexus: {
    discoveredWords: {},
    activeSynergies: []
  }
};

const ProgressionPayloadSchema = z.object({
  xp: z.number().optional(),
  unlockedSchools: z.array(z.string()).optional(),
  lastUpdated: z.number().optional(),
  achievements: z.array(z.string()).optional(),
  discoveryHistory: z.array(z.string()).optional(),
  nexus: z.object({
    discoveredWords: z.record(z.object({
      word: z.string(),
      level: z.number(),
      exp: z.number(),
      unlockedSynergies: z.array(z.string()),
      stats: z.object({
        count: z.number(),
        schools: z.array(z.string()),
        maxScore: z.number()
      })
    })).optional(),
    activeSynergies: z.array(z.string()).optional()
  }).optional()
}).passthrough();

const CSRF_HEADER = "x-csrf-token";

function getApiUrl(path) {
  return buildAuthorityUrl(path);
}

// --- Debounce Utility ---
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function ProgressionProvider({ children, authReady = true, isAuthenticated = true }) {
  const { user, csrfToken, getCsrfToken, clearCsrfToken } = useAuth();
  const [progression, setProgression] = useState(defaultProgression);
  const [isLoading, setIsLoading] = useState(true);
  const canPersistRef = useRef(false);

  // Debounced function to save progression to the server
  const debouncedSave = useRef(debounce(async (newProgression) => {
    if (!canPersistRef.current) {
      return;
    }
    const path = '/api/progression';
    try {
      const tokenPromise = csrfToken ? Promise.resolve(csrfToken) : getCsrfToken();
      const token = await tokenPromise;
      if (!token) {
        throw new Error("Missing CSRF token");
      }
      const response = await fetch(getApiUrl(path), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          [CSRF_HEADER]: token,
        },
        body: JSON.stringify({
          xp: newProgression.xp,
          unlockedSchools: newProgression.unlockedSchools
        }),
      });
      if (response.status === 403) {
        clearCsrfToken();
      }
      if (response.status === 401 || response.status === 403) {
        canPersistRef.current = false;
      }
      if (!response.ok) {
        console.error("Failed to save progression:", emitNetworkBytecodeError(path, response.status));
      }
    } catch (error) {
      console.error("Error saving progression:", emitNetworkBytecodeError(path, 0, { error: error.message }));
    }
  }, 1000)).current;

  // Fetch progression whenever auth transitions to an authenticated session.
  useEffect(() => {
    if (!authReady) {
      setIsLoading(true);
      return;
    }

    if (!isAuthenticated) {
      canPersistRef.current = false;
      clearCsrfToken();
      setProgression({
        ...defaultProgression,
        lastUpdated: Date.now(),
      });
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const fetchProgression = async () => {
      setIsLoading(true);
      const path = '/api/progression';
      try {
        const response = await fetch(getApiUrl(path), { credentials: 'include' });
        if (cancelled) return;
        if (response.ok) {
          canPersistRef.current = true;
          const data = await response.json();
          const parsed = ProgressionPayloadSchema.safeParse(data);
          if (!parsed.success) {
            throw new Error("Invalid progression payload");
          }
          const serverData = { ...parsed.data };
          if (!serverData.unlockedSchools?.length) {
            serverData.unlockedSchools = defaultProgression.unlockedSchools;
          }
          setProgression((prev) => ({
            ...prev,
            ...serverData,
          }));
        } else if (response.status === 401 || response.status === 403) {
          canPersistRef.current = false;
          let progressionTimestamp = 0;
          setProgression({
            ...defaultProgression,
            lastUpdated: progressionTimestamp++,
          });
        } else {
          canPersistRef.current = false;
          console.error("Failed to fetch progression:", emitNetworkBytecodeError(path, response.status));
        }
      } catch (error) {
        if (cancelled) return;
        canPersistRef.current = false;
        console.error("Error fetching progression:", emitNetworkBytecodeError(path, 0, { error: error.message }));
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    fetchProgression();
    return () => {
      cancelled = true;
    };
  }, [authReady, clearCsrfToken, isAuthenticated]);

  const refreshProgression = useCallback(async (isSilent = true) => {
    if (!isAuthenticated) return;
    if (!isSilent) setIsLoading(true);
    const path = '/api/progression';
    try {
      const response = await fetch(getApiUrl(path), { credentials: "include" });
      if (response.ok) {
        canPersistRef.current = true;
        const data = await response.json();
        const parsed = ProgressionPayloadSchema.safeParse(data);
        if (parsed.success) {
          const serverData = { ...parsed.data };
          if (!serverData.unlockedSchools?.length) {
            serverData.unlockedSchools = defaultProgression.unlockedSchools;
          }
          setProgression((prev) => ({ ...prev, ...serverData }));
        }
      } else {
        console.error("Refresh failed:", emitNetworkBytecodeError(path, response.status));
      }
    } catch (error) {
      console.error("Manual progression refresh failed:", emitNetworkBytecodeError(path, 0, { error: error.message }));
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Persist changes to the server
  useEffect(() => {
    if (!isLoading && canPersistRef.current) {
      debouncedSave(progression);
    }
  }, [progression, isLoading, debouncedSave]);

  const addXP = useCallback((amount, source = "general", uniqueId = null) => {
    let levelUpData = null;
    let schoolUnlockedData = [];

    setProgression(prev => {
      if (uniqueId && prev.discoveryHistory.includes(uniqueId)) {
        return prev;
      }

      const newXP = prev.xp + amount;
      const prevLevel = getLevelFromXp(prev.xp);
      const newLevel = getLevelFromXp(newXP);
      
      const newDiscoveryHistory = uniqueId 
        ? [...prev.discoveryHistory, uniqueId]
        : prev.discoveryHistory;

      const schools = getSchoolsByUnlock();
      const newlyUnlocked = schools.filter(
        school => !prev.unlockedSchools.includes(school.id) && newXP >= school.unlockXP
      );
      const newUnlockedSchools = [...prev.unlockedSchools, ...newlyUnlocked.map(s => s.id)];

      const newAchievements = [...prev.achievements];
      
      if (newLevel > prevLevel) {
        levelUpData = { level: newLevel, tier: getTierForLevel(newLevel) };
      }

      newlyUnlocked.forEach(school => {
        newAchievements.push(`school-unlocked-${school.id.toLowerCase()}`);
        schoolUnlockedData.push({ school });
      });

      return {
        ...prev,
        xp: newXP,
        unlockedSchools: newUnlockedSchools,
        lastUpdated: Date.now(),
        achievements: [...new Set(newAchievements)],
        discoveryHistory: newDiscoveryHistory
      };
    });

    if (levelUpData) {
      emitXPEvent("level-up", levelUpData);
    }
    schoolUnlockedData.forEach(data => {
      emitXPEvent("school-unlocked", data);
    });
    if (amount > 0) {
      emitXPEvent("xp-gained", { amount, source });
    }
  }, []);

  useEffect(() => {
    const onScholomanceXp = (event) => {
      const accountXp = Math.max(0, Math.floor(Number(event?.detail?.accountXp) || 0));
      if (accountXp <= 0) return;
      const action = event?.detail?.action || 'scholomance_stat';
      addXP(accountXp, `scholomance:${action}`);
    };
    window.addEventListener('scholomance-xp-changed', onScholomanceXp);
    return () => window.removeEventListener('scholomance-xp-changed', onScholomanceXp);
  }, [addXP]);

  const resetProgression = useCallback(async () => {
    const optimisticReset = {
      ...defaultProgression,
      lastUpdated: Date.now(),
    };
    
    canPersistRef.current = false;
    
    setProgression(prev => ({
      ...prev,
      ...optimisticReset,
    }));

    if (!isAuthenticated) {
      return;
    }

    const path = '/api/progression';
    try {
      const tokenPromise = csrfToken ? Promise.resolve(csrfToken) : getCsrfToken();
      const token = await tokenPromise;
      if (!token) {
        throw new Error("Missing CSRF token");
      }
      const response = await fetch(getApiUrl(path), {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          [CSRF_HEADER]: token,
        },
      });
      if (response.status === 403) {
        clearCsrfToken();
      }
      if (response.ok) {
        const data = await response.json();
        const parsed = ProgressionPayloadSchema.safeParse(data);
        if (!parsed.success) {
          throw new Error("Invalid progression payload");
        }
        canPersistRef.current = true;
        setProgression(prev => ({
          ...prev,
          ...parsed.data,
        }));
      } else {
        console.error("Failed to reset progression:", emitNetworkBytecodeError(path, response.status));
      }
    } catch (error) {
      console.error("Error resetting progression:", emitNetworkBytecodeError(path, 0, { error: error.message }));
    }
  }, [csrfToken, getCsrfToken, clearCsrfToken, isAuthenticated]);

  const checkUnlocked = useCallback((schoolId) => {
    return progression.unlockedSchools.includes(schoolId);
  }, [progression.unlockedSchools]);

  const getNextUnlock = useCallback(() => {
    const schools = getSchoolsByUnlock();
    for (const school of schools) {
      if (!progression.unlockedSchools.includes(school.id)) {
        return {
          school,
          xpNeeded: school.unlockXP - progression.xp,
        };
      }
    }
    return null;
  }, [progression.xp, progression.unlockedSchools]);

  const currentLevelInfo = useMemo(() => getLevelProgress(progression.xp), [progression.xp]);

  const recordWordUse = useCallback((word, profile) => {
    let wordDiscoveredData = null;

    setProgression(prev => {
      const upperWord = word.toUpperCase();
      const currentNexus = prev.nexus || { discoveredWords: {}, activeSynergies: [] };
      const currentWordMastery = currentNexus.discoveredWords[upperWord] || {
        word: upperWord,
        level: 1,
        exp: 0,
        unlockedSynergies: [],
        stats: { count: 0, schools: [], maxScore: 0 }
      };

      const xpGained = 10;
      const newExp = currentWordMastery.exp + xpGained;
      const nextLevel = MASTERY_LEVELS.find(l => l.expRequired > newExp)?.level || 5;
      const newLevel = nextLevel > currentWordMastery.level ? nextLevel - 1 : currentWordMastery.level;

      const newWordMastery = {
        ...currentWordMastery,
        exp: newExp,
        level: newLevel,
        stats: {
          count: currentWordMastery.stats.count + 1,
          schools: [...new Set([...currentWordMastery.stats.schools, profile.school])],
          maxScore: Math.max(currentWordMastery.stats.maxScore, profile.totalScore || 0)
        }
      };

      const newAchievements = [...prev.achievements];
      if (currentWordMastery.stats.count === 0) {
        newAchievements.push(`word-discovered-${upperWord.toLowerCase()}`);
        wordDiscoveredData = { word: upperWord };
      }

      return {
        ...prev,
        achievements: [...new Set(newAchievements)],
        nexus: {
          ...currentNexus,
          discoveredWords: {
            ...currentNexus.discoveredWords,
            [upperWord]: newWordMastery
          }
        }
      };
    });

    if (wordDiscoveredData) {
      emitXPEvent("word-discovered", wordDiscoveredData);
    }
  }, []);

  const value = useMemo(() => ({
    progression,
    addXP,
    recordWordUse,
    resetProgression,
    checkUnlocked,
    getNextUnlock,
    refreshProgression,
    levelInfo: currentLevelInfo,
    availableSchools: progression.unlockedSchools,
    totalSchools: Object.keys(SCHOOLS).length,
    nexus: progression.nexus || { discoveredWords: {}, activeSynergies: [] }
  }), [
    progression,
    addXP,
    recordWordUse,
    resetProgression,
    checkUnlocked,
    getNextUnlock,
    refreshProgression,
    currentLevelInfo
  ]);

  return (
    <ProgressionContext.Provider value={value}>
      {children}
    </ProgressionContext.Provider>
  );
}
