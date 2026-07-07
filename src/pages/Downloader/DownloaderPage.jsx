import React, { useState, useEffect } from 'react';

export default function DownloaderPage() {
  const [url, setUrl] = useState('');
  const [preflightInfo, setPreflightInfo] = useState(null);
  const [loadingPreflight, setLoadingPreflight] = useState(false);
  const [error, setError] = useState(null);
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/downloader/history');
      const data = await res.json();
      if (data.ok) {
        setJobs(data.jobs);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handlePreflight = async (e) => {
    e.preventDefault();
    setLoadingPreflight(true);
    setError(null);
    setPreflightInfo(null);
    try {
      const res = await fetch('/api/downloader/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (data.ok) {
        setPreflightInfo(data.info);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingPreflight(false);
    }
  };

  const startDownload = async (profile) => {
    setError(null);
    try {
      const res = await fetch('/api/downloader/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, profile })
      });
      const data = await res.json();
      if (data.ok) {
        setPreflightInfo(null);
        setUrl('');
        fetchHistory(); // Refresh to show new job
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const cancelJob = async (jobId) => {
    try {
      await fetch(`/api/downloader/jobs/${jobId}/cancel`, { method: 'POST' });
      fetchHistory();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', color: '#ccc' }}>
      <h1>DivTube Downloader</h1>
      <p>Only download content you own, have permission to use, or are legally allowed to archive.</p>

      <div style={{ marginBottom: '2rem', border: '1px solid #444', padding: '1rem', borderRadius: '8px' }}>
        <form onSubmit={handlePreflight} style={{ display: 'flex', gap: '1rem' }}>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste YouTube URL here..."
            style={{ flex: 1, padding: '0.5rem', background: '#222', color: '#fff', border: '1px solid #444' }}
          />
          <button type="submit" disabled={!url || loadingPreflight} style={{ padding: '0.5rem 1rem' }}>
            {loadingPreflight ? 'Probing...' : 'Analyze'}
          </button>
        </form>

        {error && <div style={{ color: 'red', marginTop: '1rem' }}>{error}</div>}

        {preflightInfo && (
          <div style={{ marginTop: '1rem', background: '#1a1a1a', padding: '1rem', borderRadius: '4px' }}>
            <h3>{preflightInfo.title}</h3>
            <p>Channel: {preflightInfo.channel}</p>
            <p>Duration: {preflightInfo.duration}s</p>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button onClick={() => startDownload('archive')} style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}>
                Download Best (Archive)
              </button>
              <button onClick={() => startDownload('audioSource')} style={{ padding: '0.5rem 1rem', background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer' }}>
                Extract Audio
              </button>
            </div>
          </div>
        )}
      </div>

      <h2>Queue & History</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {jobs.length === 0 ? (
          <p>No downloads yet.</p>
        ) : (
          jobs.map(job => (
            <JobItem key={job.id} job={job} onCancel={() => cancelJob(job.id)} />
          ))
        )}
      </div>
    </div>
  );
}

function JobItem({ job, onCancel }) {
  const [currentJob, setCurrentJob] = useState(job);

  useEffect(() => {
    let es = null;
    if (job.status === 'downloading' || job.status === 'queued') {
      es = new EventSource(`/api/downloader/jobs/${job.id}/events`);
      es.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'status_update') {
          setCurrentJob(prev => ({ ...prev, ...data.job }));
        } else {
          // Progress update
          setCurrentJob(prev => ({ ...prev, progress_percent: data.progress_percent || prev.progress_percent }));
        }
      };
    }
    return () => {
      if (es) es.close();
    };
  }, [job.id, job.status]);

  return (
    <div style={{ border: '1px solid #333', padding: '1rem', borderRadius: '4px', background: '#111' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0 }}>{currentJob.title || currentJob.url}</h4>
        <span style={{
          padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem',
          background: currentJob.status === 'completed' ? '#065f46' :
                      currentJob.status === 'failed' ? '#7f1d1d' :
                      currentJob.status === 'downloading' ? '#1e3a8a' : '#333'
        }}>
          {currentJob.status}
        </span>
      </div>

      {(currentJob.status === 'downloading' || currentJob.status === 'queued') && (
        <div style={{ marginTop: '0.5rem', background: '#000', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${currentJob.progress_percent || 0}%`, background: '#3b82f6', height: '100%', transition: 'width 0.3s' }} />
        </div>
      )}

      {currentJob.error_message && (
        <p style={{ color: '#ef4444', fontSize: '0.9rem', marginTop: '0.5rem' }}>
          Error: {currentJob.error_code} - {currentJob.error_message}
        </p>
      )}

      {currentJob.status === 'completed' && currentJob.output_dir && (
        <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>Saved to: {currentJob.output_dir}</p>
      )}

      {(currentJob.status === 'downloading' || currentJob.status === 'queued') && (
        <button onClick={onCancel} style={{ marginTop: '0.5rem', padding: '0.2rem 0.5rem', background: '#444', border: 'none', cursor: 'pointer', color: '#fff' }}>
          Cancel
        </button>
      )}
    </div>
  );
}
