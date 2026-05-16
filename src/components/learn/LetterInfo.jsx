import React from 'react';

const LetterInfo = ({ letter, info }) => (
  <aside style={{ padding: '24px', border: '1px solid #e5e7eb', borderRadius: '16px', background: '#f8fafc' }}>
    <h2>{letter} Details</h2>
    <p>{info?.description ?? 'Select a letter to view tips and sign information.'}</p>
    {info?.tips && (
      <div style={{ marginTop: '16px' }}>
        <h3>Tips</h3>
        <ul>
          {info.tips.map((tip, index) => (
            <li key={index}>{tip}</li>
          ))}
        </ul>
      </div>
    )}
  </aside>
);

export default LetterInfo;
