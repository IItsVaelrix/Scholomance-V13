import { createRef } from 'react';
import { act, render } from '@testing-library/react';
import { $getRoot, SELECTION_CHANGE_COMMAND } from 'lexical';
import { describe, expect, it, vi } from 'vitest';
import LexicalScrollEditor from '../../../src/lib/lexical/LexicalScrollEditor.jsx';

describe('LexicalScrollEditor selection bridge', () => {
  it('publishes range text and clears a collapsed selection', async () => {
    window.Range.prototype.getBoundingClientRect = vi.fn(() => ({
      top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0, x: 0, y: 0,
      toJSON: () => ({}),
    }));
    const editorRef = createRef();
    const onSelectionTextChange = vi.fn();
    render(
      <LexicalScrollEditor
        ref={editorRef}
        content="river bank"
        title="Selection bridge"
        isEditable={true}
        onSelectionTextChange={onSelectionTextChange}
      />,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const editor = editorRef.current.getEditor();

    await act(async () => {
      editor.update(() => {
        $getRoot().getFirstChild().getFirstChild().select(0, 5);
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onSelectionTextChange).toHaveBeenLastCalledWith('river');

    await act(async () => {
      editor.update(() => {
        $getRoot().getFirstChild().getFirstChild().select(5, 5);
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
    });
    expect(onSelectionTextChange).toHaveBeenLastCalledWith('');
  });
});
