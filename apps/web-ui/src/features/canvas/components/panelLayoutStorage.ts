export type PanelSide = 'left' | 'right';

const PANEL_DEFAULT_WIDTH = { left: 320, right: 400 } as const;
const PANEL_MIN_WIDTH = { left: 200, right: 250 } as const;
const PANEL_MAX_WIDTH = 600;

export function loadPanelWidth(side: PanelSide): number {
  try {
    const value = Number(localStorage.getItem(`panel_${side}_width`));
    return Number.isSafeInteger(value)
      && value >= PANEL_MIN_WIDTH[side]
      && value <= PANEL_MAX_WIDTH
      ? value
      : PANEL_DEFAULT_WIDTH[side];
  } catch {
    return PANEL_DEFAULT_WIDTH[side];
  }
}

export function loadPanelVisibility(side: PanelSide): boolean {
  try {
    const value = localStorage.getItem(`panel_${side}_visible`);
    if (value === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function savePanelWidth(side: PanelSide, width: number): void {
  try {
    localStorage.setItem(`panel_${side}_width`, String(width));
  } catch {
    // Resizing must remain usable when browser storage is unavailable or full.
  }
}

export function savePanelVisibility(side: PanelSide, visible: boolean): void {
  try {
    localStorage.setItem(`panel_${side}_visible`, String(visible));
  } catch {
    // Visibility remains session-local when browser storage is unavailable.
  }
}
