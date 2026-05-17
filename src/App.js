import { useCallback, useEffect, useState } from 'react';
import LoginPage from './components/auth/LoginPage';
import GestureController from './components/gesture/GestureController';
import DashboardPage from './components/dashboard/DashboardPage';
import LaunchSequence from './components/LaunchSequence';
import LearnerOnboardingQuiz from './components/onboarding/LearnerOnboardingQuiz';
import UnderwaterBackground from './components/theme/UnderwaterBackground';
import ActSignLearnStudio from './ActSignLearnStudio';
import {
  generatePersonalizedPlan,
  getProgress,
  getSession,
  logout,
  markLearned,
  recordPlanTime,
  recordPractice,
  saveLearnerProfile,
  signIn,
  signUp,
} from './services/api';
import './styles.css';

const TOKEN_KEY = 'actsignlearn_session_token';
const LEGACY_TOKEN_KEY = 'palmread_session_token';
const STARTED_PLANS_KEY = 'actsignlearn_started_plan_ids';

function readStartedPlanIds() {
  if (typeof window === 'undefined') return {};

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STARTED_PLANS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveStartedPlanIds(ids) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STARTED_PLANS_KEY, JSON.stringify(ids));
}

function getPlanSessionLetters(plan) {
  const primaryLetters = Array.isArray(plan?.primaryFocusLetters) ? plan.primaryFocusLetters : [];
  const focusLetters = Array.isArray(plan?.focusLetters) ? plan.focusLetters : [];
  const sourceLetters = primaryLetters.length ? primaryLetters : focusLetters.slice(0, 3);
  const fallbackLetters = sourceLetters.length ? sourceLetters : focusLetters;

  return fallbackLetters
    .map((letter) => String(letter || '').trim().toUpperCase())
    .filter((letter) => /^[A-Z]$/.test(letter));
}

export default function App() {
  const [authStatus, setAuthStatus] = useState('loading');
  const [authLoading, setAuthLoading] = useState(false);
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [progress, setProgress] = useState(null);
  const [activeDeck, setActiveDeck] = useState(null);
  const [launchDone, setLaunchDone] = useState(false);
  const [learnerProfile, setLearnerProfile] = useState(null);
  const [savingLearnerProfile, setSavingLearnerProfile] = useState(false);
  const [personalizedPlan, setPersonalizedPlan] = useState(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [retakingQuiz, setRetakingQuiz] = useState(false);
  const [startedPlanIds, setStartedPlanIds] = useState(readStartedPlanIds);

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      const savedToken = window.localStorage.getItem(TOKEN_KEY) || window.localStorage.getItem(LEGACY_TOKEN_KEY);
      if (!savedToken) {
        if (isMounted) setAuthStatus('guest');
        return;
      }

      try {
        const session = await getSession(savedToken);
        if (!isMounted) return;
        setToken(savedToken);
        setUser(session.user);
        setLearnerProfile(session.learnerProfile || null);
        setPersonalizedPlan(session.personalizedPlan || null);
        setAuthStatus('authenticated');
        window.localStorage.setItem(TOKEN_KEY, savedToken);
        window.localStorage.removeItem(LEGACY_TOKEN_KEY);
      } catch {
        window.localStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(LEGACY_TOKEN_KEY);
        if (isMounted) setAuthStatus('guest');
      }
    }

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !token) return;

    let isMounted = true;
    getProgress(token)
      .then((payload) => {
        if (!isMounted) return;
        setProgress(payload.progress);
      })
      .catch(() => {
        if (!isMounted) return;
        setProgress(null);
      });

    return () => {
      isMounted = false;
    };
  }, [authStatus, token]);

  const authSubmit = async ({ mode, username, password, avatar }) => {
    setAuthLoading(true);
    try {
      const action = mode === 'signin' ? signIn : signUp;
      const result = await action({ username, password, avatar });
      setToken(result.token);
      setUser(result.user);
      setProgress(result.progress || null);
      setLearnerProfile(result.learnerProfile || null);
      setPersonalizedPlan(result.personalizedPlan || null);
      setRetakingQuiz(false);
      setAuthStatus('authenticated');
      setPage('dashboard');
      setActiveDeck(null);
      window.localStorage.setItem(TOKEN_KEY, result.token);
      window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    const safeToken = token;
    setAuthStatus('guest');
    setToken('');
    setUser(null);
    setProgress(null);
    setLearnerProfile(null);
    setPersonalizedPlan(null);
    setRetakingQuiz(false);
    setPage('dashboard');
    setActiveDeck(null);
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);

    if (safeToken) {
      try {
        await logout(safeToken);
      } catch {
        // Ignore backend logout failures after local session cleanup.
      }
    }
  };

  const handleDashboardNavigate = (deck) => {
    if (!deck || !deck.unlocked) return;
    setActiveDeck(deck);
    setPage(deck.mode === 'learn' ? 'learn' : 'practice');
  };

  const handleStartPersonalizedPlan = (deck) => {
    if (!deck || !deck.unlocked || !personalizedPlan) return;

    const recommendedLetters = getPlanSessionLetters(personalizedPlan);
    const planStartedAt = new Date().toISOString();
    const planDeck = {
      ...deck,
      title: `Recommended: ${deck.title}`,
      items: recommendedLetters.length ? recommendedLetters : deck.items,
      planSession: {
        planId: personalizedPlan.id,
        sourceDeckId: deck.id,
        focusLetters: recommendedLetters,
        startedAt: planStartedAt,
      },
    };

    setStartedPlanIds((current) => {
      const next = {
        ...current,
        [personalizedPlan.id]: planStartedAt,
      };
      saveStartedPlanIds(next);
      return next;
    });
    setActiveDeck(planDeck);
    setPage(deck.mode === 'learn' ? 'learn' : 'practice');
  };

  const handleBackToDashboard = () => {
    setPage('dashboard');
    setActiveDeck(null);
  };

  const finishLaunch = useCallback(() => {
    setLaunchDone(true);
  }, []);

  const completeLearnerOnboarding = async (profile) => {
    if (!token) return;

    setSavingLearnerProfile(true);
    try {
      const response = await saveLearnerProfile(token, profile);
      setLearnerProfile(response.learnerProfile || profile);
      setPersonalizedPlan(response.personalizedPlan || null);
      setRetakingQuiz(false);
      setPage('dashboard');
      setActiveDeck(null);
    } finally {
      setSavingLearnerProfile(false);
    }
  };

  const refreshPersonalizedPlan = async () => {
    if (!token) return;

    setGeneratingPlan(true);
    try {
      const response = await generatePersonalizedPlan(token, 'dashboard_refresh', {
        provider: 'groq',
        refreshSeed: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      setPersonalizedPlan(response.personalizedPlan || null);
    } finally {
      setGeneratingPlan(false);
    }
  };

  const retakeLearnerQuiz = () => {
    setRetakingQuiz(true);
    setPage('dashboard');
    setActiveDeck(null);
  };

  const handlePlanTime = useCallback(async (entry) => {
    if (!token || !entry?.planId) return;

    const response = await recordPlanTime(token, entry);
    if (response.personalizedPlan) {
      setPersonalizedPlan(response.personalizedPlan);
    }
    if (response.progress) {
      setProgress(response.progress);
    }
  }, [token]);

  let view;
  if (!launchDone) {
    view = <LaunchSequence onComplete={finishLaunch} />;
  } else if (authStatus === 'loading') {
    view = <div className="center-loader">Loading ASL...</div>;
  } else if (authStatus !== 'authenticated') {
    view = <LoginPage onSubmit={authSubmit} loading={authLoading} />;
  } else if (retakingQuiz || learnerProfile?.onboardingComplete !== true) {
    view = (
      <LearnerOnboardingQuiz
        user={user}
        retake={retakingQuiz}
        saving={savingLearnerProfile}
        onComplete={completeLearnerOnboarding}
      />
    );
  } else if (page === 'dashboard') {
    view = (
      <DashboardPage
        user={user}
        progress={progress}
        learnerProfile={learnerProfile}
        personalizedPlan={personalizedPlan}
        planStarted={Boolean(personalizedPlan?.id && startedPlanIds[personalizedPlan.id])}
        generatingPlan={generatingPlan}
        onGeneratePlan={refreshPersonalizedPlan}
        onStartPlan={handleStartPersonalizedPlan}
        onNavigate={handleDashboardNavigate}
        onLogout={handleLogout}
        onRetakeQuiz={retakeLearnerQuiz}
      />
    );
  } else {
    view = (
      <ActSignLearnStudio
        user={user}
        progress={progress}
        activeDeck={activeDeck}
        initialMode={page === 'practice' ? 'practice' : 'learn'}
        onBackToDashboard={handleBackToDashboard}
        onPlanTime={handlePlanTime}
        onMarkLearned={async (letter) => {
          if (!token) return;
          const response = await markLearned(token, letter);
          setProgress(response.progress);
        }}
        onPracticeComplete={async ({ letter, score, passed }) => {
          if (!token) return;
          const response = await recordPractice(token, letter, score, passed);
          setProgress(response.progress);
        }}
      />
    );
  }

  return (
    <div className="app-root">
      <UnderwaterBackground />
      {authStatus === 'authenticated' && learnerProfile?.onboardingComplete === true && page === 'dashboard' && !retakingQuiz ? (
        <GestureController showCameraToggle activeView={page}>{view}</GestureController>
      ) : (
        view
      )}
    </div>
  );
}
