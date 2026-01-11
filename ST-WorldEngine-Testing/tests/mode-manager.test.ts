import { describe, expect, it, vi } from 'vitest';
import ModeManager, { EditorMode, SimulationContext } from '../src/editor/runtime/mode';

type ContextState = SimulationContext & { activated: number; deactivated: number; disposed: number };

const createContextFactory = () => {
  const created: Record<EditorMode, ContextState> = {
    edit: { mode: 'edit', activated: 0, deactivated: 0, disposed: 0 },
    play: { mode: 'play', activated: 0, deactivated: 0, disposed: 0 },
  };

  const factory = (mode: EditorMode): ContextState => {
    const ctx = created[mode];
    ctx.activate = () => ctx.activated++;
    ctx.deactivate = () => ctx.deactivated++;
    ctx.dispose = () => ctx.disposed++;
    return ctx;
  };

  return { created, factory };
};

describe('ModeManager', () => {
  it('swaps contexts and notifies listeners', async () => {
    const { created, factory } = createContextFactory();
    const manager = new ModeManager({ createContext: factory });
    const listener = vi.fn();
    manager.subscribe(listener);

    await manager.switchMode('play');
    expect(manager.getMode()).toBe('play');
    expect(created.edit.deactivated).toBe(1);
    expect(created.play.activated).toBe(1);
    expect(listener).toHaveBeenCalledWith('play');

    await manager.switchMode('edit');
    expect(manager.getMode()).toBe('edit');
    expect(created.edit.activated).toBeGreaterThan(0);
    expect(created.play.deactivated).toBe(1);
  });

  it('auto-saves when switching away from dirty state', async () => {
    const { factory } = createContextFactory();
    const autoSave = vi.fn();
    const manager = new ModeManager({ createContext: factory, autoSave });

    manager.markDirty();
    await manager.switchMode('play');
    expect(autoSave).toHaveBeenCalledTimes(1);
    expect(manager.isDirty()).toBe(false);
  });

  it('prompts when auto-save is unavailable', async () => {
    const { factory } = createContextFactory();
    const confirmSwitch = vi.fn().mockResolvedValue(false);
    const manager = new ModeManager({ createContext: factory, confirmSwitch });

    manager.markDirty();
    const switched = await manager.switchMode('play');
    expect(switched).toBe(false);
    expect(manager.getMode()).toBe('edit');
    expect(confirmSwitch).toHaveBeenCalledWith('edit', 'play');
  });

  it('disposes contexts on destroy', () => {
    const { created, factory } = createContextFactory();
    const manager = new ModeManager({ createContext: factory });
    manager.destroy();
    expect(created.edit.disposed).toBe(1);
    expect(created.play.disposed).toBe(1);
  });
});
