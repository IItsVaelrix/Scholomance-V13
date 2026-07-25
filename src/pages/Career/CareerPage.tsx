import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerHapticPulse, UI_HAPTICS } from '../../lib/platform/haptics';
import { parseResumeSource, type ResumeSource } from '../../lib/career/parser/parse-resume';
import { analyzeCareerFit } from '../../lib/career/analysis/analyze-career';
import { buildCleanExport } from '../../lib/career/export/clean-export';
import { buildDocxExport } from '../../lib/career/export/docx-export';
import { buildGraphCareerSuggestions } from '../../lib/career/suggestions/build-suggestions';
import { buildImprovements } from '../../lib/career/improve/build-improvements';
import { applyAcceptedSuggestions } from '../../lib/career/suggestions/apply-suggestions';
import { UserFactLedger } from '../../lib/career/improve/honesty/user-fact-ledger';
import type { ResumeDocument, ResumeSourceType } from '../../lib/career/parser/types';
import type { CareerAnalysisResult, ResumeSuggestion } from '../../lib/career/analysis/types';
import type { CareerGraphAnalysis } from '../../lib/career/graph/contracts';
import type { CareerGraphInput } from '../../lib/career/graph/client';
import ParserPreviewDrawer from './ParserPreviewDrawer';
import SuggestionReviewPanel from './SuggestionReviewPanel';
import DataArchiveDrawer from './DataArchiveDrawer';
import TargetRolePanel from './TargetRolePanel';
import SkillEvidencePanel from './SkillEvidencePanel';
import './CareerPage.css';

/**
 * Minimal UI-facing Career Graph port. Both the real `CareerGraphClient`
 * (`analyze(input, options?)`) and the test fixture (`{ analyze }`) satisfy it.
 * Injected so the page is testable without a real Worker / SQLite WASM.
 */
export interface CareerGraphPort {
  analyze(input: CareerGraphInput): Promise<CareerGraphAnalysis>;
}

export interface CareerPageProps {
  /** Optional Career Graph client. When absent, the proven lexical flow runs. */
  graphClient?: CareerGraphPort;
}

export type CareerStatus =
  | 'IDLE'
  | 'EXTRACTING'
  | 'PARSING'
  | 'PARSE_REVIEW'
  | 'ANALYZING'
  | 'GRAPH_LOADING'
  | 'OCCUPATION_REVIEW'
  | 'GRAPH_ANALYZING'
  | 'COMPLETE'
  | 'ERROR';

/** True when the graph asks the candidate to confirm the target occupation. */
function needsOccupationConfirmation(analysis: CareerGraphAnalysis): boolean {
  return analysis.diagnostics.some(
    (d) => d.code === 'OCCUPATION_CONFIRMATION_REQUIRED'
  );
}

/**
 * Merge JD-Advisor improvements into an existing suggestion list (spec §6). Drops an
 * improvement whose id already exists or whose target span overlaps an existing
 * suggestion's span, so the panel never shows two cards for the same edit.
 */
function mergeImprovements(
  existing: ResumeSuggestion[],
  improvements: ResumeSuggestion[]
): ResumeSuggestion[] {
  const ids = new Set(existing.map((s) => s.id));
  const spans = existing
    .map((s) => s.target?.span)
    .filter((sp): sp is NonNullable<typeof sp> => !!sp)
    .map((sp) => ({ start: sp.start, end: sp.end }));
  const overlaps = (sp?: { start: number; end: number }) =>
    !!sp && spans.some((e) => e.start < sp.end && sp.start < e.end);

  const merged = [...existing];
  for (const imp of improvements) {
    if (ids.has(imp.id)) continue;
    if (overlaps(imp.target?.span)) continue;
    merged.push(imp);
    ids.add(imp.id);
  }
  return merged;
}

const BUSY_STATUSES: CareerStatus[] = [
  'EXTRACTING',
  'PARSING',
  'ANALYZING',
  'GRAPH_LOADING',
  'GRAPH_ANALYZING',
];

export default function CareerPage({ graphClient }: CareerPageProps = {}) {
  const [content, setContent] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [status, setStatus] = useState<CareerStatus>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [sourceFile, setSourceFile] = useState<{
    type: ResumeSourceType;
    content: string | Uint8Array | ArrayBuffer;
    fileName: string;
  } | null>(null);

  const [parsedDocument, setParsedDocument] = useState<ResumeDocument | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [analysisResult, setAnalysisResult] = useState<CareerAnalysisResult | null>(null);
  const [suggestions, setSuggestions] = useState<ResumeSuggestion[]>([]);

  // Career Graph state.
  const [graphAnalysis, setGraphAnalysis] = useState<CareerGraphAnalysis | null>(null);
  const [confirmedOccupationId, setConfirmedOccupationId] = useState<string | null>(null);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const graphClientRef = useRef<CareerGraphPort | undefined>(graphClient);
  const analysisAbortRef = useRef<AbortController | null>(null);

  // Provenance ledger for candidate-supplied numbers (honesty correction). A number enters
  // the résumé only through a recorded user-input event keyed by suggestion + slot.
  const userFactLedger = useRef(new UserFactLedger());
  const revisionRef = useRef(0);

  // Mouse ripple follower effect
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      containerRef.current.style.setProperty('--mouse-x', `${x}%`);
      containerRef.current.style.setProperty('--mouse-y', `${y}%`);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => window.removeEventListener('mousemove', handleGlobalMouseMove);
  }, []);

  // Abort any in-flight graph analysis on unmount.
  useEffect(() => {
    return () => {
      analysisAbortRef.current?.abort();
    };
  }, []);

  const resetToIdle = () => {
    if (status === 'COMPLETE' || status === 'ERROR' || status === 'OCCUPATION_REVIEW') {
      analysisAbortRef.current?.abort();
      setStatus('IDLE');
      setErrorMessage(null);
      setParsedDocument(null);
      setAnalysisResult(null);
      setGraphAnalysis(null);
      setConfirmedOccupationId(null);
      setSuggestions([]);
      setDrawerOpen(false);
      setArchiveOpen(false);
    }
  };

  // Process selected file
  const processFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    let type: ResumeSourceType = 'txt';
    let fileContent: string | ArrayBuffer = '';

    if (ext === 'pdf') {
      type = 'pdf';
      fileContent = await file.arrayBuffer();
    } else if (ext === 'docx') {
      type = 'docx';
      fileContent = await file.arrayBuffer();
    } else {
      type = 'txt';
      fileContent = await file.text();
      setContent(fileContent);
    }

    setSourceFile({
      type,
      content: fileContent,
      fileName: file.name,
    });
    resetToIdle();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // Trigger Resume Parsing -> Moves status to PARSE_REVIEW
  const handleParseAndInspect = async () => {
    if (status !== 'IDLE' && status !== 'ERROR' && status !== 'PARSE_REVIEW') return;
    if (!content.trim() && !sourceFile) return;

    try {
      setErrorMessage(null);
      setStatus('EXTRACTING');

      let source: ResumeSource;
      if (sourceFile) {
        source = {
          type: sourceFile.type,
          content: sourceFile.content,
          fileName: sourceFile.fileName,
        };
      } else {
        source = {
          type: 'paste',
          content,
        };
      }

      setStatus('PARSING');
      triggerHapticPulse(UI_HAPTICS.MEDIUM);

      const doc = await parseResumeSource(source);
      setParsedDocument(doc);
      setStatus('PARSE_REVIEW');
      setDrawerOpen(true);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to parse resume');
      setStatus('ERROR');
    }
  };

  const resumeTextFor = (doc: ResumeDocument): string =>
    doc.rawText || doc.normalizedText || '';

  // Finalize a graph analysis into the COMPLETE view + reviewable suggestions.
  const finalizeGraphComplete = (result: CareerGraphAnalysis, doc: ResumeDocument) => {
    setGraphAnalysis(result);
    const graphSuggestions = buildGraphCareerSuggestions(result, doc);
    // Reuse the worker's corpus-resolved skill vocabulary so the advisor's suggestions
    // carry real concept ids rather than the seeded law's placeholders.
    const improvements = buildImprovements(jobDescription, doc, undefined, result.skills);
    setSuggestions(mergeImprovements(graphSuggestions, improvements));
    setStatus('COMPLETE');
    triggerHapticPulse(UI_HAPTICS.SUCCESS);
  };

  // Confirm in drawer -> run analysis. Graph flow when a client is injected,
  // otherwise the proven lexical flow.
  const handleConfirmAndAlign = async () => {
    if (!parsedDocument) return;
    setDrawerOpen(false);

    const client = graphClientRef.current;
    if (!client) {
      // Lexical flow (unchanged).
      setStatus('ANALYZING');
      try {
        const result = analyzeCareerFit(parsedDocument, jobDescription);
        setAnalysisResult(result);
        const improvements = buildImprovements(jobDescription, parsedDocument);
        setSuggestions(mergeImprovements(result.suggestions || [], improvements));
        setStatus('COMPLETE');
        triggerHapticPulse(UI_HAPTICS.SUCCESS);
      } catch (err: any) {
        setErrorMessage(err?.message || 'Failed to analyze career fit');
        setStatus('ERROR');
      }
      return;
    }

    // Graph flow.
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    setStatus('GRAPH_LOADING');
    try {
      const result = await client.analyze({
        resumeText: resumeTextFor(parsedDocument),
        jobDescriptionText: jobDescription,
      });
      if (controller.signal.aborted) return;
      setGraphAnalysis(result);
      if (needsOccupationConfirmation(result)) {
        setStatus('OCCUPATION_REVIEW');
        triggerHapticPulse(UI_HAPTICS.MEDIUM);
      } else {
        finalizeGraphComplete(result, parsedDocument);
      }
    } catch (err: any) {
      if (controller.signal.aborted) return;
      setErrorMessage(err?.message || 'Career graph analysis failed');
      setStatus('ERROR');
    }
  };

  // Candidate confirmed a target occupation -> re-analyze with the confirmed id.
  const handleConfirmOccupation = async (conceptId: string) => {
    if (!parsedDocument) return;
    const client = graphClientRef.current;
    if (!client) return;

    setConfirmedOccupationId(conceptId);
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    setStatus('GRAPH_ANALYZING');
    try {
      const result = await client.analyze({
        resumeText: resumeTextFor(parsedDocument),
        jobDescriptionText: jobDescription,
        confirmedOccupationId: conceptId,
      });
      if (controller.signal.aborted) return;
      finalizeGraphComplete(result, parsedDocument);
    } catch (err: any) {
      if (controller.signal.aborted) return;
      setErrorMessage(err?.message || 'Career graph analysis failed');
      setStatus('ERROR');
    }
  };

  // Edit Parsed Document inside drawer
  const handleEditParsedDocument = () => {
    setDrawerOpen(false);
    if (parsedDocument) {
      setContent(parsedDocument.rawText || parsedDocument.normalizedText);
      setSourceFile(null);
    }
    setStatus('IDLE');
  };

  // Suggestion controls
  const handleAcceptSuggestion = (id: string) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: 'accepted' } : s))
    );
  };

  const handleRejectSuggestion = (id: string) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: 'rejected' } : s))
    );
  };

  const handleEditSuggestion = (id: string, newAfter: string) => {
    revisionRef.current += 1;
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, after: newAfter, status: 'edited' } : s))
    );
  };

  // Record candidate-supplied facts with provenance when a fill-in suggestion is accepted.
  // The filled text arrives from the panel: the `onEdit` that substituted the sentinels is a
  // state update that has not applied yet, so reading `suggestions` here would still see the
  // unfilled template and the ledger would silently record nothing.
  const handleRecordUserFacts = (
    suggestionId: string,
    slotValues: Record<string, string>,
    filledAfter: string
  ) => {
    const suggestion = suggestions.find((s) => s.id === suggestionId);
    if (!suggestion) return;
    revisionRef.current += 1;
    userFactLedger.current.recordFromSuggestion(
      { ...suggestion, after: filledAfter },
      slotValues,
      revisionRef.current
    );
  };

  const handleAcceptAllLowRisk = () => {
    setSuggestions((prev) =>
      prev.map((s) =>
        s.risk === 'low' && s.requiresInput !== true && s.editable !== false
          ? { ...s, status: 'accepted' }
          : s
      )
    );
  };

  // Download Clean Export without Sigils
  const handleDownloadCleanExport = () => {
    if (!parsedDocument) return;
    const fileName = sourceFile?.fileName
      ? `clean_${sourceFile.fileName.replace(/\.[^/.]+$/, '')}.txt`
      : 'resume_export.txt';

    const exportData = buildCleanExport(parsedDocument, suggestions, fileName, {
      userSuppliedValues: userFactLedger.current.values(),
    });

    const blob = new Blob([exportData.plainText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportData.fileName;
    link.click();
    URL.revokeObjectURL(url);

    triggerHapticPulse(UI_HAPTICS.MEDIUM);
  };

  // Derive a target-role label for the DOCX file name (confirmed occupation first).
  const targetRoleLabel = (): string | undefined => {
    if (!graphAnalysis?.occupations?.length) return undefined;
    const confirmed = graphAnalysis.occupations.find(
      (o) => o.conceptId === confirmedOccupationId
    );
    return (confirmed ?? graphAnalysis.occupations[0]).label;
  };

  // Download an ATS-safe .docx reflecting the accepted suggestions (spec §6).
  const handleDownloadDocxExport = async () => {
    if (!parsedDocument) return;
    try {
      // Apply accepted suggestions, then re-parse so sections/bullets reflect the edits.
      // The ledger gates numbers: any metric in an accepted edit that the résumé did not
      // already state and the candidate did not type is refused here.
      const result = applyAcceptedSuggestions(parsedDocument, suggestions, {
        userSuppliedValues: userFactLedger.current.values(),
      });
      const improvedDoc = await parseResumeSource({ type: 'paste', content: result.text });
      const { blob, fileName } = await buildDocxExport(improvedDoc, {
        targetRole: targetRoleLabel(),
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      triggerHapticPulse(UI_HAPTICS.MEDIUM);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to build .docx export');
    }
  };

  const scorecard = analysisResult?.scorecard;
  const isBusy = BUSY_STATUSES.includes(status);

  return (
    <div className="career-ignition-chamber">
      <div className="career-bg-noise" />

      {/* Header */}
      <motion.header
        className="career-hud-header"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="hud-logo">
          <span className="logo-eyebrow">CAREER WORKSPACE & PARSER MATRIX</span>
          <span className="logo-text arcade-glow">PROFESSIONAL SCRIBE MATRIX</span>
          <span className="logo-ver">STATUS: {status}</span>
        </div>
      </motion.header>

      {/* Document Workspace & Input */}
      <motion.div
        className="void-parchment-container"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        ref={containerRef}
      >
        <header className="parchment-header">
          <span className="parchment-title">Résumé & Experience Workspace</span>
          <div className="parchment-status">STATUS // {status}</div>
        </header>

        <div className="parchment-body">
          <div className="parchment-field parchment-field--resume">
            <label className="field-label" htmlFor="resume-input">
              Your Experience / Upload Document
            </label>

            {/* Drop Zone */}
            {sourceFile ? (
              <div className="selected-file-info">
                <span>📄 {sourceFile.fileName} ({sourceFile.type.toUpperCase()})</span>
                <button
                  className="remove-file-btn"
                  onClick={() => {
                    setSourceFile(null);
                    resetToIdle();
                  }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div
                className={`file-drop-zone ${dragActive ? 'drag-active' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf,.docx,.txt"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
                <div className="drop-zone-text">
                  Drag & drop .pdf, .docx, .txt file here, or click to browse
                </div>
                <button type="button" className="file-select-btn">Select File</button>
              </div>
            )}

            <textarea
              id="resume-input"
              className="void-textarea"
              placeholder="Or paste your raw experience / résumé text here..."
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (sourceFile) setSourceFile(null);
                resetToIdle();
              }}
              disabled={isBusy}
            />
          </div>

          <div className="parchment-field parchment-field--jd">
            <label className="field-label" htmlFor="jd-input">
              Target Job Description <span className="field-hint"> - measured against experience</span>
            </label>
            <textarea
              id="jd-input"
              className="void-textarea void-textarea--jd"
              placeholder="Paste target job description to analyze alignment..."
              value={jobDescription}
              onChange={(e) => {
                setJobDescription(e.target.value);
                resetToIdle();
              }}
              disabled={isBusy}
            />
          </div>
        </div>
      </motion.div>

      {/* Parse & Inspect Button */}
      <div className="ritual-ignitor-container">
        {errorMessage && <p className="report-note report-note--warn">{errorMessage}</p>}

        <button
          className="ignite-btn"
          onClick={handleParseAndInspect}
          disabled={(!content.trim() && !sourceFile) || isBusy}
        >
          {status === 'EXTRACTING'
            ? 'Extracting Document...'
            : status === 'PARSING'
            ? 'Parsing Résumé...'
            : status === 'PARSE_REVIEW'
            ? 'Inspect Parsed Document'
            : 'Parse & Inspect Résumé'}
        </button>
      </div>

      {/* Parser Preview Drawer */}
      <ParserPreviewDrawer
        open={drawerOpen || status === 'PARSE_REVIEW'}
        document={parsedDocument}
        onClose={() => setDrawerOpen(false)}
        onConfirm={handleConfirmAndAlign}
        onEditParsedDocument={handleEditParsedDocument}
      />

      {/* Graph: Occupation confirmation (missing skills paused) */}
      <AnimatePresence>
        {status === 'OCCUPATION_REVIEW' && graphAnalysis && (
          <motion.div
            className="alignment-report"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <TargetRolePanel
              analysis={graphAnalysis}
              needsConfirmation
              onConfirmOccupation={handleConfirmOccupation}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Graph: Complete view (target role + skill evidence) */}
      <AnimatePresence>
        {status === 'COMPLETE' && graphAnalysis && (
          <motion.div
            className="alignment-report"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <TargetRolePanel
              analysis={graphAnalysis}
              confirmedOccupationId={confirmedOccupationId}
            />
            <SkillEvidencePanel analysis={graphAnalysis} />

            {suggestions.length > 0 && (
              <SuggestionReviewPanel
                suggestions={suggestions}
                onAccept={handleAcceptSuggestion}
                onReject={handleRejectSuggestion}
                onEdit={handleEditSuggestion}
                onAcceptAllLowRisk={handleAcceptAllLowRisk}
                groupByRequirement
                onRecordUserFacts={handleRecordUserFacts}
              />
            )}

            <div className="report-section">
              <div className="report-heading-row">
                <h3 className="report-heading">Résumé Clean Export</h3>
                <div className="report-heading-actions">
                  <button className="download-btn" onClick={handleDownloadCleanExport}>
                    ↓ Download .txt
                  </button>
                  <button className="download-btn" onClick={handleDownloadDocxExport}>
                    ↓ Download .docx
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lexical: Complete View (AtsScorecard & SuggestionReviewPanel) */}
      <AnimatePresence>
        {status === 'COMPLETE' && !graphAnalysis && scorecard && (
          <motion.div
            className="alignment-report"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            {/* 6-Dimension AtsScorecard - NO overallScore */}
            <div className="ats-scorecard-container">
              <h3 className="ats-scorecard-title">ATS Multi-Dimension Scorecard</h3>
              <div className="ats-scorecard-grid">
                <div className="score-dimension-card">
                  <span className="dimension-label">Parse Quality</span>
                  <span className="dimension-value">
                    {scorecard.parseQuality !== null ? `${scorecard.parseQuality}%` : 'N/A'}
                  </span>
                </div>
                <div className="score-dimension-card">
                  <span className="dimension-label">Section Coverage</span>
                  <span className="dimension-value">{scorecard.sectionCoverage}%</span>
                </div>
                <div className="score-dimension-card">
                  <span className="dimension-label">Literal Keyword Coverage</span>
                  <span className="dimension-value">{scorecard.literalKeywordCoverage}%</span>
                </div>
                <div className="score-dimension-card">
                  <span className="dimension-label">Canonical Skill Coverage</span>
                  <span className="dimension-value">{scorecard.canonicalSkillCoverage}%</span>
                </div>
                <div className="score-dimension-card">
                  <span className="dimension-label">Legibility</span>
                  <span className="dimension-value">{scorecard.legibility}%</span>
                </div>
                <div className="score-dimension-card">
                  <span className="dimension-label">Formatting Risk</span>
                  <span className={`dimension-value risk-${scorecard.formattingRisk}`}>
                    {scorecard.formattingRisk.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Suggestions Review Panel */}
            <SuggestionReviewPanel
              suggestions={suggestions}
              onAccept={handleAcceptSuggestion}
              onReject={handleRejectSuggestion}
              onEdit={handleEditSuggestion}
              onAcceptAllLowRisk={handleAcceptAllLowRisk}
              groupByRequirement
              onRecordUserFacts={handleRecordUserFacts}
            />

            {/* Download Export Section */}
            <div className="report-section">
              <div className="report-heading-row">
                <h3 className="report-heading">Résumé Clean Export</h3>
                <div className="report-heading-actions">
                  {analysisResult?.archive && (
                    <button
                      className="archive-link"
                      onClick={() => {
                        setArchiveOpen(true);
                        triggerHapticPulse(UI_HAPTICS.TICK);
                      }}
                    >
                      ⌬ Data Archive
                    </button>
                  )}
                  <button className="download-btn" onClick={handleDownloadCleanExport}>
                    ↓ Download .txt
                  </button>
                  <button className="download-btn" onClick={handleDownloadDocxExport}>
                    ↓ Download .docx
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <DataArchiveDrawer
        open={archiveOpen}
        archive={analysisResult?.archive ?? null}
        onClose={() => setArchiveOpen(false)}
      />
    </div>
  );
}
