import React, { useState, useEffect } from 'react';
import { HandModelViewer, preloadAllLetters } from './HandModelViewer';
import { LetterSelector } from './LetterSelector';
import { LetterInfo } from './LetterInfo';

/**
 * LearnPage
 * 
 * Full working learn feature:
 * - Manages selected letter state
 * - Displays 3D rotatable hand model
 * - Shows tips and description for each letter
 * - Arrow key navigation (A→B→C cycling)
 * - Preloads all models on mount for instant swaps
 * - Fully self-contained layout
 */
export function LearnPage() {
  const [selectedLetter, setSelectedLetter] = useState('A');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // Preload all models on component mount
  useEffect(() => {
    preloadAllLetters();
  }, []);

  // Handle arrow key navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      const currentIndex = alphabet.indexOf(selectedLetter);
      
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const nextLetter = currentIndex < 25 ? alphabet[currentIndex + 1] : alphabet[0];
        setSelectedLetter(nextLetter);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prevLetter = currentIndex > 0 ? alphabet[currentIndex - 1] : alphabet[25];
        setSelectedLetter(prevLetter);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLetter]);

  const handleLetterSelect = (letter) => {
    setSelectedLetter(letter);
  };

  const handleResetView = () => {
    // Trigger canvas re-render by toggling selected letter
    // This forces OrbitControls to reset via key change
    const temp = selectedLetter;
    setSelectedLetter(null);
    setTimeout(() => setSelectedLetter(temp), 0);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#fafafa',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
        padding: '16px 24px',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
      }}>
        <h1 style={{ margin: '0', fontSize: '24px', fontWeight: 'bold', color: '#1f2937' }}>
          Learn ASL - Letter by Letter
        </h1>
        <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#6b7280' }}>
          Click a letter, use arrow keys, or drag to rotate the model. Tips below.
        </p>
      </div>

      {/* Main content grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '300px 1fr 300px',
        gap: '24px',
        padding: '24px',
        flex: 1,
        overflow: 'auto'
      }}>
        {/* Left: Letter Selector */}
        <div>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#6b7280' }}>
            SELECT LETTER
          </h2>
          <LetterSelector 
            selected={selectedLetter} 
            onSelect={handleLetterSelect}
          />
        </div>

        {/* Center: 3D Model Viewer */}
        <div style={{
          background: '#fff',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
          minHeight: '500px',
          position: 'relative'
        }}>
          {selectedLetter && (
            <HandModelViewer key={selectedLetter} letter={selectedLetter} />
          )}

          {/* Reset view button - bottom right */}
          <button
            onClick={handleResetView}
            style={{
              position: 'absolute',
              bottom: '16px',
              right: '16px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              zIndex: 10,
              transition: 'background 0.2s',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}
            onMouseOver={(e) => e.target.style.background = '#1d4ed8'}
            onMouseOut={(e) => e.target.style.background = '#2563eb'}
          >
            Reset View
          </button>
        </div>

        {/* Right: Tips Panel */}
        <div>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#6b7280' }}>
            TIPS & INFO
          </h2>
          <LetterInfo letter={selectedLetter} />
        </div>
      </div>

      {/* Footer: Keyboard shortcuts hint */}
      <div style={{
        background: '#f3f4f6',
        borderTop: '1px solid #e5e7eb',
        padding: '12px 24px',
        fontSize: '12px',
        color: '#6b7280',
        textAlign: 'center'
      }}>
        ⌨️ Keyboard: <strong>Arrow Keys</strong> to cycle letters | <strong>Drag</strong> model to rotate | <strong>Scroll</strong> to zoom
      </div>
    </div>
  );
}

export default LearnPage;
