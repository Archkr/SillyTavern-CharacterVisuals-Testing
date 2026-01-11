import React from 'react';
import { Component } from '../../world/schema';
import { ValidationIssue, groupIssuesByPath, validateLightComponent } from '../validation';

type LightData = {
  type?: 'directional' | 'point' | 'spot';
  color?: string;
  intensity?: number;
  range?: number;
  castShadows?: boolean;
};

type LightEditorProps = {
  component: Component;
  onChange?: (component: Component) => void;
  warnings?: ValidationIssue[];
};

const presets: Record<string, LightData> = {
  'Studio Key': { type: 'directional', color: '#ffe0c2', intensity: 1.2 },
  'Soft Fill': { type: 'point', color: '#c2d9ff', intensity: 0.4, range: 12 },
  'Crisp Spot': { type: 'spot', color: '#ffffff', intensity: 2.2, range: 18, castShadows: true },
};

const FieldWarning: React.FC<{ issue?: ValidationIssue }> = ({ issue }) =>
  issue ? <div className="field-warning">⚠️ {issue.message}</div> : null;

export const LightEditor: React.FC<LightEditorProps> = ({ component, onChange, warnings }) => {
  const data = (component.data ?? {}) as LightData;
  const issueMap = groupIssuesByPath(warnings ?? validateLightComponent(component.data));

  const handleChange = (key: keyof LightData, value: LightData[keyof LightData]) => {
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
        <span className="field-label">Light</span>
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
        <span className="field-label">Type</span>
        <select value={data.type ?? ''} onChange={(event) => handleChange('type', event.target.value as LightData['type'])}>
          <option value="">Choose type</option>
          <option value="directional">Directional</option>
          <option value="point">Point</option>
          <option value="spot">Spot</option>
        </select>
        <FieldWarning issue={issueMap.type?.[0]} />
      </label>
      <label className="field">
        <span className="field-label">Color</span>
        <input type="text" value={data.color ?? ''} onChange={(event) => handleChange('color', event.target.value)} />
        <FieldWarning issue={issueMap.color?.[0]} />
      </label>
      <label className="field">
        <span className="field-label">Intensity</span>
        <input
          type="number"
          value={data.intensity ?? 0}
          min={0}
          step={0.1}
          onChange={(event) => handleChange('intensity', Number(event.target.value))}
        />
        <FieldWarning issue={issueMap.intensity?.[0]} />
      </label>
      <label className="field">
        <span className="field-label">Range</span>
        <input
          type="number"
          value={data.range ?? 0}
          min={0}
          step={0.1}
          onChange={(event) => handleChange('range', Number(event.target.value))}
        />
        <FieldWarning issue={issueMap.range?.[0]} />
      </label>
      <label className="field checkbox-field">
        <div className="checkbox-row">
          <input
            type="checkbox"
            checked={Boolean(data.castShadows)}
            onChange={(event) => handleChange('castShadows', event.target.checked)}
          />
          <span>Cast shadows</span>
        </div>
      </label>
    </div>
  );
};

export default LightEditor;
