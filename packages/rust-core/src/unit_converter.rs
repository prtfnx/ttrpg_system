use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum DistanceUnit {
    Feet,
    Meters,
}

impl DistanceUnit {
    pub fn from_str(s: &str) -> Self {
        match s {
            "m" | "meters" | "metres" => DistanceUnit::Meters,
            _ => DistanceUnit::Feet,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            DistanceUnit::Feet => "ft",
            DistanceUnit::Meters => "m",
        }
    }
}

/// Single authoritative unit converter for a table's coordinate system.
/// All game distances flow through here — no scattered px/ft ratios.
#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct UnitConverter {
    grid_cell_px: f32,
    cell_distance: f32,
    unit: DistanceUnit,
}

impl UnitConverter {
    pub fn new(grid_cell_px: f32, cell_distance: f32, unit: DistanceUnit) -> Self {
        Self {
            grid_cell_px: grid_cell_px.max(1.0),
            cell_distance: cell_distance.max(0.001),
            unit,
        }
    }

    /// D&D 5e standard: 50px/cell, 5ft/cell → 10 px/ft
    pub fn dnd_default() -> Self {
        Self::new(50.0, 5.0, DistanceUnit::Feet)
    }

    /// Pixels per game unit (ft or m).
    pub fn pixels_per_unit(&self) -> f32 {
        self.grid_cell_px / self.cell_distance
    }

    /// Game distance → pixels.
    pub fn to_pixels(&self, game_distance: f32) -> f32 {
        game_distance * self.pixels_per_unit()
    }

    /// Pixels → game distance.
    pub fn to_units(&self, pixels: f32) -> f32 {
        pixels / self.pixels_per_unit()
    }

    /// Current-unit distance → feet.
    pub fn to_feet(&self, distance: f32) -> f32 {
        match self.unit {
            DistanceUnit::Feet => distance,
            DistanceUnit::Meters => distance / 0.3048,
        }
    }

    /// Current-unit distance → meters.
    pub fn to_meters(&self, distance: f32) -> f32 {
        match self.unit {
            DistanceUnit::Feet => distance * 0.3048,
            DistanceUnit::Meters => distance,
        }
    }

    /// Feet → current unit.
    pub fn from_feet(&self, feet: f32) -> f32 {
        match self.unit {
            DistanceUnit::Feet => feet,
            DistanceUnit::Meters => feet * 0.3048,
        }
    }

    /// Format pixel distance as display string.
    pub fn format_distance(&self, pixels: f32) -> String {
        let game_dist = self.to_units(pixels);
        if game_dist < 10.0 {
            format!("{:.1}{}", game_dist, self.unit.label())
        } else {
            format!("{:.0}{}", game_dist, self.unit.label())
        }
    }

    pub fn grid_cell_px(&self) -> f32 { self.grid_cell_px }
    pub fn cell_distance(&self) -> f32 { self.cell_distance }
    pub fn unit(&self) -> DistanceUnit { self.unit }
}

impl Default for UnitConverter {
    fn default() -> Self {
        Self::dnd_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const EPS: f32 = 1e-4;

    fn approx(a: f32, b: f32) -> bool {
        (a - b).abs() < EPS
    }

    // ── Pixels-per-unit ──────────────────────────────────────────────────────

    #[test]
    fn dnd_default_pixels_per_unit() {
        // 50px / 5ft = 10 px/ft
        let c = UnitConverter::dnd_default();
        assert!(approx(c.pixels_per_unit(), 10.0), "got {}", c.pixels_per_unit());
    }

    #[test]
    fn custom_converter_pixels_per_unit() {
        let c = UnitConverter::new(75.0, 5.0, DistanceUnit::Feet);
        assert!(approx(c.pixels_per_unit(), 15.0));
    }

    // ── px ↔ game-unit roundtrip ─────────────────────────────────────────────

    #[test]
    fn to_pixels_and_back_roundtrip() {
        let c = UnitConverter::dnd_default();
        let original = 30.0_f32;
        let pix = c.to_pixels(original);
        let back = c.to_units(pix);
        assert!(approx(back, original), "roundtrip failed: {} → {} → {}", original, pix, back);
    }

    #[test]
    fn to_pixels_known_values() {
        let c = UnitConverter::dnd_default(); // 10 px/ft
        assert!(approx(c.to_pixels(5.0), 50.0));
        assert!(approx(c.to_pixels(30.0), 300.0));
    }

    // ── Feet ↔ meters ────────────────────────────────────────────────────────

    #[test]
    fn feet_converter_to_meters() {
        let c = UnitConverter::new(50.0, 5.0, DistanceUnit::Feet);
        // 5 ft ≈ 1.524 m
        assert!(approx(c.to_meters(5.0), 1.524), "got {}", c.to_meters(5.0));
    }

    #[test]
    fn feet_converter_to_feet_identity() {
        let c = UnitConverter::new(50.0, 5.0, DistanceUnit::Feet);
        assert!(approx(c.to_feet(10.0), 10.0));
    }

    #[test]
    fn meters_converter_to_feet() {
        let c = UnitConverter::new(50.0, 5.0, DistanceUnit::Meters);
        // 1 m ≈ 3.28084 ft
        let ft = c.to_feet(1.0);
        assert!((ft - 3.28084).abs() < 0.001, "got {}", ft);
    }

    #[test]
    fn from_feet_in_meter_mode() {
        let c = UnitConverter::new(50.0, 5.0, DistanceUnit::Meters);
        // 10 ft should convert to ~3.048 m
        let m = c.from_feet(10.0);
        assert!(approx(m, 3.048), "got {}", m);
    }

    // ── Display formatting ───────────────────────────────────────────────────

    #[test]
    fn format_short_distance_has_decimal() {
        // 9.5 ft → "9.5ft"
        let c = UnitConverter::new(10.0, 1.0, DistanceUnit::Feet); // 10px/ft
        let s = c.format_distance(95.0); // 95px = 9.5ft
        assert_eq!(s, "9.5ft", "got: {}", s);
    }

    #[test]
    fn format_long_distance_no_decimal() {
        // 150 ft → "150ft"
        let c = UnitConverter::new(10.0, 1.0, DistanceUnit::Feet); // 10px/ft
        let s = c.format_distance(1500.0); // 1500px = 150ft
        assert_eq!(s, "150ft", "got: {}", s);
    }

    #[test]
    fn format_distance_uses_correct_unit_label() {
        let c = UnitConverter::new(10.0, 1.0, DistanceUnit::Meters);
        let s = c.format_distance(150.0); // 15m
        assert!(s.ends_with('m'), "format should end with 'm', got: {}", s);
    }

    // ── Unit string parsing ──────────────────────────────────────────────────

    #[test]
    fn distance_unit_from_str_feet_variants() {
        assert!(matches!(DistanceUnit::from_str("ft"), DistanceUnit::Feet));
        assert!(matches!(DistanceUnit::from_str("feet"), DistanceUnit::Feet));
        assert!(matches!(DistanceUnit::from_str("anything"), DistanceUnit::Feet));
    }

    #[test]
    fn distance_unit_from_str_meters_variants() {
        assert!(matches!(DistanceUnit::from_str("m"), DistanceUnit::Meters));
        assert!(matches!(DistanceUnit::from_str("meters"), DistanceUnit::Meters));
        assert!(matches!(DistanceUnit::from_str("metres"), DistanceUnit::Meters));
    }

    // ── Clamping safety ──────────────────────────────────────────────────────

    #[test]
    fn zero_grid_cell_px_clamped_to_one() {
        let c = UnitConverter::new(0.0, 5.0, DistanceUnit::Feet);
        assert!(c.grid_cell_px() >= 1.0);
    }
}

