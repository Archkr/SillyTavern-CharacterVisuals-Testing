import React, { useMemo, useRef, useState } from 'react';
import { WorldPackage } from '../../world/export';

export interface WorldIoMenuProps {
  onExport: () => Promise<WorldPackage> | WorldPackage;
  onImport: (payload: string) => Promise<void> | void;
}

export const WorldIoMenu: React.FC<WorldIoMenuProps> = ({ onExport, onImport }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const exportLabel = useMemo(() => (busy ? 'Exporting…' : 'Export world'), [busy]);

  const triggerImport = () => {
    setError('');
    fileInputRef.current?.click();
  };

  const handleExport = async () => {
    setBusy(true);
    setError('');
    setStatus('Preparing export…');
    try {
      const pkg = await onExport();
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'world.json';
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus(`Export complete (hash ${pkg.hash})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('Export failed');
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const [file] = Array.from(event.target.files ?? []);
    if (!file) return;

    setBusy(true);
    setError('');
    setStatus(`Importing ${file.name}…`);

    try {
      const payload = await file.text();
      await onImport(payload);
      setStatus(`Imported ${file.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('Import failed');
    } finally {
      setBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="world-io-menu">
      <div className="controls">
        <button className="button" onClick={triggerImport} disabled={busy} aria-live="polite">
          Import world
        </button>
        <button className="button primary" onClick={handleExport} disabled={busy} aria-live="polite">
          {exportLabel}
        </button>
        <input
          type="file"
          accept="application/json"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
      <div className="status" role="status" aria-live="polite">
        {status}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
};

export default WorldIoMenu;
