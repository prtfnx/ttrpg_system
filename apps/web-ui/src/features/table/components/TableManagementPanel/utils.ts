export const formatDate = (dateString?: string): string => {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString();
};

export const formatRelativeTime = (timestamp?: number): string => {
  if (!timestamp) return '';
  
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

export const TABLE_TEMPLATES = {
  small: { width: 1000, height: 1000, label: 'Small (1000×1000)' },
  medium: { width: 2000, height: 2000, label: 'Medium (2000×2000)' },
  large: { width: 4000, height: 4000, label: 'Large (4000×4000)' },
  huge: { width: 8000, height: 8000, label: 'Huge (8000×8000)' },
} as const;

export type ImportedTableData = Record<string, unknown> & {
  table_name: string;
  width: number;
  height: number;
  layers: Record<string, unknown>;
};

export const validateImportedTableData = (value: unknown): ImportedTableData | null => {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const name = data.table_name;
  const width = data.width;
  const height = data.height;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 50) return null;
  if (!Number.isSafeInteger(width) || Number(width) < 500 || Number(width) > 10_000) return null;
  if (!Number.isSafeInteger(height) || Number(height) < 500 || Number(height) > 10_000) return null;
  if (!data.layers || typeof data.layers !== 'object' || Array.isArray(data.layers)) return null;
  return {
    ...data,
    table_name: name.trim(),
    width: Number(width),
    height: Number(height),
    layers: data.layers as Record<string, unknown>,
  };
};
