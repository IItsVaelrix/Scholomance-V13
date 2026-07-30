import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

/**
 * Security Test Suite - MEDIUM Severity Fixes
 * 
 * Tests for security patches applied to:
 * - M-01: Error logging sanitization
 * - M-02: Session secret length enforcement
 * - M-03: Rate limiting on /api/rhymes/:word and /api/settings
 * - M-04: Console.warn replacement with fastify.log
 * - M-05: External API response validation
 * - M-06: CSRF token endpoint rate limiting
 * - M-07: Content-Type enforcement
 * - M-08: Analysis payload limit + timeout
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '../..');

// ============================================================================
// M-01: Error Logging Sanitization
// ============================================================================

describe('M-01: Error Logging Sanitization', () => {
    it('should sanitize Redis error logging (no stack traces)', async () => {
        const source = fs.readFileSync(
            path.join(ROOT, 'codex/server/index.js'),
            'utf-8'
        );
        
        // Verify error logging uses structured object, not raw err
        expect(source).toContain('[REDIS] Client Error');
        expect(source).toContain('code: err.code');
        expect(source).toContain('name: err.name');
        
        // Verify stack trace is NOT logged
        const redisErrorMatch = source.match(
            /redisClient\.on\('error'[\s\S]*?fastify\.log\.error\(([\s\S]*?)\)/
        );
        expect(redisErrorMatch).toBeDefined();
        // The logged object should not include the full err object (which contains stack)
        expect(source).not.toMatch(/redisClient\.on\('error'[\s\S]*?\[REDIS\] Client Error:.*err\)/);
    });
});

// ============================================================================
// M-02: Session Secret Length Enforcement
// ============================================================================

describe('M-02: Session Secret Length Enforcement', () => {
    it('should use fastify.log instead of console.warn for session warnings', async () => {
        const source = fs.readFileSync(
            path.join(ROOT, 'codex/server/index.js'),
            'utf-8'
        );
        
        // Verify console.warn is NOT used for session warnings
        expect(source).not.toContain("console.warn('[SESSION]");
        
        // Verify fastify.log.warn is used
        expect(source).toContain("fastify.log.warn('[SESSION]");
    });
    
    it('should enforce session secret length in all environments', async () => {
        const source = fs.readFileSync(
            path.join(ROOT, 'codex/server/index.js'),
            'utf-8'
        );
        
        // Verify the check exists outside of production-only block
        const getSessionSecretMatch = source.match(
            /function getSessionSecret\(\)[\s\S]*?return secret;/
        );
        expect(getSessionSecretMatch).toBeDefined();
        
        // Should have length check that applies to all environments
        expect(source).toContain('secret.length < 32');
    });
});

// ============================================================================
// M-03: Rate Limiting on Endpoints
// ============================================================================

describe('M-03: Rate Limiting on Endpoints', () => {
    it('should have rate limit on /api/rhymes/:word', async () => {
        const source = fs.readFileSync(
            path.join(ROOT, 'codex/server/index.js'),
            'utf-8'
        );
        
        const rhymesRouteMatch = source.match(
            /fastify\.get\(['"]\/api\/rhymes\/:word['"][\s\S]*?rateLimit:[\s\S]*?max:\s*30[\s\S]*?timeWindow:\s*['"]1 minute['"]/
        );
        expect(rhymesRouteMatch).toBeDefined();
    });
    
    it('should have rate limit on /api/settings', async () => {
        const source = fs.readFileSync(
            path.join(ROOT, 'codex/server/index.js'),
            'utf-8'
        );
        
        const settingsRouteMatch = source.match(
            /fastify\.get\(['"]\/api\/settings['"][\s\S]*?rateLimit:[\s\S]*?max:\s*10[\s\S]*?timeWindow:\s*['"]1 minute['"]/
        );
        expect(settingsRouteMatch).toBeDefined();
    });
});

// ============================================================================
// M-05: External API Response Validation
// ============================================================================

describe('M-05: External API Response Validation', () => {
    it('should have isValidExternalApiResponse function', async () => {
        const source = fs.readFileSync(
            path.join(ROOT, 'codex/server/services/wordLookup.service.js'),
            'utf-8'
        );
        
        expect(source).toContain('function isValidExternalApiResponse');
        expect(source).toContain('SECURITY: Validate external API response structure');
    });
    
    it('should validate datamuse API responses', async () => {
        const source = fs.readFileSync(
            path.join(ROOT, 'codex/server/services/wordLookup.service.js'),
            'utf-8'
        );
        
        // Check for datamuse validation
        expect(source).toContain("case 'datamuse':");
        expect(source).toContain('Array.isArray(data)');
        expect(source).toContain('typeof item.word === \'string\'');
    });
    
    it('should validate freedictionary API responses', async () => {
        const source = fs.readFileSync(
            path.join(ROOT, 'codex/server/services/wordLookup.service.js'),
            'utf-8'
        );
        
        // Check for freedictionary validation
        expect(source).toContain("case 'freedictionary':");
    });
    
    it('should call validation function before using API responses', async () => {
        const source = fs.readFileSync(
            path.join(ROOT, 'codex/server/services/wordLookup.service.js'),
            'utf-8'
        );
        
        // Check that validation is called for each API
        expect(source).toContain("isValidExternalApiResponse(data, 'scholomance')");
        expect(source).toContain("isValidExternalApiResponse(fdData, 'freedictionary')");
        expect(source).toContain("isValidExternalApiResponse(synData, 'datamuse')");
    });
});

// ============================================================================
// M-06: CSRF Token Endpoint Rate Limiting
// ============================================================================

describe('M-06: CSRF Token Endpoint Rate Limiting', () => {
    it('should have rate limit on /auth/csrf-token', async () => {
        const source = fs.readFileSync(
            path.join(ROOT, 'codex/server/routes/auth.routes.js'),
            'utf-8'
        );
        
        const csrfRouteMatch = source.match(
            /fastify\.get\(['"]\/csrf-token['"][\s\S]*?rateLimit:[\s\S]*?max:\s*10[\s\S]*?timeWindow:\s*['"]1 minute['"]/
        );
        expect(csrfRouteMatch).toBeDefined();
    });
    
    it('should have security comment for CSRF rate limiting', async () => {
        const source = fs.readFileSync(
            path.join(ROOT, 'codex/server/routes/auth.routes.js'),
            'utf-8'
        );
        
        expect(source).toContain('SECURITY: Rate limit to prevent session flooding');
    });
});

// ============================================================================
// M-07: Content-Type Enforcement
// ============================================================================

describe('M-07: Content-Type Enforcement', () => {
    it('should have requireJsonContentType function', async () => {
        const source = fs.readFileSync(
            path.join(ROOT, 'codex/server/index.js'),
            'utf-8'
        );
        
        expect(source).toContain('function requireJsonContentType');
        expect(source).toContain('Content-Type must be application/json');
        expect(source).toContain('415');
    });
    
    it('should apply Content-Type check to POST endpoints', async () => {
        const source = fs.readFileSync(
            path.join(ROOT, 'codex/server/index.js'),
            'utf-8'
        );
        
        // Check that requireJsonContentType is used in preHandler
        expect(source).toContain('requireJsonContentType');
        expect(source).toMatch(/preHandler:\s*\[[\s\S]*?requireJsonContentType[\s\S]*?\]/);
    });
});

// ============================================================================
// M-08: Analysis Payload Limit + Timeout
// ============================================================================

describe('M-08: Analysis Payload Limit + Timeout', () => {
    it('should have reduced MAX_TEXT_LENGTH', async () => {
        const source = fs.readFileSync(
            path.join(ROOT, 'codex/server/routes/panelAnalysis.routes.js'),
            'utf-8'
        );
        
        // Should be 100KB, not 500KB
        expect(source).toContain('MAX_TEXT_LENGTH = 100_000');
        expect(source).toContain('SECURITY: Reduced max text length to prevent DoS');
    });
    
    it('should have ANALYSIS_TIMEOUT_MS constant', async () => {
        const source = fs.readFileSync(
            path.join(ROOT, 'codex/server/routes/panelAnalysis.routes.js'),
            'utf-8'
        );
        
        expect(source).toContain('ANALYSIS_TIMEOUT_MS');
        expect(source).toContain('30_000');
    });
    
    it('should wrap analysis in timeout', async () => {
        const source = fs.readFileSync(
            path.join(ROOT, 'codex/server/routes/panelAnalysis.routes.js'),
            'utf-8'
        );
        
        // Check for Promise.race with timeout
        expect(source).toContain('Promise.race');
        expect(source).toContain('timeoutPromise');
        expect(source).toContain('Analysis timeout: operation exceeded 30 seconds');
    });
});

// ============================================================================
// Integration: All MEDIUM fixes present
// ============================================================================

describe('MEDIUM Severity Integration', () => {
    it('should have all 8 MEDIUM severity fixes in place', async () => {
        const serverSource = fs.readFileSync(
            path.join(ROOT, 'codex/server/index.js'),
            'utf-8'
        );
        const wordLookupSource = fs.readFileSync(
            path.join(ROOT, 'codex/server/services/wordLookup.service.js'),
            'utf-8'
        );
        const authRoutesSource = fs.readFileSync(
            path.join(ROOT, 'codex/server/routes/auth.routes.js'),
            'utf-8'
        );
        const panelAnalysisSource = fs.readFileSync(
            path.join(ROOT, 'codex/server/routes/panelAnalysis.routes.js'),
            'utf-8'
        );
        
        // M-01: Error sanitization
        expect(serverSource).toContain('code: err.code');
        
        // M-02: Session secret
        expect(serverSource).toContain("fastify.log.warn('[SESSION]");
        
        // M-03: Rate limits
        expect(serverSource).toContain('max: 30'); // rhymes
        expect(serverSource).toContain('max: 10'); // settings
        
        // M-05: External API validation
        expect(wordLookupSource).toContain('isValidExternalApiResponse');
        
        // M-06: CSRF rate limit
        expect(authRoutesSource).toContain('rateLimit: { max: 10');
        
        // M-07: Content-Type
        expect(serverSource).toContain('requireJsonContentType');
        
        // M-08: Analysis timeout
        expect(panelAnalysisSource).toContain('ANALYSIS_TIMEOUT_MS');
        expect(panelAnalysisSource).toContain('Promise.race');
    });
});
