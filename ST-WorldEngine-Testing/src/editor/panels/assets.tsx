import React, { useMemo, useState } from 'react';
import { AssetReference } from '../../world/schema';

export type AssetBrowserProps = {
  assets: AssetReference[];
  onSelect?: (id: string) => void;
  onOpen?: (asset: AssetReference) => void;
};

export const AssetBrowser: React.FC<AssetBrowserProps> = ({ assets, onSelect, onOpen }) => {
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return assets;
    return assets.filter((asset) =>
      [asset.id, asset.uri, asset.type, Object.keys(asset.meta ?? {}).join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [assets, filter]);

  return (
    <section className="editor-panel asset-panel">
      <header className="panel-header">
        <div className="panel-title">Assets</div>
        <input
          className="panel-search"
          type="search"
          placeholder="Filter assets (Ctrl+F)"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </header>
      <div className="panel-body asset-grid" role="list">
        {filtered.map((asset) => (
          <button
            key={asset.id}
            className="asset-tile"
            role="listitem"
            onClick={() => onSelect?.(asset.id)}
            onDoubleClick={() => onOpen?.(asset)}
          >
            <div className="asset-label">{asset.id}</div>
            <div className="asset-meta">{asset.type}</div>
            <div className="asset-uri" title={asset.uri}>
              {asset.uri}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};

export default AssetBrowser;
