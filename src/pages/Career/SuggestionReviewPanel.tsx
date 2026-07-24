import React, { useState } from 'react';
import type { ResumeSuggestion } from '../../lib/career/analysis/types';

export interface SuggestionReviewPanelProps {
  suggestions: ResumeSuggestion[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onEdit?: (id: string, newAfter: string) => void;
  onAcceptAllLowRisk: () => void;
}

export default function SuggestionReviewPanel({
  suggestions,
  onAccept,
  onReject,
  onEdit,
  onAcceptAllLowRisk,
}: SuggestionReviewPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');

  const handleStartEdit = (suggestion: ResumeSuggestion) => {
    setEditingId(suggestion.id);
    setEditText(suggestion.after || '');
  };

  const handleSaveEdit = (id: string) => {
    if (onEdit) {
      onEdit(id, editText);
    }
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const lowRiskPendingCount = suggestions.filter(
    (s) => s.risk === 'low' && s.status !== 'accepted'
  ).length;

  return (
    <div className="suggestion-review-panel">
      <div className="panel-header">
        <div className="panel-title-group">
          <h3 className="panel-title">Optimization Suggestions</h3>
          <span className="panel-badge">{suggestions.length} items</span>
        </div>
        <button
          className="btn btn-accept-all-low-risk"
          onClick={onAcceptAllLowRisk}
          disabled={lowRiskPendingCount === 0}
        >
          Accept All Low-Risk
        </button>
      </div>

      {suggestions.length === 0 ? (
        <p className="empty-suggestions-note">No suggestions generated for this document.</p>
      ) : (
        <div className="suggestions-list">
          {suggestions.map((sug) => {
            const isEditing = editingId === sug.id;
            const isAccepted = sug.status === 'accepted';
            const isRejected = sug.status === 'rejected';

            return (
              <div
                key={sug.id}
                className={`suggestion-card suggestion-risk-${sug.risk} suggestion-status-${sug.status || 'pending'}`}
              >
                <div className="suggestion-card-header">
                  <div className="suggestion-meta">
                    <span className="suggestion-type">{sug.type.toUpperCase()}</span>
                    <span className={`risk-badge risk-${sug.risk}`}>{sug.risk}</span>
                    <span className="confidence-tag">
                      Confidence: {Math.round((sug.confidence || 0) * 100)}%
                    </span>
                  </div>
                  {sug.status && sug.status !== 'pending' && (
                    <span className={`status-pill status-${sug.status}`}>
                      {sug.status.toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="suggestion-preview">
                  <div className="preview-before">
                    <span className="preview-label">Before:</span>
                    <span className="preview-text">{sug.before || '(None)'}</span>
                  </div>
                  <div className="preview-arrow">→</div>
                  <div className="preview-after">
                    <span className="preview-label">After:</span>
                    {isEditing ? (
                      <div className="edit-box">
                        <input
                          type="text"
                          className="edit-after-input"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                        />
                        <button className="btn btn-sm btn-save" onClick={() => handleSaveEdit(sug.id)}>
                          Save
                        </button>
                        <button className="btn btn-sm btn-cancel" onClick={handleCancelEdit}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span className="preview-text preview-text--after">{sug.after || '(None)'}</span>
                    )}
                  </div>
                </div>

                <p className="suggestion-reason">{sug.reason}</p>

                <div className="suggestion-controls">
                  <button
                    className={`btn btn-control btn-accept ${isAccepted ? 'active' : ''}`}
                    onClick={() => onAccept(sug.id)}
                    disabled={isAccepted}
                  >
                    Accept
                  </button>
                  <button
                    className={`btn btn-control btn-reject ${isRejected ? 'active' : ''}`}
                    onClick={() => onReject(sug.id)}
                    disabled={isRejected}
                  >
                    Reject
                  </button>
                  {onEdit && !isEditing && (
                    <button className="btn btn-control btn-edit" onClick={() => handleStartEdit(sug)}>
                      Edit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
