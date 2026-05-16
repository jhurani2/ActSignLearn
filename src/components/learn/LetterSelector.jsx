import React from 'react';

const LetterSelector = ({ letters, selectedLetter, onSelect }) => (
  <div>
    <h2>Choose a Letter</h2>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(40px, 1fr))',
        gap: '12px',
      }}
    >
      {letters.map((letter) => (
        <button
          key={letter}
          type="button"
          onClick={() => onSelect(letter)}
          style={{
            padding: '12px',
            borderRadius: '8px',
            border: selectedLetter === letter ? '2px solid #2563eb' : '1px solid #d1d5db',
            background: selectedLetter === letter ? '#e0f2fe' : '#fff',
            cursor: 'pointer',
          }}
        >
          {letter}
        </button>
      ))}
    </div>
  </div>
);

export default LetterSelector;
