const CURRENCY_ORDER = [
  ['platinum', 'pp'],
  ['gold', 'gp'],
  ['electrum', 'ep'],
  ['silver', 'sp'],
  ['copper', 'cp'],
] as const;

export function formatEquipmentCost(cost: unknown, displayCost?: unknown): string {
  if (typeof displayCost === 'string' && displayCost.trim()) return displayCost;
  if (typeof cost === 'string' && cost.trim()) return cost;
  if (!cost || typeof cost !== 'object') return '—';

  const values = cost as Record<string, unknown>;
  const parts = CURRENCY_ORDER.flatMap(([name, abbreviation]) => {
    const value = values[name];
    return typeof value === 'number' && value > 0 ? [`${value} ${abbreviation}`] : [];
  });
  return parts.length > 0 ? parts.join(', ') : '—';
}

export function parseCompendiumSpeed(speedData: unknown): Record<string, number> {
  const speeds: Record<string, number> = { walk: 30 };

  if (typeof speedData === 'number') {
    speeds.walk = speedData;
    return speeds;
  }
  if (typeof speedData === 'string') {
    const walk = speedData.match(/^\s*(\d+)\s*ft\.?/i);
    if (walk) speeds.walk = Number.parseInt(walk[1], 10);
    for (const match of speedData.matchAll(/([a-z]+)\s+(\d+)\s*ft\.?/gi)) {
      speeds[match[1].toLowerCase()] = Number.parseInt(match[2], 10);
    }
    return speeds;
  }
  if (speedData && typeof speedData === 'object') {
    for (const [name, value] of Object.entries(speedData)) {
      const parsed = Number.parseInt(String(value), 10);
      if (Number.isFinite(parsed)) speeds[name.toLowerCase()] = parsed;
    }
  }
  return speeds;
}
