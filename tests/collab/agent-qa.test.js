import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the persistence layer so runAgentQaScan operates on in-memory fixtures.
const state = { agents: [], locks: [], tasks: [] };

vi.mock('../../codex/server/collab/collab.persistence.js', () => ({
    collabPersistence: {
        agents: {
            getAllRaw: async () => state.agents,
            offline: async (id) => {
                const a = state.agents.find((x) => x.id === id);
                if (a) a.status = 'offline';
                return a || null;
            },
            unassignTasks: async () => 0,
        },
        locks: {
            getAll: async () => state.locks,
            releaseForAgent: async () => 0,
        },
        tasks: {
            getAll: async () => state.tasks,
        },
    },
}));

const { runAgentQaScan } = await import('../../codex/server/collab/collab.agent-qa.js');

function agent(id, name, role, status = 'online') {
    return {
        id,
        name,
        role,
        status,
        // recent so isStale() is false
        last_seen: new Date().toISOString().replace('T', ' ').replace('Z', '').slice(0, 19),
    };
}

afterEach(() => {
    state.agents = [];
    state.locks = [];
    state.tasks = [];
});

describe('runAgentQaScan — duplicate detection', () => {
    it('does NOT flag two OFFLINE rows with the same name+role (they are evicted audit history)', async () => {
        // Regression: evictAgent only sets status=offline and getAllRaw returns
        // offline rows, so an already-resolved duplicate must not re-trigger
        // forever every sweep (the [AGENT_DUPE:gemini::backend] loop).
        state.agents = [
            agent('gemini', 'Gemini', 'backend', 'offline'),
            agent('gemini-cli', 'Gemini', 'backend', 'offline'),
        ];

        const result = await runAgentQaScan({ autoResolve: true });

        const dupes = result.violations.filter((v) => v.type === 'AGENT_DUPE');
        expect(dupes).toHaveLength(0);
        expect(result.clean).toBe(true);
    });

    it('still flags two LIVE rows with the same name+role', async () => {
        state.agents = [
            agent('gemini', 'Gemini', 'backend', 'online'),
            agent('gemini-cli', 'Gemini', 'backend', 'online'),
        ];

        const result = await runAgentQaScan({ autoResolve: true });

        const dupes = result.violations.filter((v) => v.type === 'AGENT_DUPE');
        expect(dupes).toHaveLength(1);
        expect(dupes[0].key).toBe('gemini::backend');
    });

    it('flags a live vs offline collision (one real agent still holding the identity)', async () => {
        state.agents = [
            agent('gemini', 'Gemini', 'backend', 'online'),
            agent('gemini-cli', 'Gemini', 'backend', 'offline'),
        ];

        const result = await runAgentQaScan({ autoResolve: true });

        // Only one live member remains after ignoring the offline row -> no group.
        const dupes = result.violations.filter((v) => v.type === 'AGENT_DUPE');
        expect(dupes).toHaveLength(0);
    });
});
