import { FloatingPanel } from '@shared/components/FloatingPanel/FloatingPanel';
import { InitiativePanel } from './InitiativePanel';

interface Props {
  onClose: () => void;
}

export function FloatingInitiativeTracker({ onClose }: Props) {
  return (
    <FloatingPanel
      id="initiative-tracker"
      title="Initiative Tracker"
      defaultPos={{ x: 20, y: 100 }}
      defaultSize={{ width: 280, height: 420 }}
      onClose={onClose}
    >
      <InitiativePanel />
    </FloatingPanel>
  );
}
