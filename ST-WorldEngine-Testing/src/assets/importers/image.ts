import { AssetProcessor, ImportResult } from '../types';
import { ProcessorBackedImporter } from './base';
import type { AssetDefinition } from '../types';

const addThumbnail: AssetProcessor = (input) => ({
  ...input,
  thumbnail: input.thumbnail ?? `thumbnail://${input.uri}`,
});

const addImagePreview: AssetProcessor = (input) => ({
  ...input,
  preview: input.preview ?? `preview://${input.uri}`,
});

export class ImageImporter extends ProcessorBackedImporter {
  constructor(processors: AssetProcessor[] = []) {
    super('image', [addThumbnail, addImagePreview, ...processors]);
  }

  protected async read(definition: AssetDefinition): Promise<ImportResult> {
    const extension = definition.uri.split('.').pop();
    if (!extension) {
      throw new Error(`Image asset '${definition.id}' is missing a file extension`);
    }

    return {
      id: definition.id,
      uri: definition.uri,
      type: definition.type,
      payload: {
        uri: definition.uri,
        format: extension.toLowerCase(),
        metadata: definition.metadata ?? {},
      },
    };
  }
}
