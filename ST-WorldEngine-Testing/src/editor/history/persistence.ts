import { CommandManager, CommandPreview } from './commands';
import { WorldDocument } from '../../world/schema';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface HistorySnapshot {
  undoStack: CommandPreview[];
  redoStack: CommandPreview[];
  world: WorldDocument;
  timestamp: number;
}

const SNAPSHOT_KEY = 'world-editor.history';

const getDefaultStorage = (): StorageLike | undefined => {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    return (globalThis as unknown as { localStorage: StorageLike }).localStorage;
  }
  return undefined;
};

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function persistHistorySnapshot(
  manager: CommandManager,
  world: WorldDocument,
  storage: StorageLike | undefined = getDefaultStorage(),
  key = SNAPSHOT_KEY
): HistorySnapshot | undefined {
  if (!storage) return undefined;
  const snapshot: HistorySnapshot = {
    ...manager.getPreviewStacks(),
    world: deepClone(world),
    timestamp: Date.now(),
  };
  storage.setItem(key, JSON.stringify(snapshot));
  return snapshot;
}

export function restoreHistorySnapshot(
  storage: StorageLike | undefined = getDefaultStorage(),
  key = SNAPSHOT_KEY
): HistorySnapshot | undefined {
  if (!storage) return undefined;
  const raw = storage.getItem(key);
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as Partial<HistorySnapshot>;
    if (!parsed.world || !parsed.timestamp || !parsed.undoStack || !parsed.redoStack) {
      return undefined;
    }
    return {
      world: parsed.world as WorldDocument,
      timestamp: parsed.timestamp,
      undoStack: parsed.undoStack as CommandPreview[],
      redoStack: parsed.redoStack as CommandPreview[],
    };
  } catch (error) {
    console.warn('Failed to restore history snapshot', error);
    return undefined;
  }
}

export function clearHistorySnapshot(storage: StorageLike | undefined = getDefaultStorage(), key = SNAPSHOT_KEY): void {
  storage?.removeItem(key);
}

export function createMemoryStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}
