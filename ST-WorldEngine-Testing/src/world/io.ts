import { validateWorldDocument, WorldDocument } from './schema';

export const CURRENT_WORLD_SCHEMA_VERSION = 1;

export type MigrationFn = (input: any) => any;

export interface MigrationRegistry {
  [sourceVersion: number]: MigrationFn;
}

export interface DeserializeOptions {
  migrations?: MigrationRegistry;
  validate?: boolean;
}

export function serializeWorld(world: WorldDocument): string {
  const validation = validateWorldDocument(world);
  if (!validation.valid) {
    throw new Error(`World document is invalid: ${validation.errors.join('; ')}`);
  }

  return JSON.stringify({ ...world, version: CURRENT_WORLD_SCHEMA_VERSION }, null, 2);
}

function applyMigrations(document: any, migrations: MigrationRegistry): WorldDocument {
  if (typeof document !== 'object' || document === null) {
    throw new Error('World must be an object');
  }

  if (document.version === undefined) {
    document.version = 0;
  }

  if (document.version > CURRENT_WORLD_SCHEMA_VERSION) {
    throw new Error(`Cannot load future schema version ${document.version}`);
  }

  let current = document.version;
  let migrated = document;
  while (current < CURRENT_WORLD_SCHEMA_VERSION) {
    const migrate = migrations[current];
    if (!migrate) {
      throw new Error(`Missing migration function for version ${current}`);
    }
    migrated = migrate(migrated);
    if (!migrated || typeof migrated !== 'object') {
      throw new Error(`Migration for version ${current} must return a world object`);
    }
    if (typeof migrated.version !== 'number' || migrated.version <= current) {
      throw new Error(`Migration for version ${current} must bump the version number`);
    }
    current = migrated.version;
  }

  return migrated as WorldDocument;
}

export function deserializeWorld(serialized: string, options: DeserializeOptions = {}): WorldDocument {
  const parsed = JSON.parse(serialized);
  const migrated = applyMigrations(parsed, options.migrations ?? {});

  if (options.validate === false) {
    return migrated;
  }

  const validation = validateWorldDocument(migrated);
  if (!validation.valid) {
    throw new Error(`World document is invalid: ${validation.errors.join('; ')}`);
  }

  return migrated;
}
