import { createHash } from 'crypto';
import { serializeWorld } from './io';
import { AssetReference, SceneNode, WorldDocument, validateWorldDocument } from './schema';

export interface WorldPackage {
  /**
   * Serialized world JSON that has been validated against the current schema version.
   */
  world: string;
  /**
   * Assets that are actually referenced by nodes in the scene graph.
   */
  referencedAssets: AssetReference[];
  /**
   * Deterministic hash of the serialized world payload.
   */
  hash: string;
}

const collectAssetIdsFromNodes = (nodes: SceneNode[]): Set<string> => {
  const ids = new Set<string>();
  const stack = [...nodes];

  while (stack.length) {
    const node = stack.pop()!;
    if (node.asset?.assetId) {
      ids.add(node.asset.assetId);
    }
    if (node.children) {
      stack.push(...node.children);
    }
  }

  return ids;
};

export function collectReferencedAssets(world: WorldDocument): AssetReference[] {
  const referencedIds = collectAssetIdsFromNodes(world.nodes ?? []);
  if (referencedIds.size === 0 || !world.assets || world.assets.length === 0) {
    return [];
  }

  const assetsById = new Map(world.assets.map((asset) => [asset.id, asset]));
  const missing: string[] = [];
  const referenced: AssetReference[] = [];

  referencedIds.forEach((id) => {
    const asset = assetsById.get(id);
    if (!asset) {
      missing.push(id);
      return;
    }
    referenced.push(asset);
  });

  if (missing.length > 0) {
    throw new Error(`Missing asset definitions for: ${missing.join(', ')}`);
  }

  return referenced;
}

const hashPayload = (payload: string): string => createHash('sha256').update(payload).digest('hex');

export function packageWorld(world: WorldDocument): WorldPackage {
  const validation = validateWorldDocument(world);
  if (!validation.valid) {
    throw new Error(`World document is invalid: ${validation.errors.join('; ')}`);
  }

  const referencedAssets = collectReferencedAssets(world);
  const serialized = serializeWorld(world);
  const hash = hashPayload(serialized);

  return {
    world: serialized,
    referencedAssets,
    hash,
  };
}
