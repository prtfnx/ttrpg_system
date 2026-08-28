import { useEffect, useRef } from 'react';

export function useAuthenticationFailure(
  authenticationFailed: boolean,
  onAuthError: () => void,
): void {
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!authenticationFailed) {
      notifiedRef.current = false;
      return;
    }
    if (notifiedRef.current) return;
    notifiedRef.current = true;
    onAuthError();
  }, [authenticationFailed, onAuthError]);
}
