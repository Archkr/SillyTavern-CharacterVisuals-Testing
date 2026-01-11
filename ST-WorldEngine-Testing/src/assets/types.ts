export type AssetKind = 'gltf' | 'image' | 'audio';

export interface AssetDefinition {
  id: string;
  uri: string;
  type: AssetKind;
  metadata?: Record<string, unknown>;
}

export interface ImportResult {
  id: string;
  uri: string;
  type: AssetKind;
  payload: unknown;
  thumbnail?: string;
  preview?: string;
  metadata?: Record<string, unknown>;
}

export interface AssetImporter {
  readonly type: AssetKind;
  load(definition: AssetDefinition, processors?: AssetProcessor[]): Promise<ImportResult>;
}

export type AssetProcessor = (input: ImportResult, context: { definition: AssetDefinition }) => Promise<ImportResult> | ImportResult;
