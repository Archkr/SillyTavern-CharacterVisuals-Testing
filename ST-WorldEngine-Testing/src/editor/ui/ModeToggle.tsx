import React, { useEffect, useState } from 'react';
import ModeManager, { EditorMode } from '../runtime/mode';

export interface ModeToggleProps {
  manager: ModeManager;
  onCancel?: () => void;
}

export const ModeToggle: React.FC<ModeToggleProps> = ({ manager, onCancel }) => {
  const [mode, setMode] = useState<EditorMode>(manager.getMode());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => manager.subscribe(setMode), [manager]);

  const toggle = async () => {
    setBusy(true);
    setError('');
    const target: EditorMode = mode === 'play' ? 'edit' : 'play';

    try {
      const switched = await manager.switchMode(target);
      if (!switched) {
        setError('Switch canceled — save or confirm to continue.');
        onCancel?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mode-toggle" aria-live="polite">
      <div className={`mode-indicator is-${mode}`}>
        <span className="dot" aria-hidden />
        <span className="label">{mode === 'play' ? 'Simulating' : 'Editing'}</span>
      </div>
      <button className={`button ${mode === 'play' ? 'danger' : 'primary'}`} onClick={toggle} disabled={busy}>
        {mode === 'play' ? 'Stop' : 'Play'}
      </button>
      {error && <span className="mode-warning">{error}</span>}
    </div>
  );
};

export default ModeToggle;
