import { Cable } from 'lucide-react';
import { ControlButton } from './control-button';
import { toggleLearning, useMidi } from '@/lib/midi';

const STATUS = {
  off: 'MIDI learn: click, then click a knob and move a control on your controller',
  on: 'MIDI learn: click, then click a knob and move a control on your controller',
  unsupported: 'This browser has no Web MIDI (try Chrome or Edge)',
  denied: 'MIDI access was blocked; allow it in the site settings',
};

/** Turns MIDI learn on and off; shows the last control seen. */
export function MidiButton() {
  const learning = useMidi((state) => state.learning);
  const status = useMidi((state) => state.status);
  const armed = useMidi((state) => state.armed);
  return (
    <ControlButton
      title={
        learning
          ? armed
            ? 'Now move a knob or fader on your controller (click to stop learning)'
            : 'Click a knob to link it (click here to stop learning)'
          : STATUS[status]
      }
      aria-label="MIDI learn"
      active={learning}
      aria-pressed={learning}
      onClick={() => void toggleLearning()}
      className="nokey nodrag nopan"
    >
      <Cable className="size-4" aria-hidden="true" />
    </ControlButton>
  );
}
