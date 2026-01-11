import { AssetProcessor, ImportResult } from '../types';
import { ProcessorBackedImporter } from './base';
import type { AssetDefinition } from '../types';

const addWaveformPreview: AssetProcessor = (input) => ({
  ...input,
  preview: input.preview ?? `waveform://${input.id}`,
});

export class AudioImporter extends ProcessorBackedImporter {
  constructor(processors: AssetProcessor[] = []) {
    super('audio', [addWaveformPreview, ...processors]);
  }

  protected async read(definition: AssetDefinition): Promise<ImportResult> {
    const extension = definition.uri.split('.').pop();
    if (!extension) {
      throw new Error(`Audio asset '${definition.id}' is missing a file extension`);
    }

    return {
      id: definition.id,
      uri: definition.uri,
      type: definition.type,
      payload: {
        uri: definition.uri,
        codec: extension.toLowerCase(),
        metadata: definition.metadata ?? {},
      },
    };
  }
}
