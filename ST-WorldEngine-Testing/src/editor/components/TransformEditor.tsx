import React from 'react';
import { Transform } from '../../world/schema';
import { ValidationIssue, groupIssuesByPath, validateTransform } from '../validation';

type TransformEditorProps = {
  value?: Transform;
  onChange?: (transform: Transform) => void;
  warnings?: ValidationIssue[];
};

const defaultTransform: Transform = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
};

const coalesceTransform = (transform?: Transform): Transform => ({
  position: { ...defaultTransform.position, ...(transform?.position ?? {}) },
  rotation: { ...defaultTransform.rotation, ...(transform?.rotation ?? {}) },
  scale: { ...defaultTransform.scale, ...(transform?.scale ?? {}) },
});

const useWarnings = (issues?: ValidationIssue[]) => groupIssuesByPath(issues ?? []);

const FieldWarning: React.FC<{ issue?: ValidationIssue }> = ({ issue }) =>
  issue ? <div className="field-warning">⚠️ {issue.message}</div> : null;

export const TransformEditor: React.FC<TransformEditorProps> = ({ value, onChange, warnings }) => {
  const normalized = coalesceTransform(value);
  const issueMap = useWarnings(warnings ?? validateTransform(value));

  const handleChange = (section: keyof Transform, key: string, nextValue: number) => {
    const updated = coalesceTransform({ ...normalized, [section]: { ...(normalized as never)[section], [key]: nextValue } });
    onChange?.(updated);
  };

  return (
    <div className="field-group">
      <span className="field-label">Transform</span>
      <div className="field-grid">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <label className="field" key={`pos-${axis}`}>
            <span className="field-label">Pos {axis.toUpperCase()}</span>
            <input
              type="number"
              value={normalized.position?.[axis] ?? 0}
              onChange={(event) => handleChange('position', axis, Number(event.target.value))}
            />
            <FieldWarning issue={issueMap[`position.${axis}`]?.[0]} />
          </label>
        ))}
      </div>
      <div className="field-grid">
        {(['x', 'y', 'z', 'w'] as const).map((axis) => (
          <label className="field" key={`rot-${axis}`}>
            <span className="field-label">Rot {axis.toUpperCase()}</span>
            <input
              type="number"
              value={normalized.rotation?.[axis] ?? 0}
              onChange={(event) => handleChange('rotation', axis, Number(event.target.value))}
            />
            <FieldWarning issue={issueMap[`rotation.${axis}`]?.[0]} />
          </label>
        ))}
      </div>
      <div className="field-grid">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <label className="field" key={`scale-${axis}`}>
            <span className="field-label">Scale {axis.toUpperCase()}</span>
            <input
              type="number"
              value={normalized.scale?.[axis] ?? 1}
              onChange={(event) => handleChange('scale', axis, Number(event.target.value))}
            />
            <FieldWarning issue={issueMap[`scale.${axis}`]?.[0]} />
          </label>
        ))}
      </div>
    </div>
  );
};

export default TransformEditor;
