import { describe, expect, it } from 'vitest';
import { deserializeWorld, serializeWorld, CURRENT_WORLD_SCHEMA_VERSION } from '../src/world/io';
import { validateWorldDocument, WorldDocument } from '../src/world/schema';

const assetLibrary = [
  { id: 'tree', uri: '/assets/tree.glb', type: 'gltf' as const },
  { id: 'music', uri: '/assets/forest.ogg', type: 'audio' as const },
];

const validWorld: WorldDocument = {
  version: CURRENT_WORLD_SCHEMA_VERSION,
  metadata: { title: 'Test forest', author: 'QA' },
  assets: assetLibrary,
  nodes: [
    {
      id: 'root',
      name: 'Root',
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
      components: [
        { type: 'zone', data: { bounds: [5, 5, 5] } },
      ],
      children: [
        {
          id: 'tree-1',
          asset: { assetId: 'tree', options: { variant: 'oak' } },
          tags: ['flora'],
        },
      ],
    },
  ],
};

describe('world schema validation', () => {
  it('accepts a valid document', () => {
    const result = validateWorldDocument(validWorld);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects duplicate node IDs', () => {
    const duplicateIdWorld: WorldDocument = {
      ...validWorld,
      nodes: [
        { id: 'shared', children: [] },
        { id: 'shared', children: [] },
      ],
    };

    const result = validateWorldDocument(duplicateIdWorld);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("nodes[1].id 'shared' must be unique");
  });

  it('rejects missing asset references', () => {
    const worldWithMissingAsset: WorldDocument = {
      ...validWorld,
      nodes: [
        {
          id: 'orphan',
          asset: { assetId: 'missing' },
        },
      ],
    };

    const result = validateWorldDocument(worldWithMissingAsset);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("nodes[0].asset.assetId references missing asset 'missing'");
  });
});

describe('world serialization', () => {
  it('serializes and deserializes a valid world', () => {
    const serialized = serializeWorld(validWorld);
    const parsed = JSON.parse(serialized);

    expect(parsed.version).toBe(CURRENT_WORLD_SCHEMA_VERSION);

    const roundTrip = deserializeWorld(serialized, {
      migrations: {
        [CURRENT_WORLD_SCHEMA_VERSION]: (input) => input,
      },
    });

    expect(roundTrip.nodes[0].id).toBe('root');
  });

  it('applies migrations in order', () => {
    const legacyWorld = {
      version: 0,
      nodes: [{ id: 'legacy-root' }],
    };

    const migrations = {
      0: (input: any) => ({
        ...input,
        version: 1,
        metadata: { migrated: true },
      }),
    };

    const serialized = JSON.stringify(legacyWorld);
    const migrated = deserializeWorld(serialized, { migrations });

    expect(migrated.version).toBe(CURRENT_WORLD_SCHEMA_VERSION);
    expect(migrated.metadata?.migrated).toBe(true);
  });

  it('throws when migration is missing', () => {
    const legacyWorld = {
      version: CURRENT_WORLD_SCHEMA_VERSION - 1,
      nodes: [],
    };

    const serialized = JSON.stringify(legacyWorld);
    expect(() => deserializeWorld(serialized, { migrations: {} })).toThrow();
  });

  it('throws when validation fails after migration', () => {
    const legacyWorld = {
      version: 0,
      nodes: [{ id: '' }],
    };

    const migrations = {
      0: (input: any) => ({ ...input, version: 1 }),
    };

    const serialized = JSON.stringify(legacyWorld);
    expect(() => deserializeWorld(serialized, { migrations })).toThrow(/World document is invalid/);
  });
});
