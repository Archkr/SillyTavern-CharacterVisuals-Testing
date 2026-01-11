export type EditorMode = 'edit' | 'play';

export interface SimulationContext {
  mode: EditorMode;
  activate?: () => void;
  deactivate?: () => void;
  dispose?: () => void;
}

export interface ModeManagerOptions {
  createContext: (mode: EditorMode) => SimulationContext;
  /**
   * Invoked automatically when switching modes while unsaved changes are present.
   */
  autoSave?: () => Promise<void> | void;
  /**
   * Fallback prompt invoked when auto-save is not provided but there are unsaved changes.
   * Should return true to allow the mode switch to proceed.
   */
  confirmSwitch?: (current: EditorMode, next: EditorMode) => Promise<boolean> | boolean;
  /**
   * Custom checker for unsaved changes. If not provided, the manager uses its internal dirty flag.
   */
  hasUnsavedChanges?: () => boolean;
}

/**
 * Coordinates switching between editor and play simulation contexts.
 */
export class ModeManager {
  private mode: EditorMode;
  private options: ModeManagerOptions;
  private contexts = new Map<EditorMode, SimulationContext>();
  private listeners = new Set<(mode: EditorMode) => void>();
  private dirty = false;

  constructor(options: ModeManagerOptions, initialMode: EditorMode = 'edit') {
    this.options = options;
    this.mode = initialMode;
    const context = this.createOrGetContext(initialMode);
    context.activate?.();
  }

  getMode(): EditorMode {
    return this.mode;
  }

  isDirty(): boolean {
    return this.options.hasUnsavedChanges?.() ?? this.dirty;
  }

  markDirty(): void {
    this.dirty = true;
  }

  clearDirty(): void {
    this.dirty = false;
  }

  subscribe(listener: (mode: EditorMode) => void): () => void {
    this.listeners.add(listener);
    listener(this.mode);
    return () => this.listeners.delete(listener);
  }

  getContext(mode: EditorMode): SimulationContext | undefined {
    return this.contexts.get(mode);
  }

  async switchMode(target: EditorMode): Promise<boolean> {
    if (target === this.mode) {
      return true;
    }

    const previous = this.contexts.get(this.mode);
    const next = this.createOrGetContext(target);

    const canSwitch = await this.handleUnsavedChanges(target);
    if (!canSwitch) {
      return false;
    }

    previous?.deactivate?.();
    next.activate?.();

    this.mode = target;
    this.listeners.forEach((listener) => listener(this.mode));
    return true;
  }

  destroy(): void {
    // Ensure both editor and play contexts are cleaned up even if they were never activated.
    this.createOrGetContext('edit');
    this.createOrGetContext('play');
    this.contexts.forEach((context) => context.dispose?.());
    this.contexts.clear();
    this.listeners.clear();
  }

  private createOrGetContext(mode: EditorMode): SimulationContext {
    const existing = this.contexts.get(mode);
    if (existing) {
      return existing;
    }

    const context = this.options.createContext(mode);
    this.contexts.set(mode, context);
    return context;
  }

  private async handleUnsavedChanges(target: EditorMode): Promise<boolean> {
    if (!this.isDirty()) {
      return true;
    }

    if (this.options.autoSave) {
      await this.options.autoSave();
      this.clearDirty();
      return true;
    }

    if (this.options.confirmSwitch) {
      const ok = await this.options.confirmSwitch(this.mode, target);
      if (ok) {
        this.clearDirty();
      }
      return ok;
    }

    return true;
  }
}

export default ModeManager;
