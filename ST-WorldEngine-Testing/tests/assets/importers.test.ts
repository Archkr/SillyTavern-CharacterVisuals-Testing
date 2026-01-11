import { describe, expect, it, vi } from 'vitest';
import { AudioImporter } from '../../src/assets/importers/audio';
import { GltfImporter } from '../../src/assets/importers/gltf';
import { ImageImporter } from '../../src/assets/importers/image';
import { ImportQueue } from '../../src/assets/importers/hooks';
import { AssetRegistry } from '../../src/assets/registry';
import { AssetProcessor } from '../../src/assets/types';

describe('asset importers', () => {
  it('applies pluggable processors in order', async () => {
    const log: string[] = [];
    const processor: AssetProcessor = async (input) => {
      log.push('custom');
      return { ...input, metadata: { ...(input.metadata ?? {}), touched: true } };
    };

    const importer = new ImageImporter([processor]);
    const registry = new AssetRegistry({ image: importer } as any);
    registry.register({ id: 'texture', uri: '/texture.png', type: 'image' });

    const result = await registry.acquire('texture');

    expect(log).toEqual(['custom']);
    expect(result.thumbnail).toBe('thumbnail:///texture.png');
    expect(result.preview).toBe('preview:///texture.png');
    expect(result.metadata?.touched).toBe(true);
  });

  it('throws on missing extensions for assets that require them', async () => {
    const importer = new AudioImporter();
    const registry = new AssetRegistry({ audio: importer } as any);
    registry.register({ id: 'sound', uri: '/sound', type: 'audio' });

    await expect(registry.acquire('sound')).rejects.toThrow(/missing a file extension/);
  });

  it('emits queue events for processed assets and previews', async () => {
    const importers = { gltf: new GltfImporter(), image: new ImageImporter(), audio: new AudioImporter() } as const;
    const registry = new AssetRegistry(importers as any);
    const queue = new ImportQueue(registry);

    const events: string[] = [];
    queue.on('event', (event) => {
      events.push(event.type);
    });

    queue.enqueue({ id: 'character', uri: '/character.glb', type: 'gltf' });
    queue.enqueue({ id: 'ui', uri: '/ui.png', type: 'image' });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(events).toContain('enqueued');
    expect(events).toContain('processed');
    expect(events).toContain('preview');
    expect(events).toContain('thumbnail');
  });

  it('reports processor errors through the queue while cleaning up references', async () => {
    const failingProcessor: AssetProcessor = vi.fn(async () => {
      throw new Error('processor failure');
    });

    const importer = new GltfImporter([failingProcessor]);
    const registry = new AssetRegistry({ gltf: importer } as any);
    const queue = new ImportQueue(registry);

    const errors: Error[] = [];
    queue.on('event', (event) => {
      if (event.type === 'error') {
        errors.push(event.error);
      }
    });

    queue.enqueue({ id: 'bad', uri: '/bad.glb', type: 'gltf' });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('processor failure');
    expect(registry.getRefCount('bad')).toBe(0);
  });
});
