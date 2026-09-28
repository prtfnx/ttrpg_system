import { useGameStore, type TableInfo } from '@/store';
import { isDM } from '@features/session/types/roles';
import { useWasmRuntime, useWasmStatus } from '@lib/wasm/runtime';
import React, { useEffect, useRef, useState } from 'react';
import { tableThumbnailService } from '../services/tableThumbnail.service';
import styles from './TablePreview.module.css';

interface TablePreviewProps {
  table: TableInfo;
  priority?: boolean;
  width?: number;
  height?: number;
}

export const TablePreview: React.FC<TablePreviewProps> = ({ table, priority = false }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const runtime = useWasmRuntime();
  const wasmStatus = useWasmStatus();
  const sessionId = useGameStore(state => state.sessionId);
  const userId = useGameStore(state => state.userId);
  const sessionRole = useGameStore(state => state.sessionRole);
  const visibleLayers = useGameStore(state => state.visibleLayers);
  const activeTableId = useGameStore(state => state.activeTableId);
  const [nearViewport, setNearViewport] = useState(priority);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [, rerender] = useState(0);
  const canUsePersistence = isDM(sessionRole);
  const viewerScope = `${sessionId ?? 'no-session'}:${userId ?? 'anonymous'}:${sessionRole ?? 'unknown'}:${visibleLayers.join(',')}`;

  useEffect(() => {
    tableThumbnailService.configure(runtime, sessionId ?? null, canUsePersistence);
    tableThumbnailService.setScope(viewerScope);
    tableThumbnailService.setActiveTable(activeTableId);
  }, [activeTableId, canUsePersistence, runtime, sessionId, viewerScope]);

  useEffect(
    () => tableThumbnailService.subscribe(table.table_id, () => rerender(value => value + 1)),
    [table.table_id],
  );

  useEffect(() => {
    if (priority || typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return;
    }
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: '240px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [priority]);

  useEffect(() => {
    if (
      table.table_id === activeTableId
      && wasmStatus.hydratedTableId === table.table_id
      && wasmStatus.frameTableId === table.table_id
    ) {
      tableThumbnailService.ensurePreview(table.table_id);
    }
  }, [activeTableId, table.table_id, wasmStatus.frameTableId, wasmStatus.hydratedTableId]);

  const snapshot = tableThumbnailService.getSnapshot(table.table_id);
  const persisted = tableThumbnailService.persistedSource(
    table.table_id,
    canUsePersistence && table.has_preview ? (table.preview_etag ?? '') : null,
  );
  const source = nearViewport ? (snapshot.source ?? persisted) : null;
  const visibleSource = source !== failedSource ? source : null;

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-loading={snapshot.isGenerating || undefined}
      title={snapshot.error ?? `Table: ${table.table_name}`}
    >
      {visibleSource ? (
        <img
          src={visibleSource}
          alt=""
          loading={priority || table.table_id === activeTableId ? 'eager' : 'lazy'}
          decoding="async"
          className={styles.image}
          onError={() => setFailedSource(visibleSource)}
          onLoad={() => setFailedSource(null)}
        />
      ) : (
        <span className={styles.placeholder}>
          {snapshot.isGenerating ? 'Updating preview…' : 'No preview yet'}
        </span>
      )}
    </div>
  );
};
