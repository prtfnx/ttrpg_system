/** Return only to a bounded session route, never to an arbitrary browser URL. */
export function sessionLoginUrl(sessionCode?: string | null): string {
  if (!sessionCode || sessionCode.length > 128 || /[^A-Za-z0-9_-]/.test(sessionCode)) return '/users/login';
  return `/users/login?${new URLSearchParams({ next: `/game/session/${sessionCode}` })}`;
}
