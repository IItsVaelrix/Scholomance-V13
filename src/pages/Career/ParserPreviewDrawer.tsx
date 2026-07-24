import React from 'react';
import type { ResumeDocument } from '../../lib/career/parser/types';

export interface ParserPreviewDrawerProps {
  open: boolean;
  document: ResumeDocument | null;
  onClose?: () => void;
  onConfirm: () => void;
  onEditParsedDocument: () => void;
}

export default function ParserPreviewDrawer({
  open,
  document,
  onClose,
  onConfirm,
  onEditParsedDocument,
}: ParserPreviewDrawerProps) {
  if (!open || !document) return null;

  const { contact, sections, diagnostics } = document;

  return (
    <div className="parser-preview-drawer-overlay">
      <div className="parser-preview-drawer">
        <header className="drawer-header">
          <h2 className="drawer-title">What the parser saw</h2>
          {onClose && (
            <button className="drawer-close-btn" onClick={onClose} aria-label="Close drawer">
              ×
            </button>
          )}
        </header>

        <div className="drawer-body">
          {/* Contact Fields */}
          <section className="drawer-section contact-fields-section">
            <h3 className="section-title">Contact Fields</h3>
            <div className="contact-grid">
              <div className="contact-item">
                <span className="contact-label">Name:</span>
                <span className="contact-value">{contact?.name || 'Not detected'}</span>
              </div>
              <div className="contact-item">
                <span className="contact-label">Email:</span>
                <span className="contact-value">{contact?.email || 'Not detected'}</span>
              </div>
              <div className="contact-item">
                <span className="contact-label">Phone:</span>
                <span className="contact-value">{contact?.phone || 'Not detected'}</span>
              </div>
              <div className="contact-item">
                <span className="contact-label">Links:</span>
                <div className="contact-links">
                  {contact?.links && contact.links.length > 0 ? (
                    contact.links.map((link, i) => (
                      <a key={i} href={link} target="_blank" rel="noreferrer" className="contact-link">
                        {link}
                      </a>
                    ))
                  ) : (
                    <span className="contact-value">None detected</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Detected Sections */}
          <section className="drawer-section resume-sections-section">
            <h3 className="section-title">Detected Sections ({sections?.length || 0})</h3>
            {(!sections || sections.length === 0) ? (
              <p className="empty-notice">No distinct sections detected.</p>
            ) : (
              <div className="sections-list">
                {sections.map((sec) => (
                  <div key={sec.id} className="section-card">
                    <div className="section-card-header">
                      <span className="section-heading">{sec.heading || sec.kind.toUpperCase()}</span>
                      <span className="section-kind-badge">{sec.kind}</span>
                      <span className="section-confidence">
                        Confidence: {Math.round(sec.confidence * 100)}%
                      </span>
                    </div>
                    <p className="section-text-snippet">{sec.text}</p>
                    {sec.evidence && sec.evidence.length > 0 && (
                      <div className="section-evidence">
                        <span className="evidence-label">Evidence:</span>
                        <ul className="evidence-list">
                          {sec.evidence.map((ev, idx) => (
                            <li key={idx} className="evidence-item">
                              <code>{ev.rule}</code> ({Math.round(ev.confidence * 100)}%) &quot;{ev.text}&quot;
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Parse Diagnostics */}
          <section className="drawer-section diagnostics-section">
            <h3 className="section-title">Parse Diagnostics ({diagnostics?.length || 0})</h3>
            {(!diagnostics || diagnostics.length === 0) ? (
              <p className="empty-notice empty-notice--good">Clean parse - no warnings or layout flags.</p>
            ) : (
              <div className="diagnostics-list">
                {diagnostics.map((diag, idx) => (
                  <div key={idx} className={`diagnostic-card diagnostic-card--${diag.severity}`}>
                    <div className="diagnostic-header">
                      <span className="diagnostic-code">{diag.code}</span>
                      <span className={`diagnostic-severity-badge severity-${diag.severity}`}>
                        {diag.severity.toUpperCase()}
                      </span>
                    </div>
                    <p className="diagnostic-message">{diag.message}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="drawer-footer">
          <button className="btn btn-secondary edit-parsed-btn" onClick={onEditParsedDocument}>
            Edit Parsed Document
          </button>
          <button className="btn btn-primary confirm-align-btn" onClick={onConfirm}>
            Confirm & Align JD
          </button>
        </footer>
      </div>
    </div>
  );
}
