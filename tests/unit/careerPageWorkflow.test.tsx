import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ParserPreviewDrawer from '../../src/pages/Career/ParserPreviewDrawer';
import SuggestionReviewPanel from '../../src/pages/Career/SuggestionReviewPanel';
import CareerPage from '../../src/pages/Career/CareerPage';
import type { ResumeDocument } from '../../src/lib/career/parser/types';
import type { ResumeSuggestion } from '../../src/lib/career/analysis/types';
import { INPUT_SENTINEL } from '../../src/lib/career/amplify/data/input-sentinel';

describe('Task 8: UI Parser Preview & Career Workspace State Integration', () => {
  const mockDoc: ResumeDocument = {
    schemaVersion: 1,
    source: { type: 'txt', fileName: 'resume.txt' },
    rawText: 'Jane Doe\nEmail: jane@example.com\nPhone: 555-123-4567\n\nEXPERIENCE\nSenior Engineer at Tech Corp',
    normalizedText: 'jane doe email jane example com phone 555 123 4567 experience senior engineer at tech corp',
    offsetMap: [],
    sections: [
      {
        id: 'sec_exp',
        kind: 'experience',
        heading: 'EXPERIENCE',
        text: 'Senior Engineer at Tech Corp',
        span: { coordinateSpace: 'raw', start: 45, end: 73 },
        confidence: 0.95,
        evidence: [
          {
            rule: 'HEADING_KEYWORD_MATCH',
            span: { coordinateSpace: 'raw', start: 45, end: 55 },
            text: 'EXPERIENCE',
            confidence: 0.98,
          },
        ],
      },
    ],
    contact: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '555-123-4567',
      links: ['https://linkedin.com/in/janedoe'],
    },
    diagnostics: [
      {
        code: 'MULTI_COLUMN_LAYOUT',
        message: 'Detected multi-column layout on page 1',
        severity: 'warning',
      },
    ],
    confidence: 90,
  };

  describe('ParserPreviewDrawer', () => {
    it('renders "What the parser saw", contact fields, sections, diagnostics, and action buttons', () => {
      const onConfirm = vi.fn();
      const onEditParsedDocument = vi.fn();

      render(
        <ParserPreviewDrawer
          open={true}
          document={mockDoc}
          onConfirm={onConfirm}
          onEditParsedDocument={onEditParsedDocument}
        />
      );

      expect(screen.getByText(/What the parser saw/i)).toBeInTheDocument();
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      expect(screen.getByText('jane@example.com')).toBeInTheDocument();
      expect(screen.getByText('555-123-4567')).toBeInTheDocument();
      expect(screen.getByText('https://linkedin.com/in/janedoe')).toBeInTheDocument();

      expect(screen.getByText('EXPERIENCE')).toBeInTheDocument();
      expect(screen.getByText(/HEADING_KEYWORD_MATCH/i)).toBeInTheDocument();

      expect(screen.getByText(/MULTI_COLUMN_LAYOUT/i)).toBeInTheDocument();
      expect(screen.getByText(/Detected multi-column layout on page 1/i)).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: /Confirm & Align JD/i });
      const editBtn = screen.getByRole('button', { name: /Edit Parsed Document/i });

      fireEvent.click(confirmBtn);
      expect(onConfirm).toHaveBeenCalledTimes(1);

      fireEvent.click(editBtn);
      expect(onEditParsedDocument).toHaveBeenCalledTimes(1);
    });
  });

  describe('SuggestionReviewPanel', () => {
    it('renders suggestions list, before/after preview, risk badge, and fires control callbacks', () => {
      const suggestions: ResumeSuggestion[] = [
        {
          id: 'sug_1',
          type: 'verb',
          before: 'Worked on',
          after: 'Spearheaded',
          reason: 'Replace weak action verb',
          evidence: [],
          confidence: 0.92,
          risk: 'low',
          requiresUserApproval: true,
          status: 'pending',
        },
        {
          id: 'sug_2',
          type: 'keyword',
          before: '',
          after: 'Kubernetes',
          reason: 'Add missing target keyword',
          evidence: [],
          confidence: 0.88,
          risk: 'high',
          requiresUserApproval: true,
          status: 'pending',
        },
      ];

      const onAccept = vi.fn();
      const onReject = vi.fn();
      const onEdit = vi.fn();
      const onAcceptAllLowRisk = vi.fn();

      render(
        <SuggestionReviewPanel
          suggestions={suggestions}
          onAccept={onAccept}
          onReject={onReject}
          onEdit={onEdit}
          onAcceptAllLowRisk={onAcceptAllLowRisk}
        />
      );

      expect(screen.getByText('Worked on')).toBeInTheDocument();
      expect(screen.getByText('Spearheaded')).toBeInTheDocument();
      expect(screen.getByText('Replace weak action verb')).toBeInTheDocument();

      expect(screen.getByText('low')).toBeInTheDocument();
      expect(screen.getByText('high')).toBeInTheDocument();

      const acceptAllBtn = screen.getByRole('button', { name: /Accept All Low-Risk/i });
      fireEvent.click(acceptAllBtn);
      expect(onAcceptAllLowRisk).toHaveBeenCalledTimes(1);

      const acceptBtns = screen.getAllByRole('button', { name: /^Accept$/i });
      fireEvent.click(acceptBtns[0]);
      expect(onAccept).toHaveBeenCalledWith('sug_1');

      const rejectBtns = screen.getAllByRole('button', { name: /^Reject$/i });
      fireEvent.click(rejectBtns[1]);
      expect(onReject).toHaveBeenCalledWith('sug_2');
    });
  });

  describe('SuggestionReviewPanel input slots', () => {
    const SENTINEL = '␟';

    function quantifySuggestion(): ResumeSuggestion {
      return {
        id: 'sugg-quantify',
        type: 'quantify',
        target: { span: { coordinateSpace: 'raw', start: 0, end: 26 } },
        before: 'Led the billing migration.',
        after: `Led the billing migration., managing a team of ${SENTINEL}`,
        reason: 'add a metric',
        evidence: [],
        confidence: 0.75,
        risk: 'low',
        requiresUserApproval: true,
        status: 'pending',
        requiresInput: true,
        inputSlots: [{ id: 'slot-0', placeholder: 'headcount', hint: 'how many people, e.g. 6' }],
      };
    }

    it('renders one input per slot and blocks Accept until every slot is filled', () => {
      const onAccept = vi.fn();
      const onEdit = vi.fn();

      render(
        <SuggestionReviewPanel
          suggestions={[quantifySuggestion()]}
          onAccept={onAccept}
          onReject={vi.fn()}
          onEdit={onEdit}
          onAcceptAllLowRisk={vi.fn()}
        />
      );

      const slotInput = screen.getByPlaceholderText('how many people, e.g. 6');
      const acceptButton = screen.getByRole('button', { name: 'Accept' });
      expect(acceptButton).toBeDisabled();

      fireEvent.change(slotInput, { target: { value: '6' } });
      expect(acceptButton).not.toBeDisabled();

      fireEvent.click(acceptButton);
      expect(onEdit).toHaveBeenCalledWith(
        'sugg-quantify',
        'Led the billing migration., managing a team of 6'
      );
      expect(onAccept).toHaveBeenCalledWith('sugg-quantify');
    });

    it('never shows the raw sentinel to the user', () => {
      render(
        <SuggestionReviewPanel
          suggestions={[quantifySuggestion()]}
          onAccept={vi.fn()}
          onReject={vi.fn()}
          onEdit={vi.fn()}
          onAcceptAllLowRisk={vi.fn()}
        />
      );

      expect(document.body.textContent).not.toContain(SENTINEL);
    });

    it('maps N > 1 typed slot values into the correct left-to-right sentinel positions', () => {
      const onAccept = vi.fn();
      const onEdit = vi.fn();

      const multiSlotSuggestion: ResumeSuggestion = {
        id: 'sugg-quantify-multi',
        type: 'quantify',
        target: { span: { coordinateSpace: 'raw', start: 0, end: 40 } },
        before: 'Grew trial signups.',
        after: `Grew trial signups, increasing ${SENTINEL} by ${SENTINEL}% (from ${SENTINEL} to ${SENTINEL})`,
        reason: 'add a metric',
        evidence: [],
        confidence: 0.75,
        risk: 'low',
        requiresUserApproval: true,
        status: 'pending',
        requiresInput: true,
        inputSlots: [
          { id: 'slot-0', placeholder: 'metric', hint: 'what metric, e.g. signups' },
          { id: 'slot-1', placeholder: 'percent', hint: 'percent increase, e.g. 40' },
          { id: 'slot-2', placeholder: 'from value', hint: 'starting value, e.g. 100' },
          { id: 'slot-3', placeholder: 'to value', hint: 'ending value, e.g. 140' },
        ],
      };

      render(
        <SuggestionReviewPanel
          suggestions={[multiSlotSuggestion]}
          onAccept={onAccept}
          onReject={vi.fn()}
          onEdit={onEdit}
          onAcceptAllLowRisk={vi.fn()}
        />
      );

      const metricInput = screen.getByPlaceholderText('what metric, e.g. signups');
      const percentInput = screen.getByPlaceholderText('percent increase, e.g. 40');
      const fromInput = screen.getByPlaceholderText('starting value, e.g. 100');
      const toInput = screen.getByPlaceholderText('ending value, e.g. 140');
      const acceptButton = screen.getByRole('button', { name: 'Accept' });

      expect(acceptButton).toBeDisabled();

      fireEvent.change(metricInput, { target: { value: 'signups' } });
      fireEvent.change(percentInput, { target: { value: '40' } });
      fireEvent.change(fromInput, { target: { value: '100' } });
      expect(acceptButton).toBeDisabled();

      fireEvent.change(toInput, { target: { value: '140' } });
      expect(acceptButton).not.toBeDisabled();

      fireEvent.click(acceptButton);
      expect(onEdit).toHaveBeenCalledWith(
        'sugg-quantify-multi',
        'Grew trial signups, increasing signups by 40% (from 100 to 140)'
      );
      expect(onAccept).toHaveBeenCalledWith('sugg-quantify-multi');
    });

    it('leaves suggestions without slots rendering exactly as before', () => {
      const plain: ResumeSuggestion = {
        id: 'sugg-verb',
        type: 'verb',
        target: { span: { coordinateSpace: 'raw', start: 0, end: 6 } },
        before: 'Helped',
        after: 'Led',
        reason: 'stronger verb',
        evidence: [],
        confidence: 0.85,
        risk: 'low',
        requiresUserApproval: true,
        status: 'pending',
      };

      render(
        <SuggestionReviewPanel
          suggestions={[plain]}
          onAccept={vi.fn()}
          onReject={vi.fn()}
          onEdit={vi.fn()}
          onAcceptAllLowRisk={vi.fn()}
        />
      );

      expect(screen.queryByRole('textbox')).toBeNull();
      expect(screen.getByRole('button', { name: 'Accept' })).not.toBeDisabled();
    });

    it('re-emits the sentinel for a slot the template forgot to declare, instead of a silent gap (data drift: 2 sentinels, 1 slot)', () => {
      const onAccept = vi.fn();
      const onEdit = vi.fn();

      // Simulates a metric template whose sentinel count and inputSlots list have
      // drifted apart: `after` has two blanks, but only one is declared as a slot.
      const driftedSuggestion: ResumeSuggestion = {
        id: 'sugg-drift',
        type: 'quantify',
        target: { span: { coordinateSpace: 'raw', start: 0, end: 21 } },
        before: 'Cut support tickets.',
        after: `Cut support tickets by ${INPUT_SENTINEL}%, saving ${INPUT_SENTINEL} hours weekly`,
        reason: 'add a metric',
        evidence: [],
        confidence: 0.75,
        risk: 'low',
        requiresUserApproval: true,
        status: 'pending',
        requiresInput: true,
        inputSlots: [{ id: 'slot-0', placeholder: 'percent', hint: 'percent reduction, e.g. 40' }],
      };

      render(
        <SuggestionReviewPanel
          suggestions={[driftedSuggestion]}
          onAccept={onAccept}
          onReject={vi.fn()}
          onEdit={onEdit}
          onAcceptAllLowRisk={vi.fn()}
        />
      );

      const percentInput = screen.getByPlaceholderText('percent reduction, e.g. 40');
      fireEvent.change(percentInput, { target: { value: '40' } });

      // slotsFilled only inspects inputSlots, so filling the single declared slot
      // enables Accept even though a second, undeclared sentinel remains in `after`.
      // That's the real behavior of this code today — the apply-engine's
      // unfilled_input guard is what actually stops this suggestion from reaching
      // the résumé, not this button's disabled state.
      const acceptButton = screen.getByRole('button', { name: 'Accept' });
      expect(acceptButton).not.toBeDisabled();

      fireEvent.click(acceptButton);
      expect(onEdit).toHaveBeenCalledTimes(1);
      const [, appliedText] = onEdit.mock.calls[0];
      expect(appliedText).toContain(INPUT_SENTINEL);
      expect(onAccept).toHaveBeenCalledWith('sugg-drift');
    });
  });

  describe('CareerPage Integration', () => {
    it('executes full workflow: file/paste -> Parse & Inspect Résumé -> ParserPreviewDrawer -> Confirm & Align JD -> ATS Scorecard & Clean Export', async () => {
      render(<CareerPage />);

      // Paste experience text into the textarea
      const resumeInput = screen.getByLabelText(/Your Experience/i) || screen.getByPlaceholderText(/Paste your experience/i);
      fireEvent.change(resumeInput, {
        target: {
          value: 'Jane Doe\nEmail: jane@example.com\n\nEXPERIENCE\nBuilt backend microservices using TypeScript and Node.js.\n\nSKILLS\nTypeScript, Node.js',
        },
      });

      // Target JD
      const jdInput = screen.getByLabelText(/Target Job Description/i) || screen.getByPlaceholderText(/Paste the job description/i);
      fireEvent.change(jdInput, {
        target: {
          value: 'Looking for a Senior Software Engineer with expertise in TypeScript, Node.js, and Docker.',
        },
      });

      // Click "Parse & Inspect Résumé"
      const parseBtn = screen.getByRole('button', { name: /Parse & Inspect Résumé/i });
      fireEvent.click(parseBtn);

      // Should open ParserPreviewDrawer with "What the parser saw"
      await waitFor(() => {
        expect(screen.getByText(/What the parser saw/i)).toBeInTheDocument();
      });

      // Click "Confirm & Align JD" inside drawer
      const confirmBtn = screen.getByRole('button', { name: /Confirm & Align JD/i });
      fireEvent.click(confirmBtn);

      // Should display 6-dimension AtsScorecard
      await waitFor(() => {
        expect(screen.getByText(/Parse Quality/i)).toBeInTheDocument();
        expect(screen.getByText(/Section Coverage/i)).toBeInTheDocument();
        expect(screen.getByText(/Literal Keyword Coverage/i)).toBeInTheDocument();
        expect(screen.getByText(/Canonical Skill Coverage/i)).toBeInTheDocument();
        expect(screen.getByText(/Legibility/i)).toBeInTheDocument();
        expect(screen.getByText(/Formatting Risk/i)).toBeInTheDocument();
      });

      // NO overallScore!
      expect(screen.queryByText(/overallScore/i)).toBeNull();
      expect(screen.queryByText(/Overall Score/i)).toBeNull();

      // Download clean .txt button should exist
      const downloadBtn = screen.getByRole('button', { name: /Download \.txt/i });
      expect(downloadBtn).toBeInTheDocument();
    });
  });
});
