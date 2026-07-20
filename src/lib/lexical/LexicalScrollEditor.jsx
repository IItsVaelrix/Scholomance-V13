import React, { useMemo, useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $createParagraphNode, $createTextNode, $getNodeByKey, $getSelection, COMMAND_PRIORITY_LOW, CLICK_COMMAND, KEY_MODIFIER_COMMAND, COMMAND_PRIORITY_NORMAL, SELECTION_CHANGE_COMMAND, $isParagraphNode, $isTextNode, $isRangeSelection, $createRangeSelection, $setSelection } from 'lexical';
import { motion, AnimatePresence } from "framer-motion";

import { TruesightWordNode, $isTruesightWordNode } from './TruesightNode';
import TruesightPlugin from './TruesightPlugin';
import CursorAndIntelliSensePlugin from './CursorAndIntelliSensePlugin';
import RitualPredictionPlugin from './RitualPredictionPlugin';
import Gutter from "../../pages/Read/Gutter.jsx";
import IntelliSense from '../../components/IntelliSense.jsx';
import RitualPredictionTooltip from '../../components/RitualPredictionTooltip.jsx';
import { buildRitualPrediction } from '../../lib/ritualPredictionTooltip.js';
import { evaluateSCD64CircuitBreaker } from '../../core/scd64/circuitBreaker';
import { resolveTokenLineIndex } from './charStart.js';
import { extractPreviousWord } from '../../../codex/core/spellcheckContext.js';

const lexicalTheme = {
  paragraph: 'editor-paragraph',
  text: {
    bold: 'editor-text-bold',
    italic: 'editor-text-italic',
  },
};

// Each scroll line is its own paragraph, but Lexical's root.getTextContent()
// joins top-level blocks with '\n\n' - which doubled newlines on every save/change.
// Join blocks with a single '\n' so the round-tripped content matches the source.
// Must be called within a Lexical read/update context.
function $getScrollText() {
  return $getRoot().getChildren().map((child) => child.getTextContent()).join('\n');
}

function ExternalContentSyncPlugin({ content }) {
  const [editor] = useLexicalComposerContext();
  const [isTyping, setIsTyping] = useState(false);

  // We don't want to reset cursor when the user is actively typing.
  // We only want to update Lexical if the parent forced a programmatic change (e.g., loading a scroll).
  useEffect(() => {
    if (content === undefined || content === null) return;
    
    editor.getEditorState().read(() => {
      const currentText = $getScrollText();
      if (currentText !== content) {
        editor.update(() => {
          const root = $getRoot();
          root.clear();
          const lines = content.split('\n');
          lines.forEach(line => {
             const paragraph = $createParagraphNode();
             paragraph.append($createTextNode(line));
             root.append(paragraph);
          });
        });
      }
    });
  }, [editor, content]);

  return null;
}

function SelectionTextPlugin({ onSelectionTextChange }) {
  const [editor] = useLexicalComposerContext();
  const lastSelectionTextRef = useRef('');

  useEffect(() => {
    if (typeof onSelectionTextChange !== 'function') return undefined;

    const publishSelection = (activeEditor) => {
      activeEditor.getEditorState().read(() => {
        const selection = $getSelection();
        const text = $isRangeSelection(selection) && !selection.isCollapsed()
          ? selection.getTextContent()
          : '';
        if (text !== lastSelectionTextRef.current) {
          lastSelectionTextRef.current = text;
          onSelectionTextChange(text);
        }
      });
      return false;
    };

    onSelectionTextChange('');
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      (_payload, activeEditor) => publishSelection(activeEditor),
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, onSelectionTextChange]);

  return null;
}

function SpellcheckPlugin({ checkSpelling, enabled }) {
  const [editor] = useLexicalComposerContext();
  const spellCache = useRef(new Map());

  useEffect(() => {
    // When the HEX TOOLS predictive toggle is off, spellcheck is dormant: strip
    // any misspelled marks already on the document and run nothing further.
    if (!enabled) {
      editor.update(() => {
        const root = $getRoot();
        const clear = (node) => {
          if ($isTruesightWordNode(node)) {
            if (node.__isMisspelled) node.setMisspelled(false);
          } else if (node.getChildren) {
            node.getChildren().forEach(clear);
          }
        };
        clear(root);
      }, { tag: 'spellcheck-update' });
      return;
    }

    if (!checkSpelling) return;

    const performSpellcheck = async () => {
      let wordsToCheck = new Set();
      
      editor.getEditorState().read(() => {
        const root = $getRoot();
        const traverse = (node) => {
          if ($isTruesightWordNode(node)) {
            const word = node.getTextContent().toLowerCase().replace(/[^a-z0-9]/g, '');
            if (word && !spellCache.current.has(word)) wordsToCheck.add(word);
          } else if (node.getChildren) {
            node.getChildren().forEach(traverse);
          }
        };
        traverse(root);
      });

      if (wordsToCheck.size === 0) return;

      const results = await Promise.all(
        Array.from(wordsToCheck).map(async word => {
          try {
            const isValid = await checkSpelling(word);
            return { word, isValid };
          } catch {
            return { word, isValid: true };
          }
        })
      );

      results.forEach(({ word, isValid }) => {
        spellCache.current.set(word, isValid);
      });

      editor.update(() => {
        const root = $getRoot();
        const traverseUpdate = (node) => {
          if ($isTruesightWordNode(node)) {
            const word = node.getTextContent().toLowerCase().replace(/[^a-z0-9]/g, '');
            const isValid = spellCache.current.get(word);
            if (isValid === false && !node.__isMisspelled) {
              node.setMisspelled(true);
            } else if (isValid === true && node.__isMisspelled) {
              node.setMisspelled(false);
            }
          } else if (node.getChildren) {
            node.getChildren().forEach(traverseUpdate);
          }
        };
        traverseUpdate(root);
      });
    };

    const unregister = editor.registerUpdateListener(({ tags }) => {
       if (!tags.has('spellcheck-update')) {
          performSpellcheck();
       }
    });
    
    performSpellcheck();

    return unregister;
  }, [editor, checkSpelling, enabled]);

  return null;
}

function LineDecorationPlugin({ highlightedLines, pinnedLines }) {
  const [editor] = useLexicalComposerContext();
  
  useEffect(() => {
    const applyClasses = () => {
      editor.getEditorState().read(() => {
         const root = $getRoot();
         let currentLine = 1;
         root.getChildren().forEach((node) => {
           if ($isParagraphNode(node)) {
              const dom = editor.getElementByKey(node.getKey());
              if (dom) {
                 if (highlightedLines?.includes(currentLine)) dom.classList.add('rhyme-highlight');
                 else dom.classList.remove('rhyme-highlight');
                 
                 if (pinnedLines?.includes(currentLine)) dom.classList.add('pinned-ghost-line');
                 else dom.classList.remove('pinned-ghost-line');
              }
              currentLine++;
           }
         });
      });
    };
    
    applyClasses();
    return editor.registerUpdateListener(() => applyClasses());
  }, [editor, highlightedLines, pinnedLines]);

  return null;
}

// Lexical reads `editable` from initialConfig only once at mount. Without this,
// a scroll that loads read-only stays frozen non-editable and typing silently
// fails even after the parent flips to edit mode.
function EditablePlugin({ isEditable }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.setEditable(!!isEditable);
  }, [editor, isEditable]);
  return null;
}

// Syncs the gutter's translateY transform to match the ContentEditable's scroll
// position. We attach directly to the Lexical root element (ContentEditable)
// because all ancestor wrappers use overflow:hidden and never fire scroll events.
function GutterScrollSyncPlugin({ gutterRef }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerRootListener((rootElement, prevRootElement) => {
      // Remove listener from old root.
      if (prevRootElement) {
        prevRootElement.removeEventListener('scroll', prevRootElement.__gutterScroll);
        delete prevRootElement.__gutterScroll;
      }
      // Attach listener to new root.
      if (rootElement) {
        const onScroll = () => {
          gutterRef.current?.syncScroll?.(rootElement.scrollTop);
        };
        rootElement.__gutterScroll = onScroll;
        rootElement.addEventListener('scroll', onScroll, { passive: true });
        // Sync immediately in case content is already scrolled.
        gutterRef.current?.syncScroll?.(rootElement.scrollTop);
      }
    });
  }, [editor, gutterRef]);
  return null;
}

// Measures the actual rendered height of a single Lexical paragraph (= one line)
// and reports it upward so the Gutter rows stay pixel-accurate.
function LineHeightPlugin({ onLineHeight }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const measure = () => {
      const root = editor.getRootElement();
      if (!root) return;
      const para = root.querySelector('p, [class*="paragraph"]');
      if (!para) return;
      // Report ONE line's height, not the whole paragraph. In plain-text Lexical,
      // pressing Enter inserts <br> line breaks inside a SINGLE paragraph, so
      // para.offsetHeight grows with every line -- using it as the per-line height
      // balloons every gutter row on each keystroke. The resolved line-height is
      // the true single-line height and stays constant regardless of line count.
      // (Loaded scrolls split into separate <p> per line, so they never hit this.)
      const lineHeight = parseFloat(getComputedStyle(para).lineHeight);
      const h = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : para.offsetHeight;
      if (h > 0) onLineHeight(h);
    };
    // Measure once after first render and again after each update.
    const unregister = editor.registerUpdateListener(() => {
      requestAnimationFrame(measure);
    });
    requestAnimationFrame(measure);
    return unregister;
  }, [editor, onLineHeight]);
  return null;
}

function SavePlugin({ onSave, title }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (!onSave) return;
    return editor.registerCommand(
      KEY_MODIFIER_COMMAND,
      (event) => {
        if (event.ctrlKey && event.key === 's') {
          event.preventDefault();
          editor.getEditorState().read(() => {
            const content = $getScrollText();
            onSave(title, content);
          });
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_NORMAL
    );
  }, [editor, onSave, title]);
  return null;
}

function LexicalRefPlugin({ editorRef }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (editorRef) {
      editorRef.current = editor;
    }
  }, [editor, editorRef]);
  return null;
}

function WordClickPlugin({ onWordActivate, analyzedDocument }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!onWordActivate) return;

    return editor.registerCommand(
      CLICK_COMMAND,
      (event) => {
        const target = event.target;
        if (target && target.dataset.lexicalKey) {
          editor.getEditorState().read(() => {
            const node = $getNodeByKey(target.dataset.lexicalKey);
            if ($isTruesightWordNode(node)) {
              const tokenData = node.getTokenData();
              const analysis = analyzedDocument?.syntaxSummary?.tokens?.find(t => t.token === node.getTextContent()) || null;
              
              onWordActivate({
                word: node.getTextContent(),
                normalizedWord: node.getTextContent().toLowerCase().replace(/[^a-z0-9]/g, ''),
                trigger: 'truesight_tap',
                analysis: analysis,
                charStart: tokenData?.charStart,
                charEnd: tokenData?.charEnd,
                lineIndex: resolveTokenLineIndex(tokenData),
                wordIndex: tokenData?.wordIndex,
                vowelFamily: analysis?.vowelFamily,
                terminalVowelFamily: analysis?.rhymeFamily,
                school: node.__truesightClass ? node.__truesightClass.replace('grimoire-word--', '').replace(' grimoire-word--active', '') : null,
                color: node.__color,
                isMisspelled: node.__isMisspelled,
                anchorRect: target.getBoundingClientRect(),
              });
            }
          });
          return true; // Stop propagation
        }
        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, onWordActivate, analyzedDocument]);

  return null;
}

const LexicalScrollEditor = forwardRef(({
  content,
  onContentChange,
  isEditable = true,
  isTruesight = false,
  analyzedDocument = null,
  onWordActivate,
  isPredictive = false,
  getCompletions = null,
  predictorReady = false,
  syntaxLayer = null,
  onSave,
  title,
  onCursorChange,
  onSelectionTextChange,
  isLatticeGrid = false,
  mirrored = false,
  checkSpelling,
  getSpellingSuggestions,
  onTitleChange,
  analyzedWordsByCharStart,
  analyzedWordsByIdentity,
  highlightedLines,
  pinnedLines,
  theme,
  onFocus,
  onBlur,
  lineSyllableCounts = null,
  resonantCharStarts = null,
}, ref) => {
  const editorContainerRef = useRef(null);
  const lexicalEditorRef = useRef(null);
  const gutterRef = useRef(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  // Matches the CSS --editor-content-line-height: 1.9 at the default
  // --editor-content-font-size: clamp(1.02rem,1.2vw,1.12rem) ≈ 16px.
  // LineHeightPlugin only fires once a <p> exists; on a brand-new empty
  // scroll there is no paragraph until the first keystroke, so seed the
  // gutter at the correct 30.4 instead of 32 to avoid a 1.6px row shrink
  // on the first Enter.
  const [measuredLineHeight, setMeasuredLineHeight] = useState(30.4);
  const handleLineHeight = useCallback((h) => {
    setMeasuredLineHeight(h);
  }, []);
  const [cursorCoords, setCursorCoords] = useState({ x: 0, y: 0, lineIndex: 0, colIndex: 0 });
  const [intellisenseSuggestions, setIntellisenseSuggestions] = useState([]);
  const [intellisenseIndex, setIntellisenseIndex] = useState(0);
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [ritualPrediction, setRitualPrediction] = useState(null);
  const [ritualAnchor, setRitualAnchor] = useState(null);
  
  // Expose the API Bridge expected by ReadPage.jsx
  useImperativeHandle(ref, () => ({
    save: () => {
      if (lexicalEditorRef.current && onSave) {
        lexicalEditorRef.current.getEditorState().read(() => {
          onSave(title, $getScrollText());
        });
      }
    },
    jumpToLine: (lineNum) => {
      if (lexicalEditorRef.current) {
        lexicalEditorRef.current.update(() => {
          const root = $getRoot();
          let currentLine = 1;
          let targetNode = null;
          let targetOffset = 0;

          const pNodes = root.getChildren();
          for (let p of pNodes) {
            if ($isParagraphNode(p)) {
               if (currentLine === lineNum) {
                 targetNode = p;
                 targetOffset = 0;
                 break;
               }
               
               const children = p.getChildren();
               for (let child of children) {
                 if ($isTextNode(child)) {
                   const t = child.getTextContent();
                   for (let i = 0; i < t.length; i++) {
                     if (currentLine === lineNum) {
                       targetNode = child;
                       targetOffset = i;
                       break;
                     }
                     if (t[i] === '\n') currentLine++;
                   }
                   if (targetNode) break;
                 } else if (child.getType() === 'linebreak') {
                   currentLine++;
                   if (currentLine === lineNum) {
                     targetNode = child.getNextSibling() || p;
                     targetOffset = child.getNextSibling() ? 0 : p.getChildrenSize();
                     break;
                   }
                 }
               }
               if (targetNode) break;
               currentLine++; // Paragraph boundary
            }
          }

          if (targetNode) {
             const selection = $createRangeSelection();
             selection.anchor.set(targetNode.getKey(), targetOffset, $isTextNode(targetNode) ? 'text' : 'element');
             selection.focus.set(targetNode.getKey(), targetOffset, $isTextNode(targetNode) ? 'text' : 'element');
             $setSelection(selection);
             
             setTimeout(() => {
                const domNode = lexicalEditorRef.current.getElementByKey(targetNode.getKey());
                if (domNode && domNode.scrollIntoView) {
                    domNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
             }, 10);
          }
        });
      }
    },
    scrollTo: (options) => {
      editorContainerRef.current?.scrollTo(options);
    },
    scrollToTopSmooth: () => {
      editorContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    },
    replaceContent: (newContent) => {
      if (lexicalEditorRef.current) {
        lexicalEditorRef.current.update(() => {
          const root = $getRoot();
          root.clear();
          const paragraph = $createParagraphNode();
          paragraph.append($createTextNode(newContent));
          root.append(paragraph);
        });
        if (onContentChange) onContentChange(newContent);
      }
    },
    get clientHeight() { 
      return editorContainerRef.current?.clientHeight || 0; 
    },
    get scrollHeight() {
      return editorContainerRef.current?.scrollHeight || 0;
    },
    // Exposes the underlying Lexical editor instance for callers that need
    // direct editor.update()/$getSelection() access (e.g. Analyze panel
    // craft actions). Returns null until the editor has mounted.
    getEditor: () => lexicalEditorRef.current,
  }));

  const initialConfig = {
    namespace: 'ScholomanceLexical',
    theme: lexicalTheme,
    onError: (error) => console.error(error),
    editable: isEditable,
    nodes: [TruesightWordNode],
  };

  const handleChange = (editorState, editor) => {
    editorState.read(() => {
      const text = $getScrollText();
      if (onContentChange) onContentChange(text);
    });
  };

  const handlePrefixChange = useCallback(async (prefix, textBeforeCursor) => {
    setCurrentPrefix(prefix);
    if (prefix.length === 0) {
      setIntellisenseSuggestions([]);
      return;
    }
    const lines = textBeforeCursor.split("\n");
    const lineIndex = lines.length - 1;

    let suggestionsList = [];

    // Spelling corrections are part of the ritual-prediction feature: they must
    // only surface when the HEX TOOLS predictive toggle is on. With it off, the
    // spellcheck box never appears.
    if (isPredictive && checkSpelling && getSpellingSuggestions) {
      try {
        const valid = await checkSpelling(prefix);
        if (!valid) {
          const prevWord = extractPreviousWord(textBeforeCursor, prefix);
          const corrections = await getSpellingSuggestions(prefix, prevWord, 3);
          if (corrections && corrections.length) {
            suggestionsList = corrections.map((word) => ({
              token: word, type: 'correction', isRhyme: false, badges: ['spelling'],
            }));
          }
        }
      } catch { /* spelling is best-effort */ }
    }

    // Predictive completions appended (deduped against corrections).
    if (isPredictive && getCompletions && predictorReady) {
      const completions = await getCompletions(prefix, lineIndex, syntaxLayer);
      if (completions && completions.length) {
        const seen = new Set(suggestionsList.map((s) => s.token));
        for (const c of completions) {
          if (!seen.has(c.token)) suggestionsList.push(c);
        }
      }
    }

    if (suggestionsList.length === 0) {
      setIntellisenseSuggestions([]);
      return;
    }
    setIntellisenseSuggestions(suggestionsList);
    setIntellisenseIndex(0);
  }, [isPredictive, getCompletions, predictorReady, syntaxLayer, checkSpelling, getSpellingSuggestions]);

  const handleAcceptSuggestion = useCallback((token) => {
    if (lexicalEditorRef.current && currentPrefix) {
      lexicalEditorRef.current.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection) && selection.isCollapsed()) {
          const anchor = selection.anchor;
          const anchorNode = anchor.getNode();
          if ($isTextNode(anchorNode)) {
            const text = anchorNode.getTextContent();
            const endOffset = anchor.offset;
            const startOffset = Math.max(0, endOffset - currentPrefix.length);
            const removed = text.slice(startOffset, endOffset);
            if (removed.toLowerCase() === currentPrefix.toLowerCase()) {
              anchorNode.spliceText(startOffset, currentPrefix.length, token);
              anchorNode.select(startOffset + token.length, startOffset + token.length);
            } else {
              selection.insertText(token);
            }
          } else {
            selection.insertText(token);
          }
        }
      });
    }
    setIntellisenseSuggestions([]);
  }, [currentPrefix]);

  const handleRitualPredictionRequest = useCallback((request) => {
    try {
      const prediction = buildRitualPrediction({
        word: request.word,
        line: 0,
        column: 0,
        contextLine: request.contextLine || '',
        surroundingText: request.contextLine || '',
      });
      setRitualPrediction(prediction);
      setRitualAnchor(request.anchorRect);
    } catch {
      setRitualPrediction(null);
      setRitualAnchor(null);
    }
  }, []);

  const handleCloseRitualPrediction = useCallback(() => {
    setRitualPrediction(null);
    setRitualAnchor(null);
  }, []);

  const activeIdeMode = isTruesight ? "TRUESIGHT" : (isEditable ? "EDIT" : "NEUTRAL");
  const lines = (content || "").split('\n');
  const totalLines = lines.length;

  // Keep viewportHeight in sync with the editor container so the gutter clips correctly.
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      setViewportHeight(container.clientHeight);
    });
    ro.observe(container);
    setViewportHeight(container.clientHeight);
    return () => ro.disconnect();
  }, []);

  // Sync the gutter track position whenever the editor scrolls.
  // NOTE: This is now handled inside GutterScrollSyncPlugin via registerRootListener
  // because the wrapper div uses overflow:hidden and never fires scroll events.

  const syllablesPerLine = useMemo(() => {
    // Prefer the authoritative per-line counts ReadPage already computes
    // (deepAnalysis.lineSyllableCounts); only fall back to a local estimate
    // when they are absent.
    if (Array.isArray(lineSyllableCounts) && lineSyllableCounts.length > 0) {
      return lines.map((_, i) => lineSyllableCounts[i] ?? 0);
    }
    return lines.map(line => {
      let count = 0;
      const words = line.match(/[a-zA-Z']+/g) || [];
      words.forEach(word => {
        const t = analyzedDocument?.syntaxSummary?.tokens?.find(t => t.token.toLowerCase() === word.toLowerCase());
        count += t?.syllableCount || 0;
      });
      return count;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, analyzedDocument, lineSyllableCounts]);

  const isQuarantined = useMemo(() => {
    if (!analyzedDocument?.scd64Full) return false;
    const { checksum64, bugFamily } = analyzedDocument.scd64Full;
    const breaker = evaluateSCD64CircuitBreaker({
      checksum64,
      bugFamily,
      severity: "FATAL_PRESENTATION_DESYNC" // Assumed high severity if it reached SCD64 emission
    });
    return breaker.active;
  }, [analyzedDocument]);

  const handleSave = () => {
    if (lexicalEditorRef.current && onSave) {
      lexicalEditorRef.current.getEditorState().read(() => {
        onSave(title, $getScrollText());
      });
    }
  };

  return (
    <div
      className="lexical-scroll-editor-container"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}
      onFocus={(e) => onFocus?.(e)}
      onBlur={(e) => {
        if (!editorContainerRef.current?.contains(e.relatedTarget)) onBlur?.(e);
      }}
    >
      <div className="editor-header">
        {isEditable ? (
          <div className="editor-title-container">
            <input
              id="scroll-title"
              type="text"
              className="editor-title-input"
              placeholder="Scroll Title..."
              aria-label="Scroll Title"
              value={title || ''}
              onChange={(e) => {
                if (onTitleChange) onTitleChange(e.target.value);
              }}
              maxLength={100}
              aria-required="true"
            />
            <button
              type="button"
              className="btn btn-primary save-scroll-btn"
              onClick={handleSave}
              disabled={!content?.trim()}
            >
              Save Scroll
            </button>
            <button
              type="button"
              className="scroll-top-btn"
              onClick={() => editorContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
              aria-label="Scroll to top"
              title="Scroll to top"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 9.5L7 4.5L12 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        ) : (
          <h2 className="editor-title-display">{title || "Untitled Scroll"}</h2>
        )}
      </div>

      <motion.div
        className={`editor-body ${isEditable ? 'editable' : 'read-only'} ${isTruesight && !isEditable ? 'read-only-truesight' : ''} ${isLatticeGrid ? 'lattice-grid' : ''} ${mirrored ? 'mirrored' : ''}`}
        style={{ position: 'relative', flex: 1, minHeight: 0 }}
      >
        <div className="editor-textarea-wrapper" style={{ display: 'flex', flexDirection: 'row', height: '100%', minHeight: 0 }}>
        <Gutter
          ref={gutterRef}
          totalLines={totalLines}
          currentLine={cursorCoords.lineIndex + 1 || 1}
          syllablesPerLine={syllablesPerLine}
          activeIdeMode={activeIdeMode}
          lineHeightPx={measuredLineHeight}
          viewportHeight={viewportHeight || undefined}
        />
        <div ref={editorContainerRef} className="editor-textarea-wrapper" style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <div className={`lexical-wrapper ${isTruesight ? 'truesight-active' : ''}`} style={{ width: '100%', height: '100%', position: 'relative' }}>
            <LexicalComposer initialConfig={initialConfig}>
              <EditablePlugin isEditable={isEditable} />
              <ExternalContentSyncPlugin content={content} />
              <SelectionTextPlugin onSelectionTextChange={onSelectionTextChange} />
              <PlainTextPlugin
                contentEditable={<ContentEditable className="editor-textarea lexical-content-editable" style={{ outline: 'none', whiteSpace: 'pre-wrap', zIndex: 10 }} />}
                placeholder={<div className="editor-placeholder">Inscribe thy verses...</div>}
              />
              <SavePlugin onSave={onSave} title={title} />
              <LexicalRefPlugin editorRef={lexicalEditorRef} />
              <SpellcheckPlugin checkSpelling={checkSpelling} enabled={isPredictive} />
              <LineDecorationPlugin highlightedLines={highlightedLines} pinnedLines={pinnedLines} />
              <TruesightPlugin analyzedDocument={analyzedDocument} isTruesight={isTruesight} isQuarantined={isQuarantined} analyzedWordsByCharStart={analyzedWordsByCharStart} analyzedWordsByIdentity={analyzedWordsByIdentity} theme={theme} resonantCharStarts={resonantCharStarts} />
              <WordClickPlugin onWordActivate={onWordActivate} analyzedDocument={analyzedDocument} />
              <RitualPredictionPlugin onRitualPredictionRequest={handleRitualPredictionRequest} />
              
              <CursorAndIntelliSensePlugin 
                onCursorPositionChange={setCursorCoords}
                onCursorChange={onCursorChange}
                onPrefixChange={handlePrefixChange}
                suggestionsActive={intellisenseSuggestions.length > 0}
                onSuggestionNavigate={(dir) => {
                  setIntellisenseIndex(i => (i + dir + intellisenseSuggestions.length) % intellisenseSuggestions.length);
                }}
                onSuggestionAccept={() => {
                  if (intellisenseSuggestions[intellisenseIndex]) {
                    handleAcceptSuggestion(intellisenseSuggestions[intellisenseIndex].token);
                  }
                }}
                onSuggestionCancel={() => setIntellisenseSuggestions([])}
              />

              <OnChangePlugin onChange={handleChange} />
              <GutterScrollSyncPlugin gutterRef={gutterRef} />
              <LineHeightPlugin onLineHeight={handleLineHeight} />
              <HistoryPlugin />
            </LexicalComposer>

            <AnimatePresence>
              {intellisenseSuggestions.length > 0 && (
                <IntelliSense
                  suggestions={intellisenseSuggestions}
                  selectedIndex={intellisenseIndex}
                  position={cursorCoords}
                  onAccept={handleAcceptSuggestion}
                  onHover={setIntellisenseIndex}
                  ghostLine={intellisenseSuggestions[intellisenseIndex]?.ghostLine || null}
                  badges={intellisenseSuggestions[intellisenseIndex]?.badges || []}
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {ritualPrediction && ritualAnchor && (
                <RitualPredictionTooltip
                  prediction={ritualPrediction}
                  anchorRect={ritualAnchor}
                  onClose={handleCloseRitualPrediction}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
        </div>
      </motion.div>
    </div>
  );
});

LexicalScrollEditor.displayName = 'LexicalScrollEditor';

export default LexicalScrollEditor;
