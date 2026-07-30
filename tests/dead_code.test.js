
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

describe('Codebase Dead Code Audit', () => {
    it('should run the dead code detector and generate a report', () => {
        const scriptPath = path.resolve(process.cwd(), 'scripts/dead-code-detector.mjs');
        const reportPath = path.resolve(process.cwd(), 'dead-code.md');
        
        // Remove old report if exists
        if (fs.existsSync(reportPath)) {
            fs.unlinkSync(reportPath);
        }
        
        // Run script
        const output = execSync(`node ${scriptPath}`, { encoding: 'utf8' });
        
        expect(output).toContain('Report generated: dead-code.md');
        expect(fs.existsSync(reportPath)).toBe(true);
        
        const reportContent = fs.readFileSync(reportPath, 'utf8');
        expect(reportContent).toContain('# Dead Code Report');
        expect(reportContent).toContain('## Unreachable Files');
        expect(reportContent).toContain('## Potentially Unused Exports');
    // The detector is a full-codebase sweep in a synchronous subprocess and
    // measured 44s on a Steam Deck, so vitest's 5s default made this test
    // impossible to pass. 120s leaves ~2.7x headroom on the slowest machine
    // we run on.
    }, 120_000);
});
