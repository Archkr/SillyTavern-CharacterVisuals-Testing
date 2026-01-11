import React, { useMemo, useState } from 'react';
import { SceneNode } from '../../world/schema';
import { SelectionManager } from '../state/selection';

type HierarchyPanelProps = {
  nodes: SceneNode[];
  selection: SelectionManager;
  onSelectionChange?: (ids: string[]) => void;
  onFocusRequest?: (id: string) => void;
};

const flatten = (nodes: SceneNode[]): string[] =>
  nodes.flatMap((node) => [node.id, ...(node.children ? flatten(node.children) : [])]);

export const HierarchyPanel: React.FC<HierarchyPanelProps> = ({
  nodes,
  selection,
  onSelectionChange,
  onFocusRequest,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(flatten(nodes)));
  const orderedIds = useMemo(() => flatten(nodes), [nodes]);

  const toggleExpanded = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const handleSelect = (id: string, additive: boolean) => {
    selection.select(id, { additive, focus: true });
    onSelectionChange?.(selection.getSelection());
  };

  const handleFocus = (id: string) => {
    selection.focus(id);
    onFocusRequest?.(id);
    onSelectionChange?.(selection.getSelection());
  };

  const handleKeyboardFocus = (direction: 1 | -1) => {
    selection.focusNext(orderedIds, direction);
    const focused = selection.getFocused();
    if (focused) {
      onFocusRequest?.(focused);
      onSelectionChange?.(selection.getSelection());
    }
  };

  return (
    <section className="editor-panel hierarchy-panel">
      <header className="panel-header">
        <div className="panel-title">Hierarchy</div>
        <div className="panel-actions">
          <button className="ghost" onClick={() => handleKeyboardFocus(-1)} title="Focus previous (Alt+Up)">
            ↑
          </button>
          <button className="ghost" onClick={() => handleKeyboardFocus(1)} title="Focus next (Alt+Down)">
            ↓
          </button>
        </div>
      </header>
      <div className="panel-body hierarchy-list" role="tree" aria-label="Scene hierarchy">
        {nodes.map((node) => (
          <HierarchyNode
            key={node.id}
            node={node}
            depth={0}
            expanded={expanded}
            selection={selection}
            onSelect={handleSelect}
            onFocus={handleFocus}
            toggleExpanded={toggleExpanded}
          />
        ))}
      </div>
    </section>
  );
};

type NodeProps = {
  node: SceneNode;
  depth: number;
  expanded: Set<string>;
  selection: SelectionManager;
  toggleExpanded: (id: string) => void;
  onSelect: (id: string, additive: boolean) => void;
  onFocus: (id: string) => void;
};

const HierarchyNode: React.FC<NodeProps> = ({
  node,
  depth,
  expanded,
  selection,
  toggleExpanded,
  onSelect,
  onFocus,
}) => {
  const hasChildren = Boolean(node.children?.length);
  const isExpanded = expanded.has(node.id);
  const selected = selection.isSelected(node.id);
  const focused = selection.isFocused(node.id);
  return (
    <div
      className={`hierarchy-node${selected ? ' is-selected' : ''}${focused ? ' is-focused' : ''}`}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      tabIndex={focused ? 0 : -1}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onSelect(node.id, event.metaKey || event.ctrlKey || event.shiftKey);
        }
        if (event.key === ' ') {
          onFocus(node.id);
        }
      }}
    >
      <div className="hierarchy-node__content" style={{ paddingLeft: depth * 12 }}>
        {hasChildren ? (
          <button className="ghost toggle" onClick={() => toggleExpanded(node.id)} aria-label="Toggle children">
            {isExpanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="ghost toggle placeholder" />
        )}
        <button
          className="ghost label"
          onClick={(event) => onSelect(node.id, event.metaKey || event.ctrlKey || event.shiftKey)}
          onDoubleClick={() => onFocus(node.id)}
        >
          <span className="node-name">{node.name ?? node.id}</span>
        </button>
        <div className="node-tags" aria-hidden>{node.tags?.join(', ')}</div>
      </div>
      {hasChildren && isExpanded && (
        <div className="hierarchy-children" role="group">
          {node.children!.map((child) => (
            <HierarchyNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selection={selection}
              toggleExpanded={toggleExpanded}
              onSelect={onSelect}
              onFocus={onFocus}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default HierarchyPanel;
