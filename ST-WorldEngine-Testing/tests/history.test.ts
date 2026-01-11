import { describe, expect, it } from 'vitest';
import {
  CommandManager,
  createComponentEditCommand,
  createGizmoMoveCommand,
  createHierarchyMoveCommand,
  createPropertyEditCommand,
} from '../src/editor/history/commands';
import {
  clearHistorySnapshot,
  createMemoryStorage,
  persistHistorySnapshot,
  restoreHistorySnapshot,
} from '../src/editor/history/persistence';
import { WorldDocument } from '../src/world/schema';

describe('CommandManager', () => {
  it('tracks undo and redo stacks', () => {
    const manager = new CommandManager();
    const state = { value: 1 };
    const cmd = createPropertyEditCommand(state, 'value', 2, 'Increment');

    manager.execute(cmd);
    expect(state.value).toBe(2);
    expect(manager.canUndo()).toBe(true);

    manager.undo();
    expect(state.value).toBe(1);
    expect(manager.canRedo()).toBe(true);

    manager.redo();
    expect(state.value).toBe(2);
    expect(manager.canUndo()).toBe(true);
  });

  it('limits undo stack size', () => {
    const manager = new CommandManager(2);
    const state = { value: 0 };
    manager.execute(createPropertyEditCommand(state, 'value', 1));
    manager.execute(createPropertyEditCommand(state, 'value', 2));
    manager.execute(createPropertyEditCommand(state, 'value', 3));

    expect(manager.getUndoStack().length).toBe(2);
  });
});

describe('command wrappers', () => {
  const createWorld = (): WorldDocument => ({
    version: 1,
    nodes: [
      {
        id: 'root',
        transform: { position: { x: 0, y: 0, z: 0 } },
        children: [
          { id: 'child', transform: { position: { x: 1, y: 1, z: 1 } }, children: [] },
          { id: 'sibling', children: [] },
        ],
      },
    ],
  });

  it('wraps gizmo moves with undo support', () => {
    const world = createWorld();
    const manager = new CommandManager();
    const moveCommand = createGizmoMoveCommand(world, 'child', {
      position: { x: 2, y: 2, z: 2 },
    });

    manager.execute(moveCommand);
    expect(world.nodes[0].children?.[0].transform?.position?.x).toBe(2);

    manager.undo();
    expect(world.nodes[0].children?.[0].transform?.position?.x).toBe(1);
  });

  it('wraps hierarchy changes', () => {
    const world = createWorld();
    const manager = new CommandManager();

    const command = createHierarchyMoveCommand(world, 'child', { newParentId: undefined, newIndex: 1 });
    manager.execute(command);

    expect(world.nodes[0].children?.find((node) => node.id === 'child')).toBeUndefined();
    expect(world.nodes[0].id).toBe('root');
    expect(world.nodes[0].children?.length).toBe(1);
    expect(world.nodes[1].id).toBe('child');

    manager.undo();
    expect(world.nodes[0].children?.[0].id).toBe('child');
  });

  it('wraps component edits', () => {
    const component: Record<string, unknown> = { type: 'light', intensity: 1 };
    const manager = new CommandManager();
    const command = createComponentEditCommand(component, { intensity: 2 });

    manager.execute(command);
    expect(component.intensity).toBe(2);

    manager.undo();
    expect(component.intensity).toBe(1);
  });
});

describe('history persistence', () => {
  it('persists and restores history snapshots', () => {
    const world: WorldDocument = {
      version: 1,
      nodes: [{ id: 'root' }],
    };
    const storage = createMemoryStorage();
    const manager = new CommandManager();
    manager.execute(createPropertyEditCommand(world.nodes[0], 'id', 'root-renamed'));

    const snapshot = persistHistorySnapshot(manager, world, storage);
    expect(snapshot?.undoStack.length).toBe(1);

    const restored = restoreHistorySnapshot(storage);
    expect(restored?.world.nodes[0].id).toBe('root-renamed');
    expect(restored?.undoStack[0].description).toContain('Edit id');
  });

  it('clears persisted snapshot', () => {
    const storage = createMemoryStorage();
    const manager = new CommandManager();
    const world: WorldDocument = { version: 1, nodes: [{ id: 'root' }] };

    persistHistorySnapshot(manager, world, storage);
    clearHistorySnapshot(storage);

    expect(restoreHistorySnapshot(storage)).toBeUndefined();
  });
});
