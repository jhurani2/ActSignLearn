import { useMemo, useState } from 'react';
import { OCEAN_BUDDIES } from '../../data/decks';

const QUESTIONS = [
  {
    id: 'goal',
    eyebrow: 'Your reason',
    title: 'What brings you here?',
    options: [
      { value: 'brand_new', label: 'Brand new to ASL', detail: 'Start from the very beginning.' },
      { value: 'alphabet_first', label: 'Learn the alphabet', detail: 'Build A-Z confidence first.' },
      { value: 'communication', label: 'Communicate with someone', detail: 'Focus on useful, practical signs.' },
      { value: 'school_work', label: 'School or work', detail: 'Keep goals organized and measurable.' },
      { value: 'speed_accuracy', label: 'Speed and accuracy', detail: 'Train faster, cleaner recognition.' },
    ],
  },
  {
    id: 'experience',
    eyebrow: 'Starting point',
    title: 'How much ASL do you know right now?',
    options: [
      { value: 'none', label: 'None yet', detail: 'A true first lesson path.' },
      { value: 'few_letters', label: 'A few letters', detail: 'Review basics and fill gaps.' },
      { value: 'alphabet_slowly', label: 'Alphabet slowly', detail: 'Practice recall and smoothness.' },
      { value: 'some_signs', label: 'Some signs', detail: 'Balance letters with broader practice.' },
      { value: 'reviewing', label: 'Reviewing', detail: 'Sharpen speed, accuracy, and consistency.' },
    ],
  },
  {
    id: 'learnBest',
    eyebrow: 'Learning style',
    title: 'What helps you learn best?',
    options: [
      { value: 'steps', label: 'Step-by-step instructions', detail: 'Break each sign into parts.' },
      { value: 'visual_model', label: 'Watching a model', detail: 'Use visual examples first.' },
      { value: 'instant_feedback', label: 'Instant feedback', detail: 'Practice with camera scores.' },
      { value: 'games', label: 'Games and challenges', detail: 'Keep momentum playful.' },
      { value: 'repetition', label: 'Repetition over time', detail: 'Use spaced review and steady reps.' },
    ],
  },
  {
    id: 'challenge',
    eyebrow: 'Friction point',
    title: 'What feels hardest?',
    options: [
      { value: 'remembering', label: 'Remembering signs', detail: 'Use more review loops.' },
      { value: 'hand_shape', label: 'Making the hand shape', detail: 'Prioritize form and reference views.' },
      { value: 'speed', label: 'Moving fast enough', detail: 'Build recall before racing.' },
      { value: 'confidence', label: 'Knowing if I am correct', detail: 'Lean on camera feedback.' },
      { value: 'consistency', label: 'Staying consistent', detail: 'Use shorter repeatable sessions.' },
    ],
  },
  {
    id: 'practiceMood',
    eyebrow: 'Practice feel',
    title: 'How do you want practice to feel?',
    options: [
      { value: 'calm_guided', label: 'Calm and guided', detail: 'Clear prompts, lower pressure.' },
      { value: 'game_like', label: 'Fast and game-like', detail: 'More rounds and challenges.' },
      { value: 'accuracy_focused', label: 'Accuracy-focused', detail: 'Precision before speed.' },
      { value: 'short_daily', label: 'Short daily sessions', detail: 'A routine that is easy to keep.' },
      { value: 'competitive', label: 'Competitive', detail: 'Scores, races, and match goals.' },
    ],
  },
  {
    id: 'time',
    eyebrow: 'Schedule',
    title: 'How much time do you want to practice?',
    options: [
      { value: 'five_min_daily', label: '5 minutes daily', detail: 'Tiny sessions, high consistency.' },
      { value: 'ten_fifteen_daily', label: '10-15 minutes daily', detail: 'A steady learning pace.' },
      { value: 'twenty_plus_daily', label: '20+ minutes daily', detail: 'Deeper practice blocks.' },
      { value: 'few_times_week', label: 'A few times per week', detail: 'Flexible but structured.' },
      { value: 'flexible', label: 'Whenever I can', detail: 'Plan around open time.' },
    ],
  },
  {
    id: 'milestone',
    eyebrow: 'First win',
    title: 'What is your first milestone?',
    options: [
      { value: 'learn_az', label: 'Learn A-Z', detail: 'Cover every alphabet sign.' },
      { value: 'master_tricky', label: 'Master tricky letters', detail: 'Focus on confusing shapes.' },
      { value: 'fingerspell_name', label: 'Fingerspell my name', detail: 'Make it personal and useful.' },
      { value: 'daily_confidence', label: 'Build daily confidence', detail: 'Create a reliable habit.' },
      { value: 'high_accuracy', label: 'Get high camera accuracy', detail: 'Train toward mastery scores.' },
    ],
  },
  {
    id: 'motivation',
    eyebrow: 'Motivation',
    title: 'What kind of reminders motivate you?',
    options: [
      { value: 'streaks_badges', label: 'Streaks and badges', detail: 'Celebrate visible progress.' },
      { value: 'gentle_messages', label: 'Gentle messages', detail: 'Keep encouragement calm.' },
      { value: 'goals_checklists', label: 'Clear goals and checklists', detail: 'Know exactly what is next.' },
      { value: 'scores_rankings', label: 'Scores and rankings', detail: 'Use numbers to push forward.' },
      { value: 'self_directed', label: 'Not much motivation needed', detail: 'Keep the app quieter.' },
    ],
  },
];

function getLearnerType(answers) {
  if (answers.practiceMood === 'game_like' || answers.practiceMood === 'competitive' || answers.learnBest === 'games') {
    return 'Game Sprinter';
  }
  if (answers.goal === 'communication') return 'Communication Builder';
  if (answers.learnBest === 'visual_model') return 'Visual Explorer';
  if (answers.practiceMood === 'accuracy_focused' || answers.goal === 'speed_accuracy') return 'Accuracy Tuner';
  if (answers.time === 'five_min_daily' || answers.time === 'ten_fifteen_daily') return 'Consistency Learner';
  return 'Guided Builder';
}

function buildProfile(answers) {
  return {
    onboardingComplete: true,
    learnerType: getLearnerType(answers),
    experienceLevel: answers.experience,
    primaryGoal: answers.goal,
    preferredPracticeStyle: answers.learnBest,
    practiceMood: answers.practiceMood,
    schedulePreference: answers.time,
    motivationStyle: answers.motivation,
    firstMilestone: answers.milestone,
    challengeAreas: answers.challenge ? [answers.challenge] : [],
    answers,
  };
}

export default function LearnerOnboardingQuiz({ user, saving, onComplete }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');
  const buddy = useMemo(
    () => OCEAN_BUDDIES.find((item) => item.id === user?.avatar) || OCEAN_BUDDIES[0],
    [user]
  );
  const currentQuestion = QUESTIONS[stepIndex];
  const selectedValue = answers[currentQuestion.id] || '';
  const progressPercent = Math.round(((stepIndex + 1) / QUESTIONS.length) * 100);
  const isLastStep = stepIndex === QUESTIONS.length - 1;
  const predictedType = getLearnerType(answers);

  const selectAnswer = (value) => {
    setAnswers((current) => ({
      ...current,
      [currentQuestion.id]: value,
    }));
    setError('');
  };

  const goNext = async () => {
    if (!selectedValue) {
      setError('Choose the option that fits best.');
      return;
    }

    if (!isLastStep) {
      setStepIndex((index) => index + 1);
      return;
    }

    const nextProfile = buildProfile({
      ...answers,
      [currentQuestion.id]: selectedValue,
    });
    try {
      await onComplete(nextProfile);
    } catch (submitError) {
      setError(submitError.message || 'Unable to save your learner profile right now.');
    }
  };

  const goBack = () => {
    setError('');
    setStepIndex((index) => Math.max(0, index - 1));
  };

  return (
    <main className="screen-wrap onboarding-wrap">
      <section className="onboarding-shell card-shell" aria-labelledby="onboarding-title">
        <div className="onboarding-hero">
          <div>
            <p className="eyebrow">New learner setup</p>
            <h1 id="onboarding-title" className="page-title">Let&apos;s personalize your ASL path</h1>
            <p className="page-subtitle">
              Answer a few quick questions so your future mastery plan can start from the right place.
            </p>
          </div>
          <article className="onboarding-buddy-note">
            <img src={buddy.sprite} alt="" aria-hidden="true" />
            <p><strong>{buddy.name}:</strong> Pick what feels true today. You can grow into a different plan later.</p>
          </article>
        </div>

        <div className="quiz-progress" aria-label={`Question ${stepIndex + 1} of ${QUESTIONS.length}`}>
          <span style={{ width: `${progressPercent}%` }} />
        </div>

        <div className="quiz-layout">
          <section className="quiz-question-card card" aria-labelledby="quiz-question-title">
            <p className="eyebrow">{currentQuestion.eyebrow}</p>
            <h2 id="quiz-question-title">{currentQuestion.title}</h2>
            <div className="quiz-options">
              {currentQuestion.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`quiz-option ${selectedValue === option.value ? 'active' : ''}`}
                  onClick={() => selectAnswer(option.value)}
                  aria-pressed={selectedValue === option.value}
                >
                  <strong>{option.label}</strong>
                  <span>{option.detail}</span>
                </button>
              ))}
            </div>
            {error ? <p className="form-error" role="status">{error}</p> : null}
            <div className="quiz-nav">
              <button className="ghost-btn" type="button" onClick={goBack} disabled={stepIndex === 0 || saving}>
                Back
              </button>
              <button className="primary-btn" type="button" onClick={goNext} disabled={saving}>
                {saving ? 'Saving...' : isLastStep ? 'Create my profile' : 'Next'}
              </button>
            </div>
          </section>

          <aside className="quiz-profile-preview card" aria-label="Learner profile preview">
            <p className="eyebrow">Profile preview</p>
            <h2>{predictedType}</h2>
            <p>
              Your plan will use your goal, schedule, challenge area, and motivation style to recommend lessons,
              practice rounds, and review timing.
            </p>
            <dl>
              <div>
                <dt>Answered</dt>
                <dd>{Object.keys(answers).length} / {QUESTIONS.length}</dd>
              </div>
              <div>
                <dt>Next signal</dt>
                <dd>{currentQuestion.eyebrow}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>
    </main>
  );
}
