import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ParserPreviewDrawer from '../../src/pages/Career/ParserPreviewDrawer';
import SuggestionReviewPanel from '../../src/pages/Career/SuggestionReviewPanel';
import CareerPage from '../../src/pages/Career/CareerPage';
import type { ResumeDocument } from '../../src/lib/career/parser/types';
import type { ResumeSuggestion } from '../../src/lib/career/analysis/types';

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
