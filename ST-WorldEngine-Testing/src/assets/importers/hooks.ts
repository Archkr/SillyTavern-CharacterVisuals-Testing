import { EventEmitter } from 'events';
import { AssetRegistry } from '../registry';
import { AssetDefinition, AssetProcessor, ImportResult } from '../types';

export type ImportEvent =
  | { type: 'enqueued'; definition: AssetDefinition }
  | { type: 'processed'; result: ImportResult }
  | { type: 'thumbnail'; assetId: string; thumbnail: string }
  | { type: 'preview'; assetId: string; preview: string }
  | { type: 'error'; definition: AssetDefinition; error: Error };

interface ImportJob {
  definition: AssetDefinition;
  processors?: AssetProcessor[];
}

export class ImportQueue extends EventEmitter {
  private queue: ImportJob[] = [];
  private processing = false;

  constructor(private readonly registry: AssetRegistry) {
    super();
  }

  enqueue(definition: AssetDefinition, options: { processors?: AssetProcessor[] } = {}): void {
    if (!this.registry.isRegistered(definition.id)) {
      this.registry.register(definition, { processors: options.processors });
    }

    this.queue.push({ definition, processors: options.processors });
    this.emit('event', { type: 'enqueued', definition } satisfies ImportEvent);
    void this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) {
        continue;
      }

      try {
        const result = await this.registry.acquire(job.definition.id);
        this.emit('event', { type: 'processed', result } satisfies ImportEvent);

        if (result.thumbnail) {
          this.emit('event', {
            type: 'thumbnail',
            assetId: result.id,
            thumbnail: result.thumbnail,
          } satisfies ImportEvent);
        }

        if (result.preview) {
          this.emit('event', {
            type: 'preview',
            assetId: result.id,
            preview: result.preview,
          } satisfies ImportEvent);
        }
      } catch (error) {
        const castError = error instanceof Error ? error : new Error(String(error));
        this.emit('event', { type: 'error', definition: job.definition, error: castError } satisfies ImportEvent);
      } finally {
        this.registry.release(job.definition.id);
      }
    }
    this.processing = false;
  }
}
