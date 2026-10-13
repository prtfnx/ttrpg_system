//! Transient editor frame geometry. No scene objects or history are created.
use super::paint_scene::PaintHandle;

#[derive(Clone, Debug)]
pub struct SelectionFrame {
    pub corners: [(f32, f32); 4],
}

impl SelectionFrame {
    pub fn from_coordinates(values: &[f32]) -> Option<Self> {
        if values.len() != 8
            || values
                .iter()
                .any(|v| !v.is_finite() || v.abs() > 1_000_000.0)
        {
            return None;
        }
        let corners = std::array::from_fn(|i| (values[i * 2], values[i * 2 + 1]));
        if (corners[1].0 - corners[0].0).hypot(corners[1].1 - corners[0].1) < f32::EPSILON {
            return None;
        }
        Some(Self { corners })
    }

    pub fn handles(&self, rotation_offset: f32) -> [PaintHandle; 5] {
        let [(x0, y0), (x1, y1), _, _] = self.corners;
        let length = (x1 - x0).hypot(y1 - y0);
        let mut result = std::array::from_fn(|i| PaintHandle {
            kind: ["nw", "ne", "se", "sw", "rotate"][i],
            x: self.corners[i.min(3)].0,
            y: self.corners[i.min(3)].1,
        });
        result[4].x = (x0 + x1) / 2.0 + (y1 - y0) / length * rotation_offset;
        result[4].y = (y0 + y1) / 2.0 - (x1 - x0) / length * rotation_offset;
        result
    }

    pub fn hit_test(&self, x: f32, y: f32, tolerance: f32, rotation_offset: f32) -> Option<String> {
        if !x.is_finite() || !y.is_finite() || !tolerance.is_finite() || tolerance < 0.0 {
            return None;
        }
        self.handles(rotation_offset)
            .iter()
            .rev()
            .find(|handle| (handle.x - x).hypot(handle.y - y) <= tolerance)
            .map(|handle| handle.kind.to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_bounded_finite_frame_coordinates() {
        assert!(SelectionFrame::from_coordinates(&[0.0; 8]).is_none());
        assert!(SelectionFrame::from_coordinates(&[0.0; 7]).is_none());
        assert!(SelectionFrame::from_coordinates(&[f32::NAN; 8]).is_none());
        assert!(SelectionFrame::from_coordinates(&[2_000_000.0; 8]).is_none());
    }

    #[test]
    fn picks_corners_and_rotation_at_zoom_scaled_offsets() {
        let frame =
            SelectionFrame::from_coordinates(&[0.0, 0.0, 100.0, 0.0, 100.0, 50.0, 0.0, 50.0])
                .unwrap();
        assert_eq!(frame.hit_test(100.0, 50.0, 3.0, 14.0), Some("se".into()));
        assert_eq!(
            frame.hit_test(50.0, -14.0, 3.0, 14.0),
            Some("rotate".into())
        );
        assert_eq!(frame.hit_test(50.0, -28.0, 3.0, 14.0), None);
        assert_eq!(frame.hit_test(f32::NAN, 0.0, 3.0, 14.0), None);
    }

    #[test]
    fn rotation_handle_follows_oriented_top_edge() {
        let frame =
            SelectionFrame::from_coordinates(&[50.0, 0.0, 50.0, 100.0, 0.0, 100.0, 0.0, 0.0])
                .unwrap();
        let handle = &frame.handles(28.0)[4];
        assert_eq!((handle.x, handle.y), (78.0, 50.0));
    }
}
