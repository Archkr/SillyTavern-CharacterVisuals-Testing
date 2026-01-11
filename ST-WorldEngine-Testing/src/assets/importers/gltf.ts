import { AssetProcessor, ImportResult } from '../types';
import { ProcessorBackedImporter } from './base';
import type { AssetDefinition } from '../types';

const addGltfPreview: AssetProcessor = (input) => ({
  ...input,
  preview: input.preview ?? `Preview for ${input.id} (GLTF)`,
});

export class GltfImporter extends ProcessorBackedImporter {
  constructor(processors: AssetProcessor[] = []) {
    super('gltf', [addGltfPreview, ...processors]);
  }

  protected async read(definition: AssetDefinition): Promise<ImportResult> {
    return {
      id: definition.id,
      uri: definition.uri,
      type: definition.type,
      payload: {
        uri: definition.uri,
        format: 'gltf',
        metadata: definition.metadata ?? {},
      },
    };
  }
}
