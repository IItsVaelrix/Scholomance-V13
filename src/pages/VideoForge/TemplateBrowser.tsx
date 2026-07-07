import React, { useState } from 'react';
import type { VideoProjectPacketV1 } from '../../video/editor/core/video-project-packet';
import { getAllTemplates, getTemplate } from '../../video/editor/core/template-registry';
import { TemplateResolver } from '../../video/editor/core/template-resolver';

export interface TemplateBrowserProps {
  project: VideoProjectPacketV1;
  setProject: (p: VideoProjectPacketV1) => void;
  setStatus: (s: string) => void;
  setSelectedClipId: (id: string | null) => void;
}

export function TemplateBrowser({ project, setProject, setStatus, setSelectedClipId }: TemplateBrowserProps) {
  const [isOpen, setIsOpen] = useState(false);

  function applyTemplate(templateId: string) {
    const tmpl = getTemplate(templateId);
    if (!tmpl) return;
    
    const resolved = TemplateResolver.resolveTemplateAssets(tmpl, project);

    const newP = tmpl.apply(resolved, project);
    setProject(newP);
    setSelectedClipId(null);
    setStatus(`Applied ${tmpl.name}`);
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} style={{ marginRight: 8, fontSize: 12 }}>
        Browse Templates
      </button>
    );
  }

  const templates = getAllTemplates();

  return (
    <div style={{
      position: 'fixed', top: 50, left: 50, right: 50, bottom: 50,
      background: '#0b0e14', border: '1px solid #334155', padding: 20, zIndex: 1000,
      overflow: 'auto',
      color: '#e2e8f0'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Template Browser</h2>
        <button onClick={() => setIsOpen(false)}>Close</button>
      </div>

      {templates.length === 0 ? (
        <div style={{ fontSize: 14 }}>No templates registered.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {templates.map(t => (
            <div key={t.id} style={{ border: '1px solid #1e293b', padding: 12, borderRadius: 6, background: '#111827' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: 14 }}>{t.name}</h3>
              <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 12px 0' }}>{t.description}</p>
              <button onClick={() => applyTemplate(t.id)} style={{ fontSize: 12 }}>Apply Template</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
