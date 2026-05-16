import React from 'react';

/**
 * LetterSelector
 * @param {string} selected - currently selected letter (A-Z)
 * @param {function} onSelect - callback when user clicks a letter
 * 
 * Renders an A-Z grid of clickable buttons
 * Selected button is highlighted for visual feedback
 */
export function LetterSelector({ selected, onSelect }) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(40px, 1fr))',
      gap: '8px',
      padding: '12px',
      background: '#f5f5f5',
      borderRadius: '8px',
      maxWidth: '280px'
    }}>
      {alphabet.map((letter) => (
        <button
          key={letter}
          onClick={() => onSelect(letter)}
          style={{
            padding: '8px',
            fontSize: '14px',
            fontWeight: selected === letter ? 'bold' : 'normal',
            border: selected === letter ? '2px solid #2563eb' : '1px solid #ddd',
            background: selected === letter ? '#dbeafe' : '#fff',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            color: selected === letter ? '#1e40af' : '#333'
          }}
          aria-label={`Sign letter ${letter}`}
          aria-pressed={selected === letter}
        >
          {letter}
        </button>
      ))}
    </div>
  );
}

export default LetterSelector;
