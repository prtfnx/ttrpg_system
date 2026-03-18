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
