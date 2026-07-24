import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerHapticPulse, UI_HAPTICS } from '../../lib/platform/haptics';
import { parseResumeSource, type ResumeSource } from '../../lib/career/parser/parse-resume';
import { analyzeCareerFit } from '../../lib/career/analysis/analyze-career';
import { buildCleanExport } from '../../lib/career/export/clean-export';
import type { ResumeDocument, ResumeSourceType } from '../../lib/career/parser/types';
import type { CareerAnalysisResult, ResumeSuggestion } from '../../lib/career/analysis/types';
import ParserPreviewDrawer from './ParserPreviewDrawer';
import SuggestionReviewPanel from './SuggestionReviewPanel';
import DataArchiveDrawer from './DataArchiveDrawer';
import './CareerPage.css';

export type CareerStatus =
  | 'IDLE'
  | 'EXTRACTING'
  | 'PARSING'
  | 'PARSE_REVIEW'
  | 'ANALYZING'
  | 'COMPLETE'
  | 'ERROR';

export default function CareerPage() {
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

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const resetToIdle = () => {
    if (status === 'COMPLETE' || status === 'ERROR') {
      setStatus('IDLE');
      setErrorMessage(null);
      setParsedDocument(null);
      setAnalysisResult(null);
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

  // Confirm in drawer -> Run career analysis -> Move to COMPLETE
  const handleConfirmAndAlign = () => {
    if (!parsedDocument) return;
    setDrawerOpen(false);
    setStatus('ANALYZING');

    try {
      const result = analyzeCareerFit(parsedDocument, jobDescription);
      setAnalysisResult(result);
      setSuggestions(result.suggestions || []);
      setStatus('COMPLETE');
      triggerHapticPulse(UI_HAPTICS.SUCCESS);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to analyze career fit');
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
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, after: newAfter, status: 'edited' } : s))
    );
  };

  const handleAcceptAllLowRisk = () => {
    setSuggestions((prev) =>
      prev.map((s) => (s.risk === 'low' ? { ...s, status: 'accepted' } : s))
    );
  };

  // Download Clean Export without Sigils
  const handleDownloadCleanExport = () => {
    if (!parsedDocument) return;
    const fileName = sourceFile?.fileName
      ? `clean_${sourceFile.fileName.replace(/\.[^/.]+$/, '')}.txt`
      : 'resume_export.txt';

    const exportData = buildCleanExport(parsedDocument, suggestions, fileName);

    const blob = new Blob([exportData.plainText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportData.fileName;
    link.click();
    URL.revokeObjectURL(url);

    triggerHapticPulse(UI_HAPTICS.MEDIUM);
  };

  const scorecard = analysisResult?.scorecard;

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
              disabled={status === 'EXTRACTING' || status === 'PARSING' || status === 'ANALYZING'}
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
              disabled={status === 'EXTRACTING' || status === 'PARSING' || status === 'ANALYZING'}
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
          disabled={
            (!content.trim() && !sourceFile) ||
            status === 'EXTRACTING' ||
            status === 'PARSING' ||
            status === 'ANALYZING'
          }
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

      {/* Complete View: AtsScorecard & SuggestionReviewPanel */}
      <AnimatePresence>
        {status === 'COMPLETE' && scorecard && (
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
