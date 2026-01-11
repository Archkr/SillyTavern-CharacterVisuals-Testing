import { describe, expect, it } from 'vitest';
import { CURRENT_WORLD_SCHEMA_VERSION } from '../src/world/io';
import { collectReferencedAssets, packageWorld, WorldPackage } from '../src/world/export';
import { importWorldPackage } from '../src/world/import';
import { WorldDocument } from '../src/world/schema';
import { createHash } from 'crypto';

const demoWorld: WorldDocument = {
  version: CURRENT_WORLD_SCHEMA_VERSION,
  metadata: { title: 'Demo' },
  assets: [
    { id: 'tree', uri: '/assets/tree.glb', type: 'gltf' },
    { id: 'music', uri: '/assets/forest.ogg', type: 'audio' },
    { id: 'unused', uri: '/assets/unused.png', type: 'texture' },
  ],
  nodes: [
    {
      id: 'root',
      children: [
        { id: 'tree-instance', asset: { assetId: 'tree' } },
        { id: 'soundtrack', asset: { assetId: 'music' } },
      ],
    },
  ],
};

describe('world export pipeline', () => {
  it('collects referenced assets and hashes the serialized world', () => {
    const referenced = collectReferencedAssets(demoWorld);
    const pkg = packageWorld(demoWorld);

    expect(referenced.map((asset) => asset.id).sort()).toEqual(['music', 'tree']);
    expect(pkg.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(pkg.referencedAssets).toHaveLength(2);
    expect(() => JSON.parse(pkg.world)).not.toThrow();
  });

  it('throws when referenced assets are missing', () => {
    const invalidWorld: WorldDocument = {
      ...demoWorld,
      nodes: [{ id: 'broken', asset: { assetId: 'missing' } }],
    };

    expect(() => collectReferencedAssets(invalidWorld)).toThrow(/Missing asset definitions/);
  });
});

describe('world import pipeline', () => {
  it('round-trips package data without losing information', () => {
    const pkg = packageWorld(demoWorld);
    const imported = importWorldPackage(pkg);

    expect(imported.hash).toBe(pkg.hash);
    expect(imported.referencedAssets.map((asset) => asset.id).sort()).toEqual(['music', 'tree']);
    expect(imported.world.assets?.find((asset) => asset.id === 'unused')).toBeDefined();
    expect(imported.world.nodes[0].children?.length).toBe(2);
  });

  it('applies migrations and validates the document', () => {
    const legacyWorld = {
      version: 0,
      nodes: [{ id: 'legacy-root' }],
    };

    const migrations = {
      0: (input: any) => ({
        ...input,
        version: CURRENT_WORLD_SCHEMA_VERSION,
        metadata: { migrated: true },
      }),
    };

    const pkg: WorldPackage = {
      world: JSON.stringify(legacyWorld),
      referencedAssets: [],
      hash: createHash('sha256').update(JSON.stringify(legacyWorld)).digest('hex'),
    };

    const imported = importWorldPackage(pkg, { migrations, expectedHash: pkg.hash });

    expect(imported.world.version).toBe(CURRENT_WORLD_SCHEMA_VERSION);
    expect(imported.world.metadata?.migrated).toBe(true);
  });

  it('rejects tampered payloads when the expected hash does not match', () => {
    const pkg = packageWorld(demoWorld);
    const tampered = { ...pkg, world: pkg.world.replace('Demo', 'Tampered') };

    expect(() => importWorldPackage(tampered, { expectedHash: pkg.hash })).toThrow(/hash mismatch/);
  });
});
