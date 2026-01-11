import React from 'react';
import { Component, SceneNode, Transform } from '../../world/schema';
import { LightEditor } from '../components/LightEditor';
import { PhysicsEditor } from '../components/PhysicsEditor';
import { ScriptEditor } from '../components/ScriptEditor';
import { TransformEditor } from '../components/TransformEditor';
import { validateComponent, validateTransform } from '../validation';

export type InspectorPanelProps = {
  node?: SceneNode;
  onRename?: (id: string, name: string) => void;
  onTransformChange?: (transform: Transform) => void;
  onComponentsChange?: (id: string, components: Component[]) => void;
};

const formatVector = (value?: { x?: number; y?: number; z?: number }) =>
  `${value?.x ?? 0}, ${value?.y ?? 0}, ${value?.z ?? 0}`;

export const InspectorPanel: React.FC<InspectorPanelProps> = ({ node, onRename, onTransformChange }) => {
  if (!node) {
    return (
      <section className="editor-panel inspector-panel empty">
        <header className="panel-header">
          <div className="panel-title">Inspector</div>
        </header>
        <div className="panel-body">Select a node to see its properties.</div>
      </section>
    );
  }

  const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onRename?.(node.id, event.target.value);
  };

  const handleComponentChange = (index: number, component: Component) => {
    const components = [...(node.components ?? [])];
    components[index] = component;
    onComponentsChange?.(node.id, components);
  };

  const renderComponent = (component: Component, index: number) => {
    const warnings = validateComponent(component);
    switch (component.type) {
      case 'light':
        return (
          <LightEditor
            key={index}
            component={component}
            warnings={warnings}
            onChange={(updated) => handleComponentChange(index, updated)}
          />
        );
      case 'physics':
        return (
          <PhysicsEditor
            key={index}
            component={component}
            warnings={warnings}
            onChange={(updated) => handleComponentChange(index, updated)}
          />
        );
      case 'script':
        return (
          <ScriptEditor
            key={index}
            component={component}
            warnings={warnings}
            onChange={(updated) => handleComponentChange(index, updated)}
          />
        );
      default:
        return (
          <div key={index} className="field-group component-card">
            <div className="component-header">
              <span className="field-label">{component.type}</span>
              <span className="inline-tag">Custom</span>
            </div>
            <div className="field">No editor available for this component.</div>
          </div>
        );
    }
  };

  return (
    <section className="editor-panel inspector-panel">
      <header className="panel-header">
        <div className="panel-title">Inspector</div>
        <div className="panel-subtitle">{node.name ?? node.id}</div>
      </header>
      <div className="panel-body inspector-fields">
        <label className="field">
          <span className="field-label">Name</span>
          <input type="text" defaultValue={node.name ?? ''} onChange={handleNameChange} />
        </label>
        <TransformEditor
          value={node.transform}
          onChange={(transform) => onTransformChange?.(transform)}
          warnings={validateTransform(node.transform)}
        />
        {(node.components ?? []).map((component, index) => renderComponent(component, index))}
        <div className="metadata">
          <div className="metadata-row">
            <span>ID</span>
            <code>{node.id}</code>
          </div>
          <div className="metadata-row">
            <span>Rotation</span>
            <code>{formatVector(node.transform?.rotation)}</code>
          </div>
          <div className="metadata-row">
            <span>Scale</span>
            <code>{formatVector(node.transform?.scale)}</code>
          </div>
          <div className="metadata-row">
            <span>Tags</span>
            <code>{node.tags?.join(', ') ?? '—'}</code>
          </div>
        </div>
      </div>
    </section>
  );
};

export default InspectorPanel;
