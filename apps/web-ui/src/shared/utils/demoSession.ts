/** The server opts this page into a separate guest identity; cookies stay opaque. */
export function isDemoSession(sessionCode?: string): boolean {
  const initial = (window as Window & {
    __INITIAL_DATA__?: { isDemo?: boolean; sessionCode?: string };
  }).__INITIAL_DATA__;
  return initial?.isDemo === true && typeof initial.sessionCode === 'string'
    && (sessionCode === undefined || initial.sessionCode === sessionCode);
}

export function demoQuery(sessionCode?: string): string {
  return isDemoSession(sessionCode) ? '?demo=1' : '';
}
