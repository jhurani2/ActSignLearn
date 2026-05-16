import { useState } from 'react';

export default function IconScoutFetchButton({ letter, onLoaded }) {
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFetch = async () => {
    try {
      setLoading(true);
      setStatus(`Loading ${letter} model from IconScout...`);
      const modelUrl = `/api/iconscout/letter/${encodeURIComponent(letter)}/download`;
      const response = await fetch(modelUrl);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `IconScout request failed: ${response.status}`);
      }

      setStatus('Loaded IconScout model URL. Rendering now.');
      onLoaded(modelUrl);
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Failed to load IconScout model.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button
        onClick={handleFetch}
        disabled={loading}
        style={{
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '12px 16px',
          cursor: 'pointer',
          fontWeight: 700,
          transition: 'background 0.2s',
        }}
      >
        {loading ? `Fetching ${letter} model...` : `Fetch ${letter} model from IconScout`}
      </button>
      {status && (
        <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.4 }}>
          {status}
        </div>
      )}
    </div>
  );
}
