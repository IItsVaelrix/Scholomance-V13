import { useId, useState } from 'react';
import { GlyphButton } from '../../kits/channel-zero-ui-kit/components/GlyphButton';

/** Content kinds offered in the editor. `featured` is the separate toggle. */
const CONTENT_KINDS = ['skill', 'whitepaper', 'verdict', 'essay'] as const;

const KIND_OPTION_LABEL: Record<string, string> = {
  skill: 'Skill',
  whitepaper: 'Whitepaper',
  verdict: 'Verdict',
  essay: 'Essay',
};

export interface PostEditorValues {
  title: string;
  excerpt: string;
  kind: string;
  featured: boolean;
  body: string;
  readTime: string;
}

export interface PostEditorProps {
  mode: 'new' | 'edit';
  initial?: Partial<PostEditorValues> | null;
  onSave: (values: PostEditorValues) => void;
  onCancel: () => void;
}

export function PostEditor({ mode, initial, onSave, onCancel }: PostEditorProps) {
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const fieldId = (name: string) => `${baseId}-${name}`;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? '');
  const [kind, setKind] = useState(initial?.kind && initial.kind !== 'featured' ? initial.kind : 'essay');
  const [featured, setFeatured] = useState(Boolean(initial?.featured));
  const [body, setBody] = useState(initial?.body ?? '');
  const [readTime, setReadTime] = useState(initial?.readTime ?? '');
  const [touched, setTouched] = useState(false);

  const titleError = title.trim() === '' ? 'A title is required.' : '';
  const bodyError = body.trim() === '' ? 'A body is required.' : '';
  const isValid = !titleError && !bodyError;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!isValid) return;
    onSave({ title: title.trim(), excerpt: excerpt.trim(), kind, featured, body, readTime: readTime.trim() });
  }

  return (
    <div
      className="cz-editor-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <form className="cz-editor cz-grim" onSubmit={handleSubmit}>
        <h2 id={headingId} className="cz-editor__heading">
          {mode === 'new' ? 'New transmission' : 'Edit transmission'}
        </h2>

        <div className="cz-editor__field">
          <label htmlFor={fieldId('title')}>Title</label>
          <input
            id={fieldId('title')}
            className="cz-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Transmission title"
          />
          {touched && titleError && <span className="cz-editor__error">{titleError}</span>}
        </div>

        <div className="cz-editor__field">
          <label htmlFor={fieldId('excerpt')}>Excerpt</label>
          <input
            id={fieldId('excerpt')}
            className="cz-input"
            type="text"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="One-line summary shown on the card"
          />
        </div>

        <div className="cz-editor__row">
          <div className="cz-editor__field">
            <label htmlFor={fieldId('kind')}>Band</label>
            <select
              id={fieldId('kind')}
              className="cz-input"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {CONTENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_OPTION_LABEL[k]}
                </option>
              ))}
            </select>
          </div>

          <div className="cz-editor__field">
            <label htmlFor={fieldId('readtime')}>Read time</label>
            <input
              id={fieldId('readtime')}
              className="cz-input"
              type="text"
              value={readTime}
              onChange={(e) => setReadTime(e.target.value)}
              placeholder="auto"
            />
          </div>

          <label className="cz-editor__toggle" htmlFor={fieldId('featured')}>
            <input
              id={fieldId('featured')}
              type="checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
            />
            <span>Featured</span>
          </label>
        </div>

        <div className="cz-editor__field">
          <label htmlFor={fieldId('body')}>Body</label>
          <textarea
            id={fieldId('body')}
            className="cz-input cz-editor__body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            placeholder={'## Heading\n\nParagraph text. Use **bold**, *italic*, and\n\n- bullet\n- points'}
          />
          {touched && bodyError && <span className="cz-editor__error">{bodyError}</span>}
        </div>

        <p className="cz-editor__hint">
          Lightweight text: <code>## heading</code>, <code>### heading</code>, blank lines for
          paragraphs, <code>- </code> for lists, <code>**bold**</code>, <code>*italic*</code>. Raw
          HTML is shown as text, never executed.
        </p>

        <div className="cz-editor__actions">
          <GlyphButton type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </GlyphButton>
          <GlyphButton type="submit">{mode === 'new' ? 'Publish' : 'Save changes'}</GlyphButton>
        </div>
      </form>
    </div>
  );
}

export default PostEditor;
