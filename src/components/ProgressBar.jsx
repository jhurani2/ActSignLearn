import { LETTERS } from '../data/aslData';

export default function ProgressBar({ currentIdx, practiced, onSelect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      <div className="section-label">alphabet progress</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '500px', justifyContent: 'center' }}>
        {LETTERS.map((l, i) => {
          const isDone   = practiced.has(l);
          const isActive = i === currentIdx;
          return (
            <div
              key={l}
              onClick={() => onSelect(i)}
              style={{
                width: '26px', height: '26px', borderRadius: '6px',
                border: `1px solid ${isActive ? '#c8a96e' : isDone ? '#3a5c32' : '#2e2b24'}`,
                background: isActive ? '#c8a96e' : isDone ? '#1e2e1a' : 'transparent',
                color: isActive ? '#0f0e0c' : isDone ? '#7bc96f' : '#3a3730',
                fontSize: '11px', fontWeight: 500,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all 0.2s',
                fontFamily: "'DM Mono', monospace",
              }}
            >
              {l}
            </div>
          );
        })}
      </div>
    </div>
  );
}
