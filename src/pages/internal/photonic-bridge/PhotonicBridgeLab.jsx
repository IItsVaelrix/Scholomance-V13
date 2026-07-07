import React, { useState, useMemo, useEffect } from 'react';
import { analyzePhotonicQuantizationBridge, PHOTONIC_BRIDGE_MODES, getAvailableBackends, simulateHardwareBackend } from '../../../lib/engine.adapter.js';
import {
  createRetinaDiagnosticsSnapshot,
  encodeToPhotonicRetina,
} from '../../../lib/photonic-retina/index.js';
import './photonicBridgeLab.css';

const PRESETS = {
  perfectPhotonic: {
    label: 'Perfect Photonic',
    packet: {
      packetId: 'preset_perfect',
      sourceKind: 'kv-cache',
      dimension: 4096,
      bitWidth: 3,
      storageKind: 'packed',
      rotationKind: 'random-rotation',
      quantizationKind: 'polar',
      residualKind: 'qjl',
      targetOperation: 'inner-product',
    }
  },
  heavyElectronic: {
    label: 'Heavy Electronic',
    packet: {
      packetId: 'preset_heavy',
      sourceKind: 'manual',
      dimension: 32,
      bitWidth: 32,
      storageKind: 'float32',
      rotationKind: 'none',
      quantizationKind: 'none',
      residualKind: 'none',
      targetOperation: 'diagnostic',
    }
  }
};

const RETINA_PRESETS = {
  coordinates: {
    label: 'Coordinate Trace',
    input: {
      sourceKind: 'coordinates',
      dimensions: { width: 64, height: 64 },
      payload: [
        { x: 8, y: 12, emphasis: 0.85, color: '#60a5fa' },
        { x: 18, y: 21, emphasis: 0.5, color: '#a78bfa' },
        { x: 31, y: 34, emphasis: 1, color: '#4ade80' },
        { x: 47, y: 49, emphasis: 0.35, color: '#fbbf24' },
      ],
    },
  },
  brush: {
    label: 'Brush Stroke',
    input: {
      sourceKind: 'brush-stroke',
      dimensions: { width: 128, height: 128 },
      payload: [
        { x: 11, y: 19, pressure: 0.2, color: '#60a5fa' },
        { x: 24, y: 28, pressure: 0.45, color: '#60a5fa' },
        { x: 39, y: 41, pressure: 0.8, color: '#a78bfa' },
        { x: 55, y: 58, pressure: 1, color: '#a78bfa' },
      ],
    },
  },
  palette: {
    label: 'Palette Intake',
    input: {
      sourceKind: 'colors',
      payload: ['#111827', '#60a5fa', '#a78bfa', '#fbbf24', '#4ade80', '#f87171'],
    },
  },
};

function serializePacket(packet) {
  if (!packet) return null;

  return {
    ...packet,
    data: ArrayBuffer.isView(packet.data) ? Array.from(packet.data) : packet.data,
  };
}

export default function PhotonicBridgeLab({ onSendToVideoForge } = {}) {
  const [packetConfig, setPacketConfig] = useState({ ...PRESETS.perfectPhotonic.packet });
  const [mode, setMode] = useState(PHOTONIC_BRIDGE_MODES.SHADOW);
  const [backends, setBackends] = useState([]);
  const [selectedBackendId, setSelectedBackendId] = useState('');
  const [retinaPresetId, setRetinaPresetId] = useState('coordinates');
  const [retinaConfig, setRetinaConfig] = useState({
    targetDimension: 32,
    bitWidth: 4,
    quantizationKind: 'scalar',
    rotationKind: 'signed-hash-rotation',
  });

  useEffect(() => {
    const available = getAvailableBackends();
    setBackends(available);
    if (available.length > 0) {
      setSelectedBackendId(available[0].id);
    }
  }, []);

  const report = useMemo(() => {
    return analyzePhotonicQuantizationBridge(packetConfig, { mode });
  }, [packetConfig, mode]);

  const hwReport = useMemo(() => {
    if (!report.operationGraph || !selectedBackendId) return null;
    return simulateHardwareBackend(packetConfig, report.operationGraph, selectedBackendId);
  }, [packetConfig, report.operationGraph, selectedBackendId]);

  const retinaPacket = useMemo(() => {
    return encodeToPhotonicRetina(RETINA_PRESETS[retinaPresetId].input, retinaConfig);
  }, [retinaPresetId, retinaConfig]);

  const retinaSnapshot = useMemo(() => {
    return createRetinaDiagnosticsSnapshot(retinaPacket);
  }, [retinaPacket]);

  const retinaBridgeReport = useMemo(() => {
    return retinaPacket ? analyzePhotonicQuantizationBridge(retinaPacket, { mode }) : null;
  }, [retinaPacket, mode]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setPacketConfig(prev => ({
      ...prev,
      [name]: name === 'dimension' || name === 'bitWidth' ? parseInt(value) || 1 : value
    }));
  };

  const handleRetinaConfigChange = (e) => {
    const { name, value } = e.target;
    setRetinaConfig(prev => ({
      ...prev,
      [name]: name === 'targetDimension' || name === 'bitWidth' ? parseInt(value, 10) || 1 : value,
    }));
  };

  const handleSendToVideoForge = () => {
    if (!onSendToVideoForge) return;

    onSendToVideoForge({
      source: 'photonic',
      kind: 'pixelbrain',
      name: `Photonic Bridge ${retinaBridgeReport?.compatibilityGrade || report.compatibilityGrade} packet`,
      pixelBrainPacket: {
        source: 'photonic-bridge',
        packetConfig: { ...packetConfig },
        retinaPresetId,
        retinaConfig: { ...retinaConfig },
        retinaPacket: serializePacket(retinaPacket),
        retinaSnapshot,
        bridgeReport: retinaBridgeReport,
        simulationReport: report,
        hardwareReport: hwReport,
      },
      metadata: {
        source: 'photonic',
        packetId: retinaPacket?.packetId || report.packetId,
        compatibilityGrade: retinaBridgeReport?.compatibilityGrade || report.compatibilityGrade,
        compatibilityScore: retinaBridgeReport?.compatibilityScore ?? report.compatibilityScore,
        mode,
        backendId: selectedBackendId || null,
      },
    });
  };

  const retinaPreviewValues = Array.from(retinaPacket?.data || []).slice(0, 32);

  return (
    <div className="photonic-bridge-lab">
      <div className="photonic-lab-header">
        <div>
          <h1>Photonic Bridge Lab</h1>
          <p className="subtitle">
            Internal diagnostic UI for Phase 1 of the Photonic Quantization Bridge (Software Simulator).
          </p>
        </div>
        {onSendToVideoForge && (
          <button
            type="button"
            className="preset-btn send-forge-btn"
            onClick={handleSendToVideoForge}
            title="Send the current Photonic Bridge diagnostic packet into VideoForge"
            aria-label="Send Photonic Bridge diagnostic packet to VideoForge"
          >
            Send to VideoForge
          </button>
        )}
      </div>

      <div className="presets">
        {Object.values(PRESETS).map(preset => (
          <button
            type="button"
            key={preset.label}
            className="preset-btn"
            onClick={() => setPacketConfig({ ...preset.packet })}
          >
            Load {preset.label}
          </button>
        ))}
      </div>

      <div className="lab-container">
        <div className="panel configuration-panel">
          <h2>Packet Configuration</h2>
          
          <div className="control-group">
            <label htmlFor="photonic-mode">Mode</label>
            <select id="photonic-mode" value={mode} onChange={e => setMode(e.target.value)}>
              {Object.values(PHOTONIC_BRIDGE_MODES).map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="control-group hardware-target-control">
            <label htmlFor="photonic-backend">Target Hardware Backend (Phase 5 Simulator)</label>
            <select id="photonic-backend" value={selectedBackendId} onChange={e => setSelectedBackendId(e.target.value)}>
              {backends.map(b => (
                <option key={b.id} value={b.id}>{b.name} ({b.type})</option>
              ))}
            </select>
          </div>

          <hr className="lab-divider" />

          <div className="control-group">
            <label htmlFor="packet-id">Packet ID</label>
            <input id="packet-id" type="text" name="packetId" value={packetConfig.packetId} onChange={handleChange} />
          </div>

          <div className="control-group">
            <label htmlFor="packet-source-kind">Source Kind</label>
            <select id="packet-source-kind" name="sourceKind" value={packetConfig.sourceKind} onChange={handleChange}>
              <option value="kv-cache">kv-cache</option>
              <option value="embedding">embedding</option>
              <option value="attention-probe">attention-probe</option>
              <option value="manual">manual</option>
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="packet-dimension">Dimension</label>
            <input id="packet-dimension" type="number" name="dimension" value={packetConfig.dimension} onChange={handleChange} />
          </div>

          <div className="control-group">
            <label htmlFor="packet-bit-width">Bit Width</label>
            <select id="packet-bit-width" name="bitWidth" value={packetConfig.bitWidth} onChange={handleChange}>
              {[1, 2, 3, 4, 8, 16, 32].map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="packet-storage-kind">Storage Kind</label>
            <select id="packet-storage-kind" name="storageKind" value={packetConfig.storageKind} onChange={handleChange}>
              <option value="float32">float32</option>
              <option value="int8">int8</option>
              <option value="int4">int4</option>
              <option value="int2">int2</option>
              <option value="binary">binary</option>
              <option value="packed">packed</option>
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="packet-rotation-kind">Rotation Kind</label>
            <select id="packet-rotation-kind" name="rotationKind" value={packetConfig.rotationKind} onChange={handleChange}>
              <option value="none">none</option>
              <option value="random-rotation">random-rotation</option>
              <option value="hadamard">hadamard</option>
              <option value="polar">polar</option>
              <option value="custom">custom</option>
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="packet-quantization-kind">Quantization Kind</label>
            <select id="packet-quantization-kind" name="quantizationKind" value={packetConfig.quantizationKind} onChange={handleChange}>
              <option value="none">none</option>
              <option value="scalar">scalar</option>
              <option value="polar">polar</option>
              <option value="qjl-residual">qjl-residual</option>
              <option value="custom">custom</option>
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="packet-residual-kind">Residual Kind</label>
            <select id="packet-residual-kind" name="residualKind" value={packetConfig.residualKind} onChange={handleChange}>
              <option value="none">none</option>
              <option value="qjl">qjl</option>
              <option value="sign-bit">sign-bit</option>
              <option value="residual-codebook">residual-codebook</option>
              <option value="custom">custom</option>
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="packet-target-operation">Target Operation</label>
            <select id="packet-target-operation" name="targetOperation" value={packetConfig.targetOperation} onChange={handleChange}>
              <option value="inner-product">inner-product</option>
              <option value="matrix-vector">matrix-vector</option>
              <option value="matrix-matrix">matrix-matrix</option>
              <option value="similarity-search">similarity-search</option>
              <option value="diagnostic">diagnostic</option>
            </select>
          </div>

        </div>

        <div className="panel retina-panel">
          <h2>Retina Diagnostics</h2>

          <div className="retina-preset-grid" role="group" aria-label="Retina source presets">
            {Object.entries(RETINA_PRESETS).map(([presetId, preset]) => (
              <button
                key={presetId}
                type="button"
                className={`preset-btn retina-preset-btn ${retinaPresetId === presetId ? 'active' : ''}`}
                aria-pressed={retinaPresetId === presetId}
                onClick={() => setRetinaPresetId(presetId)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="retina-controls-grid">
            <div className="control-group">
              <label htmlFor="retina-target-dimension">Retina Dimension</label>
              <input
                id="retina-target-dimension"
                type="number"
                name="targetDimension"
                min="1"
                max="4096"
                value={retinaConfig.targetDimension}
                onChange={handleRetinaConfigChange}
              />
            </div>
            <div className="control-group">
              <label htmlFor="retina-bit-width">Retina Bit Width</label>
              <select id="retina-bit-width" name="bitWidth" value={retinaConfig.bitWidth} onChange={handleRetinaConfigChange}>
                {[1, 2, 4, 8].map(bitWidth => (
                  <option key={bitWidth} value={bitWidth}>{bitWidth}</option>
                ))}
              </select>
            </div>
            <div className="control-group">
              <label htmlFor="retina-quantization-kind">Retina Quantization</label>
              <select id="retina-quantization-kind" name="quantizationKind" value={retinaConfig.quantizationKind} onChange={handleRetinaConfigChange}>
                <option value="scalar">scalar</option>
                <option value="binary-sign">binary-sign</option>
              </select>
            </div>
            <div className="control-group">
              <label htmlFor="retina-rotation-kind">Retina Rotation</label>
              <select id="retina-rotation-kind" name="rotationKind" value={retinaConfig.rotationKind} onChange={handleRetinaConfigChange}>
                <option value="signed-hash-rotation">signed-hash-rotation</option>
                <option value="none">none</option>
              </select>
            </div>
          </div>

          <div className="retina-metrics">
            <div className="retina-metric">
              <span className="retina-metric-label">Packet</span>
              <span className="retina-metric-value mono">{retinaSnapshot.packetId || 'null'}</span>
            </div>
            <div className="retina-metric">
              <span className="retina-metric-label">Source</span>
              <span className="retina-metric-value">{retinaSnapshot.sourceKind || 'none'}</span>
            </div>
            <div className="retina-metric">
              <span className="retina-metric-label">Nonzero</span>
              <span className="retina-metric-value">
                {retinaSnapshot.dataSummary?.nonZeroCount ?? 0}/{retinaSnapshot.dataSummary?.length ?? 0}
              </span>
            </div>
            <div className="retina-metric">
              <span className="retina-metric-label">Bridge Grade</span>
              <span className="retina-metric-value">{retinaBridgeReport?.compatibilityGrade || 'OFF'}</span>
            </div>
          </div>

          <div className="retina-vector-preview" aria-label="Retina vector byte preview">
            {retinaPreviewValues.map((value, index) => (
              <span
                key={`${index}-${value}`}
                className={`retina-byte ${value < 0 ? 'negative' : value > 0 ? 'positive' : 'zero'}`}
                aria-label={`Byte ${index}: ${value}`}
                title={`Byte ${index}: ${value}`}
              >
                {value}
              </span>
            ))}
          </div>

          <div className="diagnostics-list retina-diagnostics-list">
            {retinaSnapshot.diagnostics.map((diagnostic, index) => (
              <div key={`${diagnostic}-${index}`} className="diagnostic-item severity-info">
                <strong>{diagnostic}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="panel report-panel">
          <h2>Simulation Report</h2>

          <div className="report-section">
            <div className="score-display">
              <div className={`score-grade grade-${String(report?.compatibilityGrade || 'OFF').toLowerCase()}`}>
                {report.compatibilityGrade}
              </div>
              <div className="score-value">
                Score: {report.compatibilityScore.toFixed(4)}
              </div>
            </div>
          </div>

          {report.diagnostics && report.diagnostics.length > 0 && (
            <div className="report-section">
              <h3>Diagnostics</h3>
              <div className="diagnostics-list">
                {report.diagnostics.map((diag, i) => (
                  <div key={i} className={`diagnostic-item severity-${diag.severity}`}>
                    <strong>{diag.code}</strong>
                    {diag.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.operationGraph && (
            <div className="report-section">
              <h3>Operation Graph</h3>
              <div className="op-graph">
                {report.operationGraph.operations.map((op, i) => (
                  <div key={i} className={`op-node class-${op.executionClass}`}>
                    <div>
                      <div className="op-kind">{op.kind}</div>
                      <div className="op-id">{op.id}</div>
                    </div>
                    <div className="op-class">{op.executionClass}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {hwReport && (
            <div className="hw-report">
              <h3>Calibrated Execution Report</h3>
              <div className="hw-metrics">
                <div className="hw-metric">
                  <span className="hw-metric-label">Latency</span>
                  <span className="hw-metric-value">{hwReport.estimatedLatencyNs.toFixed(2)} ns</span>
                </div>
                <div className="hw-metric">
                  <span className="hw-metric-label">Power</span>
                  <span className="hw-metric-value">{hwReport.estimatedPowerPj.toFixed(2)} pJ</span>
                </div>
                <div className="hw-metric">
                  <span className="hw-metric-label">Photonic Ops</span>
                  <span className="hw-metric-value">{hwReport.photonicOpCount}</span>
                </div>
                <div className="hw-metric">
                  <span className="hw-metric-label">Electronic Ops</span>
                  <span className="hw-metric-value">{hwReport.electronicOpCount}</span>
                </div>
              </div>
              
              {hwReport.bottlenecks.length > 0 && (
                <div className="bottleneck-list">
                  <h4>Execution Bottlenecks</h4>
                  <ul>
                    {hwReport.bottlenecks.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
