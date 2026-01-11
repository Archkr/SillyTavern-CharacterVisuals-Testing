export type Vector3 = { x: number; y: number; z: number };

export type Quaternion = { x: number; y: number; z: number; w: number };

export interface Transform {
  position?: Vector3;
  rotation?: Quaternion;
  scale?: Vector3;
}

export type AssetType = 'gltf' | 'texture' | 'audio' | 'unknown';

export interface AssetReference {
  id: string;
  uri: string;
  type: AssetType;
  meta?: Record<string, unknown>;
}

export interface NodeAssetReference {
  assetId: string;
  options?: Record<string, unknown>;
}

export interface Component {
  type: string;
  data?: Record<string, unknown>;
}

export interface SceneNode {
  id: string;
  name?: string;
  transform?: Transform;
  components?: Component[];
  children?: SceneNode[];
  asset?: NodeAssetReference;
  tags?: string[];
}

export interface WorldDocument {
  version: number;
  metadata?: Record<string, unknown>;
  assets?: AssetReference[];
  nodes: SceneNode[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function validateVector3(value: unknown, path: string): string[] {
  if (!isObject(value)) {
    return [`${path} must be an object with x, y, and z numbers`];
  }

  const errors: string[] = [];
  (['x', 'y', 'z'] as const).forEach((key) => {
    if (!isFiniteNumber((value as Record<string, unknown>)[key])) {
      errors.push(`${path}.${key} must be a finite number`);
    }
  });
  return errors;
}

export function validateQuaternion(value: unknown, path: string): string[] {
  if (!isObject(value)) {
    return [`${path} must be an object with x, y, z, and w numbers`];
  }

  const errors: string[] = [];
  (['x', 'y', 'z', 'w'] as const).forEach((key) => {
    if (!isFiniteNumber((value as Record<string, unknown>)[key])) {
      errors.push(`${path}.${key} must be a finite number`);
    }
  });
  return errors;
}

export function validateTransform(value: unknown, path: string): string[] {
  if (!isObject(value)) {
    return [`${path} must be an object`];
  }

  let errors: string[] = [];
  if ('position' in value) {
    errors = errors.concat(validateVector3((value as Transform).position, `${path}.position`));
  }
  if ('rotation' in value) {
    errors = errors.concat(validateQuaternion((value as Transform).rotation, `${path}.rotation`));
  }
  if ('scale' in value) {
    errors = errors.concat(validateVector3((value as Transform).scale, `${path}.scale`));
  }
  return errors;
}

function validateComponent(component: unknown, path: string): string[] {
  if (!isObject(component)) {
    return [`${path} must be an object`];
  }

  const errors: string[] = [];
  if (typeof component.type !== 'string' || component.type.trim().length === 0) {
    errors.push(`${path}.type must be a non-empty string`);
  }

  if ('data' in component && !isObject(component.data)) {
    errors.push(`${path}.data must be an object when present`);
  }

  return errors;
}

function validateNodeAssetReference(assetRef: unknown, path: string, assets?: AssetReference[]): string[] {
  if (!isObject(assetRef)) {
    return [`${path} must be an object`];
  }

  const errors: string[] = [];
  if (typeof assetRef.assetId !== 'string' || assetRef.assetId.trim().length === 0) {
    errors.push(`${path}.assetId must be a non-empty string`);
  } else if (assets && !assets.find((asset) => asset.id === assetRef.assetId)) {
    errors.push(`${path}.assetId references missing asset '${assetRef.assetId}'`);
  }

  if ('options' in assetRef && !isObject(assetRef.options)) {
    errors.push(`${path}.options must be an object when present`);
  }
  return errors;
}

function validateSceneNode(node: unknown, path: string, context: { assets?: AssetReference[]; seenIds: Set<string> }): string[] {
  if (!isObject(node)) {
    return [`${path} must be an object`];
  }

  const errors: string[] = [];
  if (typeof node.id !== 'string' || node.id.trim().length === 0) {
    errors.push(`${path}.id must be a non-empty string`);
  } else if (context.seenIds.has(node.id)) {
    errors.push(`${path}.id '${node.id}' must be unique`);
  } else {
    context.seenIds.add(node.id);
  }

  if ('name' in node && typeof node.name !== 'string') {
    errors.push(`${path}.name must be a string when present`);
  }

  if ('tags' in node) {
    if (!Array.isArray(node.tags) || node.tags.some((tag) => typeof tag !== 'string')) {
      errors.push(`${path}.tags must be an array of strings when present`);
    }
  }

  if ('transform' in node) {
    errors.push(...validateTransform((node as SceneNode).transform, `${path}.transform`));
  }

  if ('components' in node) {
    if (!Array.isArray(node.components)) {
      errors.push(`${path}.components must be an array when present`);
    } else {
      node.components.forEach((component, index) => {
        errors.push(...validateComponent(component, `${path}.components[${index}]`));
      });
    }
  }

  if ('asset' in node) {
    errors.push(...validateNodeAssetReference((node as SceneNode).asset, `${path}.asset`, context.assets));
  }

  if ('children' in node) {
    if (!Array.isArray(node.children)) {
      errors.push(`${path}.children must be an array when present`);
    } else {
      node.children.forEach((child, index) => {
        errors.push(...validateSceneNode(child, `${path}.children[${index}]`, context));
      });
    }
  }

  return errors;
}

function validateAssets(assets: unknown, path: string): { errors: string[]; assetList?: AssetReference[] } {
  if (assets === undefined) {
    return { errors: [] };
  }

  if (!Array.isArray(assets)) {
    return { errors: [`${path} must be an array when present`] };
  }

  const errors: string[] = [];
  const ids = new Set<string>();
  assets.forEach((asset, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isObject(asset)) {
      errors.push(`${entryPath} must be an object`);
      return;
    }
    if (typeof asset.id !== 'string' || asset.id.trim().length === 0) {
      errors.push(`${entryPath}.id must be a non-empty string`);
    } else if (ids.has(asset.id)) {
      errors.push(`${entryPath}.id '${asset.id}' must be unique`);
    } else {
      ids.add(asset.id);
    }

    if (typeof asset.uri !== 'string' || asset.uri.trim().length === 0) {
      errors.push(`${entryPath}.uri must be a non-empty string`);
    }

    if (asset.type !== 'gltf' && asset.type !== 'texture' && asset.type !== 'audio' && asset.type !== 'unknown') {
      errors.push(`${entryPath}.type must be one of 'gltf', 'texture', 'audio', or 'unknown'`);
    }

    if ('meta' in asset && !isObject(asset.meta)) {
      errors.push(`${entryPath}.meta must be an object when present`);
    }
  });

  return { errors, assetList: assets as AssetReference[] };
}

export function validateWorldDocument(document: unknown): ValidationResult {
  if (!isObject(document)) {
    return { valid: false, errors: ['World must be an object'] };
  }

  const errors: string[] = [];
  if (!isFiniteNumber(document.version)) {
    errors.push('version must be a finite number');
  }

  if ('metadata' in document && !isObject(document.metadata)) {
    errors.push('metadata must be an object when present');
  }

  const { errors: assetErrors, assetList } = validateAssets(document.assets, 'assets');
  errors.push(...assetErrors);

  if (!Array.isArray(document.nodes)) {
    errors.push('nodes must be an array');
  } else {
    const seenIds = new Set<string>();
    document.nodes.forEach((node, index) => {
      errors.push(...validateSceneNode(node, `nodes[${index}]`, { assets: assetList, seenIds }));
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
