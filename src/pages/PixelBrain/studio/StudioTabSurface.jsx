import { useEffect, useState } from 'react';

import { sketchToSilhouette } from '../../../lib/pixelbrain.adapter.js';
import { AnalysisResults } from '../components/AnalysisResults.jsx';
import { DuplicateSection } from '../components/DuplicateSection.jsx';
import { ForgeGatePanel } from '../components/ForgeGatePanel.jsx';
import MentorCritiquePanel from '../components/MentorCritiquePanel.jsx';
import { ParameterSliders } from '../components/ParameterSliders.jsx';
import { ReferencePanel } from '../components/ReferencePanel.jsx';
import ShaderForgePanel from '../components/ShaderForgePanel.jsx';
import { SketchPad } from '../components/SketchPad.jsx';
import { StatusDisplay } from '../components/StatusDisplay.jsx';
import { StyleTransmuter } from '../components/StyleTransmuter.jsx';
import { TextureSelector } from '../components/TextureSelector.jsx';
import { UploadSection } from '../components/UploadSection.jsx';
import { FormulaLibrary } from '../FormulaLibrary.jsx';
import { AmpConveyorPanel } from './AmpConveyorPanel.jsx';
import { GrassFoundryPanel } from './GrassFoundryPanel.jsx';
import { MutationLabPanel } from './MutationLabPanel.jsx';

function HomeHeader({ kicker, title, detail }) {
  return (
    <header className="pb-studio-home-header">
      <div><p className="pb-studio-kicker">{kicker}</p><h2>{title}</h2></div>
      {detail && <div className="pb-studio-count">{detail}</div>}
    </header>
  );
}

export function StudioTabSurface({
  activeTab,
  snapshot,
  canvasGrid,
  critiqueToken,
  isDrillActive,
  drillSecondsLeft,
  pageNotice,
  onUploadImage,
  onCreateReferenceLayer,
  onGenerateEditableLayers,
  onRunGate,
  onRunBlueprint,
  onRunVriPreview,
  onConstructionGuides,
  onCritique,
  onLoadDrill,
  onApplyStudioOutput,
  onStudioReceipt,
  studioReceipts = [],
  onExport,
  onExportRecipe,
  onOpenTerminal,
}) {
  const [referenceFile, setReferenceFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [parameters, setParameters] = useState({ amplitude: 32, frequency: 0.18, phase: 0, points: 64, scale: 1, complexity: 0.5 });
  const [formula, setFormula] = useState(null);
  const [textures, setTextures] = useState(['parchment']);

  useEffect(() => () => {
    if (analysis?.preview?.startsWith('blob:')) URL.revokeObjectURL(analysis.preview);
  }, [analysis?.preview]);

  if (activeTab === 'blueprint') {
    return (
      <section className="pb-studio-home">
        <HomeHeader kicker="Draft → inspect → seal → gate" title="Blueprint Bench" detail="construction before colour" />
        <div className="pb-studio-home-grid pb-studio-home-grid-3">
          <div className="pb-studio-card"><SketchPad onCommit={({ occupied, dimensions, symmetry }) => {
            const result = sketchToSilhouette(occupied, dimensions, { symmetry });
            onApplyStudioOutput(result, 'Sketch AMP');
          }} /></div>
          <div className="pb-studio-card"><h3>Construction pass</h3><p className="pb-studio-note">Apply the same governed construction guides used by the Canvas editor, then inspect the result before sealing the blueprint.</p><button type="button" className="pb-action-btn primary pb-wide" onClick={onConstructionGuides}>Apply construction guides</button></div>
          <div className="pb-studio-card"><ForgeGatePanel onRunGate={onRunGate} onRunBlueprint={onRunBlueprint} onRunVriPreview={onRunVriPreview} /></div>
        </div>
      </section>
    );
  }

  if (activeTab === 'foundry') {
    return (
      <section className="pb-studio-home">
        <GrassFoundryPanel />
        <HomeHeader kicker="Reference and formula intake" title="General Foundry" detail="import · analyze · vary" />
        <div className="pb-studio-home-grid pb-studio-home-grid-3">
          <div className="pb-studio-card">
            <UploadSection
              analysis={analysis}
              uploadError={null}
              onClear={() => { setAnalysis(null); setReferenceFile(null); }}
              onImageUpload={async (file) => {
                setReferenceFile(file);
                setProcessing(true);
                try {
                  const result = await onUploadImage(file);
                  setAnalysis({ ...result.analysis, preview: URL.createObjectURL(file) });
                } finally {
                  setProcessing(false);
                }
              }}
            />
            <AnalysisResults analysis={analysis} />
            <StatusDisplay status={processing ? 'analyzing' : analysis ? 'ready' : 'idle'} />
          </div>
          <div className="pb-studio-card"><ParameterSliders parameters={parameters} onChange={(key, value) => setParameters((current) => ({ ...current, [key]: value }))} school="VOID" /><FormulaLibrary currentFormulaId={formula?.id} onSelect={setFormula} /></div>
          <div className="pb-studio-card"><DuplicateSection referenceFile={referenceFile} isProcessing={processing} onProcessingChange={setProcessing} /></div>
        </div>
      </section>
    );
  }

  if (activeTab === 'amps') {
    return <AmpConveyorPanel snapshot={snapshot} onReceipt={onStudioReceipt} onCommit={(result) => onApplyStudioOutput(result.output, result.receipt.ampId)} />;
  }

  if (activeTab === 'mutations') {
    return <MutationLabPanel snapshot={snapshot} onReceipt={onStudioReceipt} onAccept={({ accepted, receipt }) => onApplyStudioOutput(accepted.data, `${receipt.ampId} candidate`)} />;
  }

  if (activeTab === 'finish') {
    return (
      <section className="pb-studio-home">
        <HomeHeader kicker="Material authority and render preview" title="Material & Finish" detail="shader · texture · chroma" />
        <div className="pb-studio-home-grid pb-studio-home-grid-3">
          <div className="pb-studio-card"><ShaderForgePanel runtimeState={{ asset: snapshot }} onDiagnosticEmit={() => {}} /></div>
          <div className="pb-studio-card"><StyleTransmuter referenceFile={referenceFile} isProcessing={processing} onTransmute={(result) => onApplyStudioOutput(result, 'Style Transmutation')} /></div>
          <div className="pb-studio-card"><TextureSelector selectedTextures={textures} onToggleTexture={(id) => setTextures((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id])} /><p className="pb-studio-note">Texture and shader previews remain explicit. No finishing pass mutates the Canvas baseline until committed.</p></div>
        </div>
      </section>
    );
  }

  if (activeTab === 'mentor') {
    return (
      <section className="pb-studio-home">
        <HomeHeader kicker="Readability before polish" title="Mentor & Reference" detail={isDrillActive ? `${drillSecondsLeft}s drill` : 'critique ready'} />
        <div className="pb-studio-home-grid">
          <div className="pb-studio-card"><div className="pb-studio-actions"><button type="button" className="pb-action-btn primary" onClick={onCritique}>Run critique</button><button type="button" className="pb-action-btn" onClick={onLoadDrill}>Void Shield drill</button></div><MentorCritiquePanel grid={canvasGrid} analysis={analysis} critiqueToken={critiqueToken} drillActive={isDrillActive} drillSecondsLeft={drillSecondsLeft} onApplySuggestion={(type) => { if (type === 'construction' || type === 'symmetry') onConstructionGuides(); }} onLoadDrill={onLoadDrill} /></div>
          <div className="pb-studio-card"><ReferencePanel onUploadImage={onUploadImage} onCreateReferenceLayer={onCreateReferenceLayer} onGenerateEditableLayers={onGenerateEditableLayers} /></div>
        </div>
      </section>
    );
  }

  if (activeTab === 'library') {
    return (
      <section className="pb-studio-home">
        <HomeHeader kicker="Browser-local until explicit export" title="Library & Export" detail="draft sovereignty" />
        <div className="pb-studio-home-grid">
          <div className="pb-studio-card pb-library-card"><h3>Working document</h3><dl className="pb-receipt"><div><dt>Checksum</dt><dd>{snapshot?.checksum}</dd></div><div><dt>Size</dt><dd>{snapshot?.width}×{snapshot?.height}</dd></div><div><dt>Layers</dt><dd>{snapshot?.layers?.length || 0}</dd></div><div><dt>Receipts</dt><dd>{studioReceipts.length} / 20 local</dd></div></dl><p>No unsaved artwork is sent to a server. Persistence requires a deliberate export or save action.</p></div>
          <div className="pb-studio-card"><h3>Legal exports</h3><div className="pb-export-grid"><button type="button" className="pb-action-btn" onClick={() => onExport('ase')}>Aseprite document</button><button type="button" className="pb-action-btn" onClick={() => onExport('png')}>PNG · native pixels</button><button type="button" className="pb-action-btn" onClick={onExportRecipe}>Forge Spec + provenance</button></div></div>
        </div>
      </section>
    );
  }

  if (activeTab === 'diagnostics') {
    return (
      <section className="pb-studio-home">
        <HomeHeader kicker="Gates, receipts, bytecode faults" title="Diagnostics" detail="evidence surface" />
        <div className="pb-studio-home-grid">
          <div className="pb-studio-card"><StatusDisplay status={pageNotice ? 'warning' : 'idle'} error={null} /><p className="pb-studio-note">{pageNotice || 'No active PixelBrain fault.'}</p><button type="button" className="pb-action-btn primary" onClick={onOpenTerminal}>Open PixelBrain terminal</button></div>
          <div className="pb-studio-card"><h3>Current document receipt</h3><dl className="pb-receipt"><div><dt>Checksum</dt><dd>{snapshot?.checksum}</dd></div><div><dt>Notice</dt><dd>{pageNotice || 'No gate or execution receipt is active.'}</dd></div>{studioReceipts.slice(-5).reverse().map((receipt, index) => <div key={`${receipt.outputChecksum}-${index}`}><dt>{receipt.mode}</dt><dd>{receipt.ampId} · {receipt.outputChecksum}</dd></div>)}</dl><p className="pb-studio-note">Forge Gate controls live in Blueprint. AMP plan and output receipts live in the Conveyor; this surface keeps their current document evidence readable without duplicating either action.</p></div>
        </div>
      </section>
    );
  }

  return null;
}
