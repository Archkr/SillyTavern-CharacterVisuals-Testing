import { createHash } from 'crypto';
import { deserializeWorld, DeserializeOptions } from './io';
import { AssetReference, WorldDocument } from './schema';

export interface WorldPackageInput {
  world: string;
  hash?: string;
  referencedAssets?: AssetReference[];
}

export interface WorldImportResult {
  world: WorldDocument;
  referencedAssets: AssetReference[];
  hash: string;
}

export interface ImportOptions extends DeserializeOptions {
  expectedHash?: string;
}

const toPackage = (input: string | WorldPackageInput): WorldPackageInput => {
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      if (parsed && typeof parsed === 'object' && 'world' in parsed) {
        return parsed as WorldPackageInput;
      }
    } catch (error) {
      // Intentionally fall back to treating the input as the raw serialized world payload.
    }

    return { world: input };
  }

  return input;
};

const computeHash = (world: string): string => createHash('sha256').update(world).digest('hex');

export function importWorldPackage(input: string | WorldPackageInput, options: ImportOptions = {}): WorldImportResult {
  const pkg = toPackage(input);
  const serialized = pkg.world;
  const computedHash = computeHash(serialized);
  const expectedHash = options.expectedHash ?? pkg.hash;

  if (expectedHash && expectedHash !== computedHash) {
    throw new Error(`World hash mismatch: expected ${expectedHash} but calculated ${computedHash}`);
  }

  const world = deserializeWorld(serialized, options);
  const referencedAssets = pkg.referencedAssets ?? [];

  return { world, referencedAssets, hash: computedHash };
}
