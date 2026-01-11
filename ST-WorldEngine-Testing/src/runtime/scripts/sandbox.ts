export interface SandboxOptions {
  globals?: Record<string, unknown>;
}

const cloneValue = <T>(value: T): T => {
  try {
    // structuredClone is supported in modern runtimes and preserves nested objects without references.
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
};

export class ScriptSandbox {
  private globals: Record<string, unknown>;
  private disposed = false;

  constructor(options?: SandboxOptions) {
    this.globals = { exports: {}, ...(cloneValue(options?.globals ?? {})) };
  }

  run<T = unknown>(code: string): T {
    if (this.disposed) {
      throw new Error('Sandbox has been disposed');
    }

    const argNames = Object.keys(this.globals);
    const argValues = Object.values(this.globals);
    const runner = new Function(
      ...argNames,
      '"use strict"; return (function() { ' + code + ' }).call(null);'
    );

    return runner(...argValues) as T;
  }

  expose(name: string, value: unknown): void {
    if (this.disposed) {
      throw new Error('Sandbox has been disposed');
    }
    this.globals[name] = value;
  }

  snapshotGlobals(): Record<string, unknown> {
    return cloneValue(this.globals);
  }

  dispose(): void {
    this.disposed = true;
    this.globals = {};
  }
}

export const createScriptSandbox = (options?: SandboxOptions): ScriptSandbox => new ScriptSandbox(options);

export default ScriptSandbox;
