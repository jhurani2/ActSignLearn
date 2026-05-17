import { useCallback, useEffect, useState } from 'react';
import LoginPage from './components/auth/LoginPage';
import GestureController from './components/gesture/GestureController';
import DashboardPage from './components/dashboard/DashboardPage';
import LaunchSequence from './components/LaunchSequence';
import UnderwaterBackground from './components/theme/UnderwaterBackground';
import ActSignLearnStudio from './ActSignLearnStudio';
import {
  getProgress,
  getSession,
  logout,
  markLearned,
  recordPractice,
  signIn,
  signUp,
} from './services/api';
import './styles.css';

const TOKEN_KEY = 'actsignlearn_session_token';
const LEGACY_TOKEN_KEY = 'palmread_session_token';

export default function App() {
  const [authStatus, setAuthStatus] = useState('loading');
  const [authLoading, setAuthLoading] = useState(false);
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [progress, setProgress] = useState(null);
  const [activeDeck, setActiveDeck] = useState(null);
  const [launchDone, setLaunchDone] = useState(false);

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

  const handleBackToDashboard = () => {
    setPage('dashboard');
    setActiveDeck(null);
  };

  const finishLaunch = useCallback(() => {
    setLaunchDone(true);
  }, []);

  let view;
  if (!launchDone) {
    view = <LaunchSequence onComplete={finishLaunch} />;
  } else if (authStatus === 'loading') {
    view = <div className="center-loader">Loading ASL...</div>;
  } else if (authStatus !== 'authenticated') {
    view = <LoginPage onSubmit={authSubmit} loading={authLoading} />;
  } else if (page === 'dashboard') {
    view = (
      <DashboardPage
        user={user}
        progress={progress}
        onNavigate={handleDashboardNavigate}
        onLogout={handleLogout}
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
      {authStatus === 'authenticated' && page === 'dashboard' ? (
        <GestureController showCameraToggle activeView={page}>{view}</GestureController>
      ) : (
        view
      )}
    </div>
  );
}
