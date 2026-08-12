/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The named overflow reading region must be keyboard-focusable. */
import { useEffect, useMemo, useRef, useState } from 'react';
import ConstellationResultShell from './ConstellationResultShell.jsx';
import ConstellationViewport3D from './ConstellationViewport3D.jsx';
import { projectConstellationPacket } from './constellationSceneProjection.js';

export default function ConstellationExperience({ packet, reducedMotion }) {
  const model = useMemo(() => projectConstellationPacket(packet), [packet]);
  const [selectedNode, setSelectedNode] = useState(model.nodes[0]);
  const [readingMode, setReadingMode] = useState(false);
  const dockContentRef = useRef(null);

  useEffect(() => {
    setSelectedNode(model.nodes[0]);
    setReadingMode(false);
  }, [model]);

  const selectedChannel = selectedNode?.channelId ?? 'identity';
  const selectedChannelDefinition = model.channels.find((channel) => channel.id === selectedChannel)
    ?? model.channels[0];

  const selectChannel = (channel) => {
    const channelNode = model.nodes.find((node) => node.channelId === channel.id && node.kind !== 'satellite')
      ?? model.nodes.find((node) => node.channelId === channel.id);
    if (channelNode) setSelectedNode(channelNode);
  };

  useEffect(() => {
    const targetId = selectedChannelDefinition?.targetId;
    const target = targetId ? dockContentRef.current?.querySelector(`#${targetId}`) : null;
    target?.scrollIntoView({
      block: 'start',
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [selectedChannelDefinition, reducedMotion]);

  return (
    <div
      className={`constellation-experience${readingMode ? ' constellation-experience--reading' : ''}`}
      data-testid="constellation-experience"
    >
      <ConstellationViewport3D
        model={model}
        selectedNode={selectedNode}
        selectedChannel={selectedChannel}
        reducedMotion={reducedMotion}
        onSelectNode={setSelectedNode}
      />

      <aside className="constellation-dock" aria-labelledby="constellation-dock-title">
        <header className="constellation-dock__header">
          <div>
            <p className="constellation-experience__eyebrow">Observation dock</p>
            <h2 id="constellation-dock-title">{selectedNode?.label ?? packet.query.raw}</h2>
          </div>
          <button
            type="button"
            className="constellation-dock__reading-toggle"
            aria-pressed={readingMode}
            onClick={() => setReadingMode((current) => !current)}
          >
            {readingMode ? 'Show map' : 'Reading view'}
          </button>
        </header>

        <nav className="constellation-dock__channels" aria-label="Analysis channels">
          {model.channels.map((channel) => (
            <button
              key={channel.id}
              type="button"
              aria-pressed={channel.id === selectedChannel}
              onClick={() => selectChannel(channel)}
            >
              {channel.label}
            </button>
          ))}
        </nav>

        <div
          ref={dockContentRef}
          className="constellation-dock__content"
          role="region"
          aria-label="Constellation analysis details"
          tabIndex={0}
        >
          <ConstellationResultShell packet={packet} reducedMotion={reducedMotion} />
        </div>
      </aside>
    </div>
  );
}
