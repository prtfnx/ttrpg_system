import { authService, type UserInfo } from '@features/auth';
import { sessionLoginUrl } from '@features/auth/services/loginNavigation';
import type { SessionRole } from '@features/session/types/roles';
import { logger } from '@shared/utils/logger';
import { useCallback, useEffect, useRef, useState } from 'react';

interface InitialData {
  sessionCode?: string;
  userRole?: SessionRole;
}

interface SessionSummary {
  session_code: string;
  session_name: string;
}

export interface AppState {
  isAuthenticated: boolean;
  userInfo: UserInfo | null;
  selectedSession: string | null;
  userRole: SessionRole | null;
  loading: boolean;
  error: string | null;
  authenticationRequired: boolean;
}

const initialState: AppState = {
  isAuthenticated: false,
  userInfo: null,
  selectedSession: null,
  userRole: null,
  loading: true,
  error: null,
  authenticationRequired: false,
};

function getInitialData(): InitialData | undefined {
  return (window as Window & { __INITIAL_DATA__?: InitialData }).__INITIAL_DATA__;
}

async function resolveInitialSession(sessionCode: string): Promise<string | null> {
  const sessions = await authService.getUserSessions() as SessionSummary[];
  const byCode = sessions.find(session => session.session_code === sessionCode);
  const byName = sessions.find(session => session.session_name === sessionCode);
  return byCode?.session_code ?? byName?.session_code ?? null;
}

export function useAppBootstrap() {
  const [state, setState] = useState<AppState>(initialState);
  const authRevision = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const revision = ++authRevision.current;
    const isStale = () => cancelled || revision !== authRevision.current;

    const initializeAuth = async () => {
      try {
        logger.debug('App auth initialization started');
        setState(prev => ({ ...prev, loading: true, error: null }));

        const isInitialized = await authService.initialize();
        logger.debug('App auth initialization result', { isInitialized });

        if (isStale()) return;

        if (!isInitialized) {
          logger.info('App auth initialization failed; redirecting to login');
          window.location.href = sessionLoginUrl(getInitialData()?.sessionCode);
          return;
        }

        const userInfo = authService.getUserInfo();
        const initData = getInitialData();

        if (initData?.sessionCode) {
          logger.debug('App initial session candidate found', initData.sessionCode);
          try {
            const resolved = await resolveInitialSession(initData.sessionCode);
            if (isStale()) return;
            if (resolved) {
              logger.debug('App initial session resolved to code', resolved);
              setState(prev => ({
                ...prev,
                isAuthenticated: true,
                userInfo: userInfo || prev.userInfo,
                selectedSession: resolved,
                userRole: initData.userRole ?? prev.userRole,
                loading: false,
              }));
              return;
            }
            logger.warn('App initial session could not be resolved; using injected value');
          } catch (error) {
            if (isStale()) return;
            logger.warn('Failed to resolve initial session against user sessions', error);
          }

          setState(prev => ({
            ...prev,
            isAuthenticated: true,
            userInfo: userInfo || prev.userInfo,
            selectedSession: initData.sessionCode ?? null,
            userRole: initData.userRole ?? prev.userRole,
            loading: false,
          }));
          return;
        }

        setState(prev => ({
          ...prev,
          isAuthenticated: true,
          userInfo,
          loading: false,
        }));
      } catch (error) {
        if (isStale()) return;
        logger.error('App auth initialization failed', error);
        setState(prev => ({
          ...prev,
          error: 'Authentication failed. Please try again.',
          loading: false,
        }));
      }
    };

    void initializeAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSessionSelected = useCallback((sessionCode: string, role: SessionRole) => {
    setState(prev => ({
      ...prev,
      selectedSession: sessionCode,
      userRole: role,
    }));
  }, []);

  const handleAuthError = useCallback(() => {
    authRevision.current += 1;
    setState(prev => ({
      ...prev,
      error: 'Your sign-in expired. Sign in again to return to this session.',
      isAuthenticated: false,
      userInfo: null,
      loading: false,
      authenticationRequired: true,
    }));
  }, []);

  return {
    state,
    handleSessionSelected,
    handleAuthError,
  };
}
