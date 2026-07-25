import React, { useState } from 'react';
import type { ResumeSuggestion } from '../../lib/career/analysis/types';
import { INPUT_SENTINEL } from '../../lib/career/amplify/data/input-sentinel';

export interface SuggestionReviewPanelProps {
  suggestions: ResumeSuggestion[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onEdit?: (id: string, newAfter: string) => void;
  onAcceptAllLowRisk: () => void;
  /** Group suggestions by JD requirement ("SQL — 3 improvements") for legibility (spec §6). */
  groupByRequirement?: boolean;
  /**
   * Record candidate-supplied facts with provenance when a fill-in suggestion is accepted
   * (honesty correction). A number enters the résumé only through this recorded user-input
   * event — the page logs it into a UserFactLedger keyed by suggestion + slot.
   *
   * `filledAfter` is passed explicitly because the page cannot read it back: the `onEdit`
   * that substitutes the sentinels is a state update that has not applied yet during this
   * same event, so a lookup in suggestion state would still see the unfilled template.
   */
  onRecordUserFacts?: (
    suggestionId: string,
    slotValues: Record<string, string>,
    filledAfter: string
  ) => void;
}

/** The first quoted phrase in a reason — the canonical requirement label, by convention. */
function quotedLabel(reason: string): string | null {
  const m = /"([^"]+)"/.exec(reason || '');
  return m ? m[1] : null;
}

function requirementGroupKey(s: ResumeSuggestion): string {
  if (s.conceptId) return `c:${s.conceptId}`;
  const label = quotedLabel(s.reason);
  if (label) return `l:${label.toLowerCase()}`;
  return `t:${s.type}`;
}

function requirementGroupLabel(s: ResumeSuggestion): string {
  const label = quotedLabel(s.reason);
  if (label) return label;
  if (s.type === 'structure') return 'Structure & Ordering';
  if (s.type === 'learning_gap') return 'Learning Gaps';
  return 'General';
}

/** Bucket suggestions by requirement, preserving first-seen group order. */
function groupByReq(suggestions: ResumeSuggestion[]): Array<{ label: string; items: ResumeSuggestion[] }> {
  const order: string[] = [];
  const buckets = new Map<string, { label: string; items: ResumeSuggestion[] }>();
  for (const s of suggestions) {
    const key = requirementGroupKey(s);
    if (!buckets.has(key)) {
      order.push(key);
      buckets.set(key, { label: requirementGroupLabel(s), items: [] });
    }
    buckets.get(key)!.items.push(s);
  }
  return order.map((k) => buckets.get(k)!);
}

export default function SuggestionReviewPanel({
  suggestions,
  onAccept,
  onReject,
  onEdit,
  onAcceptAllLowRisk,
  groupByRequirement = false,
  onRecordUserFacts,
}: SuggestionReviewPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');
  const [slotValues, setSlotValues] = useState<Record<string, string>>({});

  const setSlotValue = (slotId: string, value: string) => {
    setSlotValues((prev) => ({ ...prev, [slotId]: value }));
  };

  /**
   * Left-to-right substitution of each sentinel by its slot's current value.
   * If a sentinel has no corresponding slot (a template/slot-list count mismatch),
   * re-emit the sentinel rather than substituting '' — the apply engine then catches
   * it as `unfilled_input` instead of writing a silently mangled clause to the résumé.
   */
  const fillSlots = (suggestion: ResumeSuggestion): string => {
    const segments = (suggestion.after || '').split(INPUT_SENTINEL);
    return segments
      .map((segment, index) => {
        if (index === segments.length - 1) return segment;
        const slot = suggestion.inputSlots?.[index];
        return segment + (slot ? (slotValues[slot.id] || '').trim() : INPUT_SENTINEL);
      })
      .join('');
  };

  const slotsFilled = (suggestion: ResumeSuggestion): boolean =>
    (suggestion.inputSlots || []).every((slot) => (slotValues[slot.id] || '').trim().length > 0);

  const handleAcceptSuggestion = (suggestion: ResumeSuggestion) => {
    const filledAfter = suggestion.requiresInput ? fillSlots(suggestion) : suggestion.after ?? '';
    if (suggestion.requiresInput && onEdit) {
      onEdit(suggestion.id, filledAfter);
    }
    // Record candidate-supplied numbers with provenance (honesty correction): a number
    // enters the résumé only through this recorded user-input event.
    if (suggestion.requiresInput && onRecordUserFacts) {
      onRecordUserFacts(suggestion.id, slotValues, filledAfter);
    }
    onAccept(suggestion.id);
  };

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
    (s) =>
      s.risk === 'low' &&
      s.status !== 'accepted' &&
      s.requiresInput !== true &&
      s.editable !== false
  ).length;

  // Flat list of rows: optional requirement group-headers interleaved with suggestion cards.
  type Row =
    | { kind: 'header'; key: string; label: string; count: number }
    | { kind: 'card'; sug: ResumeSuggestion };
  const rows: Row[] = [];
  if (groupByRequirement) {
    const groups = groupByReq(suggestions);
    if (groups.length > 1) {
      for (const g of groups) {
        rows.push({ kind: 'header', key: `grp:${g.label}`, label: g.label, count: g.items.length });
        for (const sug of g.items) rows.push({ kind: 'card', sug });
      }
    }
  }
  if (rows.length === 0) {
    for (const sug of suggestions) rows.push({ kind: 'card', sug });
  }

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
          {rows.map((row) => {
            if (row.kind === 'header') {
              return (
                <h4 key={row.key} className="suggestion-group-header">
                  {row.label} — {row.count} improvement{row.count === 1 ? '' : 's'}
                </h4>
              );
            }
            const sug = row.sug;
            const isEditing = editingId === sug.id;
            const isAccepted = sug.status === 'accepted';
            const isRejected = sug.status === 'rejected';
            const needsInput = sug.requiresInput === true && (sug.inputSlots || []).length > 0;
            const acceptBlocked = needsInput && !slotsFilled(sug);

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
                      <span className="preview-text preview-text--after">
                        {needsInput ? fillSlots(sug) || '(fill in the blanks below)' : sug.after || '(None)'}
                      </span>
                    )}
                  </div>
                </div>

                {needsInput && (
                  <div className="suggestion-slots">
                    {(sug.inputSlots || []).map((slot) => (
                      <label key={slot.id} className="suggestion-slot">
                        <span className="suggestion-slot-label">{slot.placeholder}</span>
                        <input
                          type="text"
                          className="suggestion-slot-input"
                          placeholder={slot.hint}
                          value={slotValues[slot.id] || ''}
                          onChange={(e) => setSlotValue(slot.id, e.target.value)}
                        />
                      </label>
                    ))}
                    <p className="suggestion-slot-note">
                      These numbers are yours — nothing is added to your résumé until you fill them in.
                    </p>
                  </div>
                )}

                <p className="suggestion-reason">{sug.reason}</p>

                <div className="suggestion-controls">
                  <button
                    className={`btn btn-control btn-accept ${isAccepted ? 'active' : ''}`}
                    onClick={() => handleAcceptSuggestion(sug)}
                    disabled={isAccepted || acceptBlocked}
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
                  {onEdit && !isEditing && !needsInput && sug.editable !== false && (
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
