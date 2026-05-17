import { useMemo } from 'react';
import { AVATAR_IMAGES } from '../../data/decks';

function pickUniqueSwimmers(count) {
  return AVATAR_IMAGES
    .map((src) => ({ src, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, count);
}

export default function UnderwaterBackground() {
  const swimmers = useMemo(
    () => pickUniqueSwimmers(7).map((item, index) => ({
      id: `swimmer-${index}`,
      src: item.src,
      top: `${12 + Math.random() * 62}%`,
      left: `${-28 - Math.random() * 16}%`,
      width: `${62 + Math.random() * 60}px`,
      duration: `${22 + Math.random() * 18}s`,
      delay: `${-Math.random() * 18}s`,
      opacity: 0.38 + Math.random() * 0.38,
    })),
    []
  );

  return (
    <div className="ocean-scene" aria-hidden="true">
      <div className="gradient-layer" />
      <div className="light-layer" />
      <div className="bubble-layer">
        {Array.from({ length: 24 }, (_, index) => (
          <span key={`bubble-${index}`} className="bubble" />
        ))}
      </div>
      <div className="reef-layer" />
      {swimmers.map((swimmer) => (
        <div
          key={swimmer.id}
          className="sprite-swim"
          style={{
            top: swimmer.top,
            left: swimmer.left,
            width: swimmer.width,
            animationDuration: swimmer.duration,
            animationDelay: swimmer.delay,
            opacity: swimmer.opacity,
          }}
        >
          <img src={swimmer.src} alt="" />
        </div>
      ))}
    </div>
  );
}
