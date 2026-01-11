import { AssetDefinition, AssetImporter, AssetKind, AssetProcessor, ImportResult } from './types';

interface AssetEntry {
  definition: AssetDefinition;
  refCount: number;
  resource?: Promise<ImportResult>;
  processors?: AssetProcessor[];
}

export class AssetRegistry {
  private assets = new Map<string, AssetEntry>();

  constructor(private readonly importers: Map<AssetKind, AssetImporter> | Record<AssetKind, AssetImporter>) {}

  register(definition: AssetDefinition, options: { processors?: AssetProcessor[] } = {}): void {
    const existing = this.assets.get(definition.id);
    if (existing) {
      existing.definition = definition;
      existing.processors = options.processors ?? existing.processors;
      return;
    }

    this.assets.set(definition.id, {
      definition,
      refCount: 0,
      processors: options.processors,
    });
  }

  isRegistered(id: string): boolean {
    return this.assets.has(id);
  }

  getRefCount(id: string): number {
    const entry = this.assets.get(id);
    if (!entry) {
      throw new Error(`Asset '${id}' is not registered`);
    }
    return entry.refCount;
  }

  private resolveImporter(kind: AssetKind): AssetImporter {
    const importer =
      this.importers instanceof Map ? this.importers.get(kind) : (this.importers as Record<AssetKind, AssetImporter>)[kind];
    if (!importer) {
      throw new Error(`No importer registered for asset type '${kind}'`);
    }
    return importer;
  }

  async acquire(id: string): Promise<ImportResult> {
    const entry = this.assets.get(id);
    if (!entry) {
      throw new Error(`Asset '${id}' is not registered`);
    }

    entry.refCount += 1;

    if (!entry.resource) {
      const importer = this.resolveImporter(entry.definition.type);
      entry.resource = importer
        .load(entry.definition, entry.processors ?? [])
        .catch((error) => {
          entry.resource = undefined;
          throw error;
        });
    }

    return entry.resource;
  }

  release(id: string): void {
    const entry = this.assets.get(id);
    if (!entry) {
      throw new Error(`Asset '${id}' is not registered`);
    }

    if (entry.refCount === 0) {
      throw new Error(`Cannot release asset '${id}' because it has no active references`);
    }

    entry.refCount -= 1;
  }

  evictUnused(): void {
    for (const [id, entry] of this.assets.entries()) {
      if (entry.refCount === 0) {
        this.assets.delete(id);
      }
    }
  }
}
