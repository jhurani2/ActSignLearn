import { useRef, useState } from 'react';

export default function ModelViewer({ letter, children }) {
  const ref = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [rot, setRot] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const onPointerDown = (e) => {
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    ref.current.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    setRot((r) => ({ x: Math.max(-40, Math.min(40, r.x + dy * 0.2)), y: (r.y + dx * 0.4) % 360 }));
  };

  const onPointerUp = (e) => {
    dragging.current = false;
    try { ref.current.releasePointerCapture(e.pointerId); } catch {};
  };

  const toggleExpand = () => setExpanded((s) => !s);

  return (
    <div>
      <div
        ref={ref}
        className="model-slot"
        onClick={toggleExpand}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ cursor: 'grab', transformStyle: 'preserve-3d', transition: dragging.current ? 'none' : 'transform 220ms' }}
        aria-hidden
      >
        <div style={{ transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {children || <div style={{ fontSize: 18, color: 'var(--muted)' }}>hand model ({letter})</div>}
        </div>
      </div>

      {expanded && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(7,10,17,0.35)', zIndex: 1200 }} onClick={toggleExpand}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(92vw,920px)', height: 'min(80vh,760px)', background: 'white', borderRadius: 16, padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 18px 60px rgba(2,6,23,0.24)' }}>
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)` }}>
              {children || <div style={{ fontSize: 48, color: 'var(--muted)' }}>hand model ({letter})</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}