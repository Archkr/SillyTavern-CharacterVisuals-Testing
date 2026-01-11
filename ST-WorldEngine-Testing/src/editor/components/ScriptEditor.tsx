import React, { useMemo, useState } from 'react';
import { Component } from '../../world/schema';
import { ValidationIssue, groupIssuesByPath, validateScriptComponent } from '../validation';

type ScriptData = {
  path?: string;
  parameters?: Record<string, unknown>;
  enabled?: boolean;
};

type ScriptEditorProps = {
  component: Component;
  onChange?: (component: Component) => void;
  warnings?: ValidationIssue[];
};

const FieldWarning: React.FC<{ issue?: ValidationIssue }> = ({ issue }) =>
  issue ? <div className="field-warning">⚠️ {issue.message}</div> : null;

export const ScriptEditor: React.FC<ScriptEditorProps> = ({ component, onChange, warnings }) => {
  const data = (component.data ?? {}) as ScriptData;
  const issueMap = groupIssuesByPath(warnings ?? validateScriptComponent(component.data));
  const [parametersText, setParametersText] = useState(() =>
    data.parameters ? JSON.stringify(data.parameters, null, 2) : ''
  );

  const parsedParameters = useMemo(() => {
    if (!parametersText.trim()) return undefined;
    try {
      return JSON.parse(parametersText);
    } catch {
      return parametersText;
    }
  }, [parametersText]);

  const handleChange = (key: keyof ScriptData, value: ScriptData[keyof ScriptData]) => {
    const next: Component = { ...component, data: { ...data, [key]: value } };
    onChange?.(next);
  };

  return (
    <div className="field-group component-card">
      <div className="component-header">
        <span className="field-label">Script</span>
        <span className="inline-tag">{data.enabled === false ? 'Disabled' : 'Enabled'}</span>
      </div>
      <label className="field">
        <span className="field-label">Path</span>
        <input type="text" value={data.path ?? ''} onChange={(event) => handleChange('path', event.target.value)} />
        <FieldWarning issue={issueMap.path?.[0]} />
      </label>
      <label className="field checkbox-field">
        <div className="checkbox-row">
          <input
            type="checkbox"
            checked={data.enabled !== false}
            onChange={(event) => handleChange('enabled', event.target.checked)}
          />
          <span>Enabled</span>
        </div>
      </label>
      <label className="field">
        <span className="field-label">Parameters (JSON)</span>
        <textarea
          value={parametersText}
          rows={4}
          onChange={(event) => {
            const { value } = event.target;
            setParametersText(value);
            if (!value.trim()) {
              handleChange('parameters', undefined);
              return;
            }

            try {
              const parsed = JSON.parse(value);
              handleChange('parameters', parsed);
            } catch {
              handleChange('parameters', value as unknown as Record<string, unknown>);
            }
          }}
        />
        {typeof parsedParameters === 'string' && <FieldWarning issue={{ path: 'parameters', message: 'Invalid JSON' }} />}
        <FieldWarning issue={issueMap.parameters?.[0]} />
      </label>
    </div>
  );
};

export default ScriptEditor;
