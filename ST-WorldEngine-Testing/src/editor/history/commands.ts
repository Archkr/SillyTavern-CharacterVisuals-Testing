import { SceneNode, Transform, WorldDocument } from '../../world/schema';

type CommandExecutor = () => void;

export interface EditorCommand {
  id?: string;
  description: string;
  undo: CommandExecutor;
  redo: CommandExecutor;
  timestamp?: number;
}

export type CommandPreview = Pick<EditorCommand, 'id' | 'description' | 'timestamp'>;

export class CommandManager {
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];

  constructor(private readonly limit = 50) {}

  execute(command: EditorCommand): void {
    command.redo();
    this.pushUndo(command);
    this.redoStack = [];
  }

  undo(): EditorCommand | undefined {
    const command = this.undoStack.pop();
    if (!command) return undefined;
    command.undo();
    this.redoStack.push(command);
    return command;
  }

  redo(): EditorCommand | undefined {
    const command = this.redoStack.pop();
    if (!command) return undefined;
    command.redo();
    this.pushUndo(command);
    return command;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getUndoStack(): EditorCommand[] {
    return [...this.undoStack];
  }

  getRedoStack(): EditorCommand[] {
    return [...this.redoStack];
  }

  getPreviewStacks(): { undoStack: CommandPreview[]; redoStack: CommandPreview[] } {
    return {
      undoStack: this.undoStack.map(toPreview),
      redoStack: this.redoStack.map(toPreview),
    };
  }

  private pushUndo(command: EditorCommand) {
    this.undoStack.push(command);
    while (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
  }
}

const toPreview = (command: EditorCommand): CommandPreview => ({
  id: command.id,
  description: command.description,
  timestamp: command.timestamp ?? Date.now(),
});

const cloneTransform = (transform?: Transform): Transform | undefined => {
  if (!transform) return undefined;
  return {
    position: transform.position ? { ...transform.position } : undefined,
    rotation: transform.rotation ? { ...transform.rotation } : undefined,
    scale: transform.scale ? { ...transform.scale } : undefined,
  };
};

type LocatedNode = { node: SceneNode; parentId?: string; siblings: SceneNode[]; index: number };

const locateNode = (nodes: SceneNode[], targetId: string, parentId?: string): LocatedNode | undefined => {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node.id === targetId) {
      return { node, parentId, siblings: nodes, index: i };
    }
    if (node.children) {
      const child = locateNode(node.children, targetId, node.id);
      if (child) return child;
    }
  }
  return undefined;
};

const removeNode = (nodes: SceneNode[], targetId: string): LocatedNode | undefined => {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node.id === targetId) {
      const [removed] = nodes.splice(i, 1);
      return { node: removed, siblings: nodes, index: i };
    }
    if (node.children) {
      const removedChild = removeNode(node.children, targetId);
      if (removedChild) return removedChild;
    }
  }
  return undefined;
};

const ensureParentChildren = (nodes: SceneNode[], parentId?: string): SceneNode[] => {
  if (!parentId) return nodes;
  const parent = locateNode(nodes, parentId)?.node;
  if (!parent) {
    throw new Error(`Parent node '${parentId}' not found`);
  }
  if (!parent.children) {
    parent.children = [];
  }
  return parent.children;
};

const isDescendant = (nodes: SceneNode[], ancestorId: string, candidateId?: string): boolean => {
  if (!candidateId) return false;
  const target = locateNode(nodes, candidateId)?.node;
  if (!target || !target.children) return false;

  const stack = [...target.children];
  while (stack.length) {
    const current = stack.pop()!;
    if (current.id === ancestorId) return true;
    if (current.children) {
      stack.push(...current.children);
    }
  }
  return false;
};

export function createGizmoMoveCommand(
  world: WorldDocument,
  nodeId: string,
  nextTransform: Transform,
  description = 'Move gizmo'
): EditorCommand {
  const located = locateNode(world.nodes, nodeId);
  if (!located) {
    throw new Error(`Node '${nodeId}' not found`);
  }
  const previous = cloneTransform(located.node.transform);
  const next = cloneTransform(nextTransform);

  const applyTransform = (transform?: Transform) => {
    const node = locateNode(world.nodes, nodeId)?.node;
    if (!node) return;
    node.transform = transform ? cloneTransform(transform) : undefined;
  };

  return {
    id: `transform:${nodeId}`,
    description,
    timestamp: Date.now(),
    redo: () => applyTransform(next),
    undo: () => applyTransform(previous),
  };
}

export function createPropertyEditCommand<T extends Record<string, any>, K extends keyof T>(
  target: T,
  key: K,
  nextValue: T[K],
  description = `Edit ${String(key)}`
): EditorCommand {
  const previousValue = target[key];
  return {
    id: `property:${String(key)}`,
    description,
    timestamp: Date.now(),
    redo: () => {
      target[key] = nextValue;
    },
    undo: () => {
      target[key] = previousValue;
    },
  };
}

export interface HierarchyChangeOptions {
  newParentId?: string;
  newIndex?: number;
  description?: string;
}

export function createHierarchyMoveCommand(
  world: WorldDocument,
  nodeId: string,
  options: HierarchyChangeOptions = {}
): EditorCommand {
  if (isDescendant(world.nodes, nodeId, options.newParentId)) {
    throw new Error('Cannot move a node into its own descendant');
  }

  const located = locateNode(world.nodes, nodeId);
  if (!located) {
    throw new Error(`Node '${nodeId}' not found`);
  }

  const { parentId: previousParentId, index: previousIndex } = located;
  const previousParentLabel = previousParentId ?? 'root';
  const targetParentId = options.newParentId;
  const targetIndex = options.newIndex;

  const moveNode = (parentId: string | undefined, index: number | undefined) => {
    const removed = removeNode(world.nodes, nodeId);
    if (!removed) return;
    const siblings = ensureParentChildren(world.nodes, parentId);
    const insertionIndex = Math.min(Math.max(index ?? siblings.length, 0), siblings.length);
    siblings.splice(insertionIndex, 0, removed.node);
  };

  return {
    id: `hierarchy:${nodeId}`,
    description:
      options.description ??
      `Move ${nodeId} from ${previousParentLabel} to ${targetParentId ?? 'root'}${
        targetIndex !== undefined ? `#${targetIndex}` : ''
      }`,
    timestamp: Date.now(),
    redo: () => moveNode(targetParentId, targetIndex),
    undo: () => moveNode(previousParentId, previousIndex),
  };
}

export function createComponentEditCommand(
  component: Record<string, unknown>,
  patch: Record<string, unknown>,
  description = 'Edit component'
): EditorCommand {
  const previous = { ...component };
  const next = { ...component, ...patch };

  const apply = (state: Record<string, unknown>) => {
    Object.keys(component).forEach((key) => delete component[key]);
    Object.entries(state).forEach(([key, value]) => {
      component[key] = value;
    });
  };

  return {
    id: 'component:edit',
    description,
    timestamp: Date.now(),
    redo: () => apply(next),
    undo: () => apply(previous),
  };
}
