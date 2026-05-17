import { useEffect, useMemo, useState } from 'react';
import { OCEAN_BUDDIES } from '../data/decks';

const LAUNCH_COMPLETE_MS = 13800;
const FACT_START_MS = 5400;
const FACT_EXIT_MS = 12400;

const LAUNCH_FACTS = [
  {
    stat: '26 letters',
    title: 'Fingerspelling has a full A-Z set.',
    body: 'ASL fingerspelling is often used for names, places, titles, and words without a common sign. J and Z are the motion letters in the alphabet.',
  },
  {
    stat: '5 parameters',
    title: 'Small changes can change a sign.',
    body: 'Handshape, movement, location, palm orientation, and facial expression all carry meaning in ASL, so accuracy is more than matching a hand pose.',
  },
  {
    stat: '21 points',
    title: 'Your camera reads hand landmarks.',
    body: 'This app compares 21 tracked hand landmarks against reference poses, then turns that geometry into real-time practice feedback.',
  },
  {
    stat: '1 language',
    title: 'ASL is not English on the hands.',
    body: 'ASL has its own grammar, rhythm, and visual structure. Facial expression and body movement are part of the language, not decoration.',
  },
  {
    stat: '99% goal',
    title: 'Mastery comes from steady shape.',
    body: 'In this academy, a sign is marked mastered after a 99% practice score, which rewards clear handshape and controlled positioning.',
  },
  {
    stat: '1817',
    title: 'ASL education has deep roots.',
    body: 'Formal Deaf education in the United States began in Hartford, Connecticut with Thomas Gallaudet and Laurent Clerc.',
  },
  {
    stat: '1965',
    title: 'ASL was recognized as a language.',
    body: 'William Stokoe\'s research helped show that ASL has its own structured grammar, not just gestures for spoken words.',
  },
  {
    stat: '300+',
    title: 'Sign language is not universal.',
    body: 'There are more than 300 sign languages used around the world, each with its own vocabulary and grammar.',
  },
  {
    stat: '0 standard',
    title: 'ASL is visual-spatial first.',
    body: 'ASL does not use English word order, and it does not have one standard everyday written form like spoken English does.',
  },
  {
    stat: '6 signals',
    title: 'The face is part of the grammar.',
    body: 'Eyebrows, mouth movements, eye gaze, head nods, head shakes, and body movement can all carry grammatical meaning in ASL.',
  },
  {
    stat: 'Names + terms',
    title: 'Fingerspelling has a specific job.',
    body: 'Fingerspelling is often used for names, places, technical terms, and words without a common sign, not as a replacement for fluent signing.',
  },
];

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export default function LaunchSequence({ onComplete }) {
  const [phase, setPhase] = useState('splash');
  const fact = useMemo(() => pickRandom(LAUNCH_FACTS), []);
  const buddy = useMemo(() => pickRandom(OCEAN_BUDDIES), []);
  const isSplashPhase = phase === 'splash';

  useEffect(() => {
    const factTimer = window.setTimeout(() => setPhase('fact'), FACT_START_MS);
    const exitTimer = window.setTimeout(() => setPhase('exit'), FACT_EXIT_MS);
    const completeTimer = window.setTimeout(() => {
      if (typeof onComplete === 'function') {
        onComplete();
      }
    }, LAUNCH_COMPLETE_MS);

    return () => {
      window.clearTimeout(factTimer);
      window.clearTimeout(exitTimer);
      window.clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <main
      className={`launch-sequence ${phase}`}
      style={{ '--launch-duration': `${LAUNCH_COMPLETE_MS}ms` }}
      aria-label="ActSignLearn launch"
    >
      <section className="launch-splash" aria-hidden={!isSplashPhase}>
        <div className="launch-mark-wrap">
          <img className="launch-hero" src="/animation_launch.png" alt="ActSignLearn" />
          <div className="launch-surface-line" />
        </div>
      </section>

      <section className="launch-fact-stage" aria-hidden={isSplashPhase}>
        <div className="launch-fact-heading">
          <p className="eyebrow">Fact of the Day</p>
          <h1>Before we dive in</h1>
        </div>

        <div className="launch-buddy-scene">
          <img className="launch-buddy" src={buddy.sprite} alt="" aria-hidden="true" />
          <article className="launch-speech" aria-live="polite">
            <p className="launch-fact-stat">{fact.stat}</p>
            <h2>{fact.title}</h2>
            <p>{fact.body}</p>
          </article>
        </div>
      </section>
    </main>
  );
}
