import { create } from 'zustand';

export interface CoverZone {
  zone_id: string;
  shape_type: 'rect' | 'polygon' | 'circle';
  coords: number[] | number[][];
  cover_tier: 'half' | 'three_quarters' | 'full';
  label: string;
}

interface CoverStore {
  zones: CoverZone[];
  setZones(zones: CoverZone[]): void;
  addZone(zone: CoverZone): void;
  removeZone(zone_id: string): void;
}

export const useCoverStore = create<CoverStore>((set) => ({
  zones: [],
  setZones: (zones) => set({ zones }),
  addZone: (zone) =>
    set((s) => ({
      zones: [...s.zones.filter((z) => z.zone_id !== zone.zone_id), zone],
    })),
  removeZone: (zone_id) =>
    set((s) => ({ zones: s.zones.filter((z) => z.zone_id !== zone_id) })),
}));
