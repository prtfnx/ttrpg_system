import { renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { useAuthenticationFailure } from '../useAuthenticationFailure';

const strictWrapper = ({ children }: { children: ReactNode }) => (
  <StrictMode>{children}</StrictMode>
);

it('notifies once for each authentication failure transition', () => {
  const firstCallback = vi.fn();
  const { rerender } = renderHook(
    ({ failed, callback }) => useAuthenticationFailure(failed, callback),
    {
      initialProps: { failed: true, callback: firstCallback },
      wrapper: strictWrapper,
    },
  );

  expect(firstCallback).toHaveBeenCalledOnce();

  const replacementCallback = vi.fn();
  rerender({ failed: true, callback: replacementCallback });
  expect(replacementCallback).not.toHaveBeenCalled();

  rerender({ failed: false, callback: replacementCallback });
  rerender({ failed: true, callback: replacementCallback });
  expect(replacementCallback).toHaveBeenCalledOnce();
});
