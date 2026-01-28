export const formatDate = (dateString?: string): string => {
  if (!dateString) return 'Unknown';
  try {
    return new Date(dateString).toLocaleDateString();
  } catch {
    return 'Unknown';
  }
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
