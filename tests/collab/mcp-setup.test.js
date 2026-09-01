import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIR, '..', '..');

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

describe('MCP setup contract', () => {
    it('keeps checked-in host configs on the stable bridge entrypoint', () => {
        for (const relativePath of ['.mcp.json', 'mcp.json']) {
            const config = readJson(relativePath);
            const server = config.mcpServers['scholomance-collab'];

            expect(server).toBeDefined();
            expect(server.command).toBe('node');
            expect(server.args).toEqual(['--env-file=.env', 'codex/server/collab/mcp-bridge-entry.js']);
            expect(server.cwd).toBe(ROOT);
        }

        const openCode = readJson('opencode.json');
        expect(openCode.mcp['scholomance-collab']).toMatchObject({
            type: 'local',
            command: ['node', '--env-file=.env', 'codex/server/collab/mcp-bridge-entry.js'],
            cwd: ROOT,
            enabled: true,
        });
    });

    it('keeps canonical MCP instructions aligned with this checkout', () => {
        const docs = [
            'docs/scholomance-encyclopedia/Scholomance LAW/AGENTS.md',
            'docs/scholomance-encyclopedia/Scholomance LAW/VAELRIX_LAW.md',
            'docs/scholomance-encyclopedia/Scholomance White Papers/MCP_INTEGRATION_GUIDE.md',
            'docs/scholomance-encyclopedia/Scholomance White Papers/CODEX_MCP_READINESS.md',
            'docs/scholomance-encyclopedia/Scholomance White Papers/BEGINNER_GUIDE_TO_SCHOLOMANCE_ENGINE.md',
            'codex/server/collab/skills/scholomance.md',
        ];

        for (const relativePath of docs) {
            const content = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
            expect(content).not.toContain('/home/deck/Desktop/Scholomance-V12-main');
            expect(content).not.toContain('/home/deck/Desktop/Scholomance-V12-main/codex/server/collab/mcp-bridge.js');
            expect(content).toContain('codex/server/collab/mcp-bridge-entry.js');
        }
    });
});
