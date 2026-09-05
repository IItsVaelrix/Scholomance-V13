export function createSeededRng(seed) {
  // Simple stub for deterministic random number generator
  let state = 0;
  if (typeof seed === 'string') {
    for (let i = 0; i < seed.length; i++) {
      state = (state << 5) - state + seed.charCodeAt(i);
      state |= 0;
    }
  } else {
    state = seed || 0;
  }

  return {
    next: () => {
      state = (state * 1664525 + 1013904223) | 0;
      return (state >>> 0) / 4294967296;
    },
    int: (min, max) => {
      state = (state * 1664525 + 1013904223) | 0;
      const rand = (state >>> 0) / 4294967296;
      return Math.floor(rand * (max - min + 1)) + min;
    },
    pick: (array) => {
      if (!array || array.length === 0) return undefined;
      state = (state * 1664525 + 1013904223) | 0;
      const rand = (state >>> 0) / 4294967296;
      const index = Math.floor(rand * array.length);
      return array[index];
    }
  };
}
