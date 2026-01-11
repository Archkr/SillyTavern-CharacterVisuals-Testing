import { describe, expect, it } from 'vitest';
import { ScriptSandbox, createScriptSandbox } from '../src/runtime/scripts/sandbox';

describe('ScriptSandbox', () => {
  it('runs code with isolated globals', () => {
    const sandbox = new ScriptSandbox({ globals: { base: 2 } });
    const result = sandbox.run<number>('return base * 3;');
    expect(result).toBe(6);
  });

  it('keeps changes scoped to the sandbox', () => {
    const original = { value: 1 };
    const sandbox = createScriptSandbox({ globals: { config: original } });

    sandbox.run('config.value = 5; exports.updated = config.value;');

    expect(original.value).toBe(1);
    expect((sandbox.snapshotGlobals().exports as Record<string, unknown>).updated).toBe(5);
  });

  it('prevents execution after disposal', () => {
    const sandbox = new ScriptSandbox();
    sandbox.dispose();
    expect(() => sandbox.run('return 1;')).toThrowError('Sandbox has been disposed');
  });
});
