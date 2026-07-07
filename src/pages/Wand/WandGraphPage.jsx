import { useState, Suspense, lazy } from 'react';
import React from 'react';
import { Sparkles, Save, Code, Hexagon } from 'lucide-react';
import { motion } from 'framer-motion';
import { createExampleWandMathPacket } from '../../features/graph-editor';

// Lazy load the Rete editor to keep the bundle clean
const ScholomanceGraphEditor = lazy(() => 
  import('../../features/graph-editor').then(module => ({ 
    default: module.ScholomanceGraphEditor 
  }))
);

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: '#ff4444', background: '#220000', height: '100vh', fontFamily: 'monospace' }}>
          <h2>Graph Studio Crashed!</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error?.toString()}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', opacity: 0.7, marginTop: 20 }}>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function WandGraphPage() {
  const [graphPacket, setGraphPacket] = useState(null);

  const handleExport = () => {
    if (graphPacket) {
      console.log('Exporting Graph Packet:', graphPacket);
    }
  };

  return (
    <ErrorBoundary>
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#0a0a0a',
        color: '#eaeaea',
        fontFamily: 'var(--font-mono, monospace)',
        display: 'flex',
        flexDirection: 'column',
        backgroundImage: 'radial-gradient(circle at 50% 0%, #1a1a2e 0%, #0a0a0a 70%)',
      }}>
      {/* Sleek Subheader Chrome */}
      <header style={{
        padding: '16px 32px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(10, 10, 10, 0.7)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px', 
            background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(0, 242, 254, 0.4)'
          }}>
            <Hexagon size={24} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', letterSpacing: '1px', background: 'linear-gradient(to right, #ffffff, #a0a0a0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              WAND GRAPH STUDIO
            </h1>
            <p style={{ margin: 0, fontSize: '13px', color: '#888', textTransform: 'uppercase', letterSpacing: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={12} color="#4facfe" />
              Procedural Node-Based Architecture
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <button style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 18px', borderRadius: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#fff', fontSize: '14px', cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseOver={e => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
          onMouseOut={e => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
          onFocus={e => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
          onBlur={e => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
          onClick={() => console.log(graphPacket)}>
            <Code size={16} /> Raw Packet
          </button>
          
          <button style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 18px', borderRadius: '8px',
            backgroundColor: '#4facfe',
            border: 'none',
            color: '#fff', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(79, 172, 254, 0.4)',
            transition: 'all 0.2s ease',
          }}
          onMouseOver={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(79, 172, 254, 0.6)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(79, 172, 254, 0.4)';
          }}
          onFocus={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(79, 172, 254, 0.6)';
          }}
          onBlur={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(79, 172, 254, 0.4)';
          }}
          onClick={handleExport}>
            <Save size={16} /> Export Routine
          </button>
        </div>
      </header>

      {/* Main Studio Area */}
      <main style={{
        flex: 1,
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          flex: 1,
          borderRadius: '24px',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 32px 64px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)',
          background: '#121212',
          display: 'flex',
          position: 'relative'
        }}>
          {/* We let ScholomanceGraphEditor fill this container completely */}
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', color: '#666', flexDirection: 'column', gap: '16px' }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 3, ease: "linear" }}>
                <Hexagon size={48} color="#4facfe" style={{ opacity: 0.5 }} />
              </motion.div>
              <span style={{ fontSize: '14px', letterSpacing: '2px', textTransform: 'uppercase' }}>Initializing Rete.js Engine...</span>
            </div>
          }>
            <ScholomanceGraphEditor
              initialPacket={createExampleWandMathPacket()}
              onPacketChange={setGraphPacket}
              seed="424242"
            />
          </Suspense>
        </div>
      </main>
    </div>
    </ErrorBoundary>
  );
}
