import { Component, Transform } from '../world/schema';

export type ValidationIssue = { path: string; message: string };

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isHexColor = (value: unknown): boolean =>
  typeof value === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());

const ensureNumber = (value: unknown, path: string, options: { min?: number; max?: number } = {}): ValidationIssue[] => {
  if (!isFiniteNumber(value)) {
    return [{ path, message: `${path} must be a number` }];
  }

  const issues: ValidationIssue[] = [];
  if (options.min !== undefined && value < options.min) {
    issues.push({ path, message: `${path} must be at least ${options.min}` });
  }
  if (options.max !== undefined && value > options.max) {
    issues.push({ path, message: `${path} must be at most ${options.max}` });
  }
  return issues;
};

export function validateTransform(transform?: Transform): ValidationIssue[] {
  if (!transform) return [];

  const issues: ValidationIssue[] = [];
  (['x', 'y', 'z'] as const).forEach((axis) => {
    issues.push(...ensureNumber(transform.position?.[axis], `position.${axis}`));
    issues.push(...ensureNumber(transform.scale?.[axis], `scale.${axis}`));
  });
  (['x', 'y', 'z', 'w'] as const).forEach((axis) => {
    issues.push(...ensureNumber(transform.rotation?.[axis], `rotation.${axis}`));
  });
  return issues;
}

export function validateLightComponent(data?: Record<string, unknown>): ValidationIssue[] {
  if (!data) return [{ path: 'type', message: 'Light type is required' }];

  const issues: ValidationIssue[] = [];
  const supportedTypes = ['directional', 'point', 'spot'];
  if (!supportedTypes.includes(String(data.type))) {
    issues.push({ path: 'type', message: `Type must be one of ${supportedTypes.join(', ')}` });
  }

  if (data.color !== undefined && !isHexColor(data.color)) {
    issues.push({ path: 'color', message: 'Color must be a hex value like #ffffff' });
  }

  issues.push(...ensureNumber(data.intensity, 'intensity', { min: 0 }));
  if (data.range !== undefined) {
    issues.push(...ensureNumber(data.range, 'range', { min: 0 }));
  }

  return issues;
}

export function validatePhysicsComponent(data?: Record<string, unknown>): ValidationIssue[] {
  if (!data) return [{ path: 'body', message: 'Body type is required' }];

  const issues: ValidationIssue[] = [];
  const bodies = ['static', 'dynamic', 'kinematic'];
  if (!bodies.includes(String(data.body))) {
    issues.push({ path: 'body', message: `Body must be one of ${bodies.join(', ')}` });
  }

  issues.push(...ensureNumber(data.mass, 'mass', { min: 0 }));
  issues.push(...ensureNumber(data.friction, 'friction', { min: 0, max: 1 }));
  issues.push(...ensureNumber(data.restitution, 'restitution', { min: 0, max: 1 }));
  if (data.damping !== undefined) {
    issues.push(...ensureNumber(data.damping, 'damping', { min: 0 }));
  }

  return issues;
}

export function validateScriptComponent(data?: Record<string, unknown>): ValidationIssue[] {
  if (!data) return [{ path: 'path', message: 'Script path is required' }];

  const issues: ValidationIssue[] = [];
  if (typeof data.path !== 'string' || data.path.trim().length === 0) {
    issues.push({ path: 'path', message: 'Script path must be a non-empty string' });
  }

  if (data.parameters !== undefined && typeof data.parameters !== 'object') {
    issues.push({ path: 'parameters', message: 'Parameters should be an object' });
  }

  return issues;
}

export function validateComponent(component: Component): ValidationIssue[] {
  switch (component.type) {
    case 'light':
      return validateLightComponent(component.data);
    case 'physics':
      return validatePhysicsComponent(component.data);
    case 'script':
      return validateScriptComponent(component.data);
    default:
      return [];
  }
}

export function groupIssuesByPath(issues: ValidationIssue[]): Record<string, ValidationIssue[]> {
  return issues.reduce<Record<string, ValidationIssue[]>>((acc, issue) => {
    acc[issue.path] = acc[issue.path] ? [...acc[issue.path], issue] : [issue];
    return acc;
  }, {});
}
