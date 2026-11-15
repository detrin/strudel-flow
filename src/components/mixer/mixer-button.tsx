import { SlidersVertical } from 'lucide-react';
import { ControlButton } from '@/components/editor/control-button';
import { useMixer } from '@/lib/mixer';

/** Opens the mixer: every line's level, meter, mute and solo. */
export function MixerButton() {
  const open = useMixer((state) => state.open);
  const toggle = useMixer((state) => state.toggle);
  return (
    <ControlButton
      title="Mixer"
      active={open}
      aria-pressed={open}
      onClick={toggle}
      className="nokey nodrag nopan"
    >
      <SlidersVertical className="size-4" aria-hidden="true" />
    </ControlButton>
  );
}
