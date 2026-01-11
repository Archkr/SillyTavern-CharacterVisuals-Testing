# World schema

This extension describes worlds as JSON documents that bundle a scene graph, a reusable asset library, and metadata for tooling. The schema is versioned so new fields can be added without breaking older saves.

## Top-level structure

| Field | Type | Notes |
| --- | --- | --- |
| `version` | `number` | Schema version. Bumped when the structure changes. |
| `metadata` | `Record<string, unknown>` | Optional authoring metadata (world title, creator name, notes, etc.). |
| `assets` | `AssetReference[]` | Optional library of reusable assets referenced by nodes. Asset IDs must be unique. |
| `nodes` | `SceneNode[]` | Root-level scene nodes. |

## Scene graph nodes

Scene nodes form a tree. Each node may carry transforms, components, and an asset reference.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Stable identifier. Must be unique across the tree. |
| `name` | `string` | Human-readable label. |
| `transform` | `Transform` | Local transform applied relative to the parent node. |
| `components` | `Component[]` | Optional list of arbitrary components. Each component has a `type` string and component-specific `data`. |
| `children` | `SceneNode[]` | Nested nodes inheriting the parent transform. |
| `asset` | `NodeAssetReference` | Optional reference to an entry in the `assets` library. |
| `tags` | `string[]` | Optional free-form labels for grouping and search. |

## Transforms

| Field | Type | Notes |
| --- | --- | --- |
| `position` | `{ x: number; y: number; z: number; }` | Local translation in meters. Defaults to `{ x: 0, y: 0, z: 0 }`. |
| `rotation` | `{ x: number; y: number; z: number; w: number; }` | Local rotation stored as a quaternion. Defaults to the identity quaternion `{ x: 0, y: 0, z: 0, w: 1 }`. |
| `scale` | `{ x: number; y: number; z: number; }` | Local non-uniform scale. Defaults to `{ x: 1, y: 1, z: 1 }`. |

## Assets and asset references

Assets are reusable resources (GLTF models, textures, audio). Nodes reference assets by ID so a single asset can be instanced many times.

### Asset definition

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Unique identifier used by nodes. |
| `uri` | `string` | URL or relative path to the asset payload. |
| `type` | `'gltf' | 'texture' | 'audio' | 'unknown'` | Hint for loaders. |
| `meta` | `Record<string, unknown>` | Optional authoring metadata (copyright, variant names, etc.). |

### Node asset reference

| Field | Type | Notes |
| --- | --- | --- |
| `assetId` | `string` | ID from the `assets` collection. |
| `options` | `Record<string, unknown>` | Optional per-instance configuration (e.g., variant, material overrides). |

## Versioning and migrations

- Worlds are saved with a numeric `version` aligned to the current schema version implemented by the codebase.
- When loading, worlds can be migrated forward using registered migration functions keyed by the source version. Each migration mutates or returns a new document and must bump the `version` number.
- The serializer always emits the current schema version to ensure consistency across tools.
