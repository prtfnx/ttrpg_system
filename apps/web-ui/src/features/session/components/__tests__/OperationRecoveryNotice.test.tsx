import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emitProtocolEvent } from '@lib/websocket/protocolEvents';
import { OperationRecoveryNotice } from '../OperationRecoveryNotice';

describe('saved changes notice', () => {
  it('shows retained uncertainty and retries without forgetting it', () => {
    const protocol = { getOperationRecoveryStatus: () => ({ pending: 1, blocked: 0, error: null }),
      retrySavedOperations: vi.fn(), discardSavedOperations: vi.fn() };
    render(<OperationRecoveryNotice protocol={protocol} />);
    expect(screen.getByRole('status')).toHaveTextContent('Unconfirmed saved changes');
    fireEvent.click(screen.getByRole('button', { name: 'Retry saved requests' }));
    expect(protocol.retrySavedOperations).toHaveBeenCalledOnce();
    expect(protocol.discardSavedOperations).not.toHaveBeenCalled();
  });

  it('requires a separate explicit choice before forgetting unknown outcomes', () => {
    const protocol = { getOperationRecoveryStatus: () => ({ pending: 0, blocked: 1, error: null }),
      retrySavedOperations: vi.fn(), discardSavedOperations: vi.fn() };
    render(<OperationRecoveryNotice protocol={protocol} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review forgetting records' }));
    expect(screen.getByText(/does not cancel or undo/)).toBeInTheDocument();
    expect(protocol.discardSavedOperations).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Forget saved requests' }));
    expect(protocol.discardSavedOperations).toHaveBeenCalledOnce();
  });

  it('hides after settlement and never exposes the previous protocol state after a switch', () => {
    let pending = 1;
    const protocol = { getOperationRecoveryStatus: () => ({ pending, blocked: 0, error: null }),
      retrySavedOperations: vi.fn(), discardSavedOperations: vi.fn() };
    const view = render(<OperationRecoveryNotice protocol={protocol} />);
    pending = 0;
    act(() => emitProtocolEvent('operation-recovery-changed', protocol.getOperationRecoveryStatus()));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    view.rerender(<OperationRecoveryNotice protocol={null} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
