import React from 'react';
import { signMeta } from '../../data/signMeta';

/**
 * LetterInfo
 * @param {string} letter - currently selected letter (A-Z)
 * 
 * Displays tips and description for the current letter sign
 * Data comes from signMeta.js
 */
export function LetterInfo({ letter }) {
  const meta = signMeta[letter] || { tips: [], description: 'Sign information' };

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '16px',
      maxWidth: '280px',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
    }}>
      <h3 style={{
        margin: '0 0 8px 0',
        fontSize: '18px',
        fontWeight: 'bold',
        color: '#1f2937'
      }}>
        Letter <span style={{ color: '#2563eb', fontSize: '20px' }}>{letter}</span>
      </h3>

      <p style={{
        margin: '0 0 12px 0',
        fontSize: '14px',
        color: '#4b5563',
        fontStyle: 'italic'
      }}>
        {meta.description}
      </p>

      <div style={{ marginTop: '12px' }}>
        <p style={{
          margin: '0 0 8px 0',
          fontSize: '12px',
          fontWeight: '600',
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Tips
        </p>
        <ul style={{
          margin: '0',
          paddingLeft: '20px',
          listStyle: 'disc'
        }}>
          {meta.tips && meta.tips.map((tip, idx) => (
            <li
              key={idx}
              style={{
                fontSize: '13px',
                color: '#374151',
                marginBottom: '6px',
                lineHeight: '1.4'
              }}
            >
              {tip}
            </li>
          ))}
        </ul>
      </div>

      {/* Visual indicator */}
      <div style={{
        marginTop: '12px',
        padding: '8px',
        background: '#f0fdf4',
        borderLeft: '3px solid #10b981',
        borderRadius: '4px',
        fontSize: '12px',
        color: '#065f46'
      }}>
        💡 Rotate the model with your mouse to see the sign from different angles.
      </div>
    </div>
  );
}

export default LetterInfo;
