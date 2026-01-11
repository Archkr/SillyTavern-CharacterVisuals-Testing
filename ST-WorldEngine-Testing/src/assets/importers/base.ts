import { AssetDefinition, AssetImporter, AssetProcessor, ImportResult } from '../types';

export abstract class ProcessorBackedImporter implements AssetImporter {
  constructor(public readonly type: AssetDefinition['type'], private readonly defaultProcessors: AssetProcessor[] = []) {}

  protected abstract read(definition: AssetDefinition): Promise<ImportResult>;

  async load(definition: AssetDefinition, processors: AssetProcessor[] = []): Promise<ImportResult> {
    let result = await this.read(definition);
    const pipeline = [...this.defaultProcessors, ...processors];
    for (const processor of pipeline) {
      result = await processor(result, { definition });
    }
    return result;
  }
}
