import React from 'react';
import { Component } from '../../world/schema';
import { ValidationIssue, groupIssuesByPath, validatePhysicsComponent } from '../validation';

type PhysicsData = {
  body?: 'static' | 'dynamic' | 'kinematic';
  mass?: number;
  friction?: number;
  restitution?: number;
  damping?: number;
};

type PhysicsEditorProps = {
  component: Component;
  onChange?: (component: Component) => void;
  warnings?: ValidationIssue[];
};

const presets: Record<string, PhysicsData> = {
  "Static Prop": { body: 'static', friction: 0.6, restitution: 0.1, damping: 0.9 },
  "Dynamic Object": { body: 'dynamic', mass: 1, friction: 0.5, restitution: 0.2, damping: 0.1 },
  "Bouncy Ball": { body: 'dynamic', mass: 0.5, friction: 0.2, restitution: 0.9, damping: 0.02 },
  "Heavy Anchor": { body: 'kinematic', mass: 20, friction: 0.8, restitution: 0.05, damping: 0.3 },
};

const FieldWarning: React.FC<{ issue?: ValidationIssue }> = ({ issue }) =>
  issue ? <div className="field-warning">⚠️ {issue.message}</div> : null;

export const PhysicsEditor: React.FC<PhysicsEditorProps> = ({ component, onChange, warnings }) => {
  const data = (component.data ?? {}) as PhysicsData;
  const issueMap = groupIssuesByPath(warnings ?? validatePhysicsComponent(component.data));

  const handleChange = (key: keyof PhysicsData, value: PhysicsData[keyof PhysicsData]) => {
    const next: Component = { ...component, data: { ...data, [key]: value } };
    onChange?.(next);
  };

  const applyPreset = (name: string) => {
    const preset = presets[name];
    if (!preset) return;
    onChange?.({ ...component, data: { ...preset } });
  };

  return (
    <div className="field-group component-card">
      <div className="component-header">
        <span className="field-label">Physics</span>
        <select className="preset-select" onChange={(event) => applyPreset(event.target.value)} defaultValue="">
          <option value="" disabled>
            Presets
          </option>
          {Object.keys(presets).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <label className="field">
        <span className="field-label">Body</span>
        <select value={data.body ?? ''} onChange={(event) => handleChange('body', event.target.value as PhysicsData['body'])}>
          <option value="">Choose body</option>
          <option value="static">Static</option>
          <option value="dynamic">Dynamic</option>
          <option value="kinematic">Kinematic</option>
        </select>
        <FieldWarning issue={issueMap.body?.[0]} />
      </label>
      <label className="field">
        <span className="field-label">Mass</span>
        <input
          type="number"
          min={0}
          step={0.1}
          value={data.mass ?? 0}
          onChange={(event) => handleChange('mass', Number(event.target.value))}
        />
        <FieldWarning issue={issueMap.mass?.[0]} />
      </label>
      <label className="field">
        <span className="field-label">Friction</span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={data.friction ?? 0}
          onChange={(event) => handleChange('friction', Number(event.target.value))}
        />
        <FieldWarning issue={issueMap.friction?.[0]} />
      </label>
      <label className="field">
        <span className="field-label">Restitution</span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={data.restitution ?? 0}
          onChange={(event) => handleChange('restitution', Number(event.target.value))}
        />
        <FieldWarning issue={issueMap.restitution?.[0]} />
      </label>
      <label className="field">
        <span className="field-label">Damping</span>
        <input
          type="number"
          min={0}
          step={0.01}
          value={data.damping ?? 0}
          onChange={(event) => handleChange('damping', Number(event.target.value))}
        />
        <FieldWarning issue={issueMap.damping?.[0]} />
      </label>
    </div>
  );
};

export default PhysicsEditor;
