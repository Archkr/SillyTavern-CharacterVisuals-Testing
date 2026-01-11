import { describe, expect, it, vi } from 'vitest';
import { AssetRegistry } from '../../src/assets/registry';
import { AssetDefinition, AssetImporter, ImportResult } from '../../src/assets/types';

class FakeImporter implements AssetImporter {
  public readonly loadCalls: AssetDefinition[] = [];
  constructor(public readonly type: AssetDefinition['type'], private readonly payload: unknown = {}) {}

  async load(definition: AssetDefinition): Promise<ImportResult> {
    this.loadCalls.push(definition);
    return {
      id: definition.id,
      uri: definition.uri,
      type: definition.type,
      payload: this.payload,
    };
  }
}

describe('AssetRegistry', () => {
  it('caches imports and tracks reference counts', async () => {
    const importer = new FakeImporter('gltf');
    const registry = new AssetRegistry({ gltf: importer } as Record<'gltf', AssetImporter>);
    const asset: AssetDefinition = { id: 'tree', uri: '/tree.glb', type: 'gltf' };
    registry.register(asset);

    const first = await registry.acquire(asset.id);
    const second = await registry.acquire(asset.id);

    expect(first).toBe(second);
    expect(importer.loadCalls).toHaveLength(1);
    expect(registry.getRefCount(asset.id)).toBe(2);

    registry.release(asset.id);
    expect(registry.getRefCount(asset.id)).toBe(1);

    registry.release(asset.id);
    expect(registry.getRefCount(asset.id)).toBe(0);

    registry.evictUnused();
    expect(registry.isRegistered(asset.id)).toBe(false);
  });

  it('fails when importer for an asset type is missing', async () => {
    const importer = new FakeImporter('gltf');
    const registry = new AssetRegistry({ gltf: importer } as Record<'gltf', AssetImporter>);
    const asset: AssetDefinition = { id: 'sound', uri: '/sound.ogg', type: 'audio' };
    registry.register(asset);

    await expect(registry.acquire(asset.id)).rejects.toThrow("No importer registered for asset type 'audio'");
  });

  it('throws when releasing more times than acquired', () => {
    const importer = new FakeImporter('gltf');
    const registry = new AssetRegistry({ gltf: importer } as Record<'gltf', AssetImporter>);
    const asset: AssetDefinition = { id: 'over-release', uri: '/file.glb', type: 'gltf' };
    registry.register(asset);

    expect(() => registry.release(asset.id)).toThrow(/no active references/);
  });

  it('restores importer availability after a failed import attempt', async () => {
    const failingImporter: AssetImporter = {
      type: 'gltf',
      load: vi.fn(async () => {
        throw new Error('decode failed');
      }),
    };
    const registry = new AssetRegistry({ gltf: failingImporter } as Record<'gltf', AssetImporter>);
    const asset: AssetDefinition = { id: 'broken', uri: '/broken.glb', type: 'gltf' };
    registry.register(asset);

    await expect(registry.acquire(asset.id)).rejects.toThrow('decode failed');
    await expect(registry.acquire(asset.id)).rejects.toThrow('decode failed');
    expect(failingImporter.load).toHaveBeenCalledTimes(2);
    expect(registry.getRefCount(asset.id)).toBe(0);
  });
});
