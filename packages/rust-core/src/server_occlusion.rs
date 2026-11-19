use serde::Deserialize;

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub(crate) struct ServerOcclusion {
    schema_version: u8,
    pub valid: bool,
    pub segments: Vec<f32>,
}

impl ServerOcclusion {
    pub fn unavailable() -> Self {
        Self {
            schema_version: 1,
            valid: false,
            segments: Vec::new(),
        }
    }

    pub fn parse(json: &str) -> Option<Self> {
        let value: Self = serde_json::from_str(json).ok()?;
        (value.schema_version == 1
            && value.segments.len() <= 8192 * 4
            && value.segments.len() % 4 == 0
            && (value.valid || value.segments.is_empty())
            && value
                .segments
                .iter()
                .all(|n| n.is_finite() && n.abs() <= 10_000_000.0))
        .then_some(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_complete_bounded_geometry_and_empty_replacements() {
        assert!(ServerOcclusion::parse(
            r#"{"schema_version":1,"valid":true,"segments":[1,2,3,4]}"#
        )
        .is_some());
        assert!(
            ServerOcclusion::parse(r#"{"schema_version":1,"valid":true,"segments":[]}"#)
                .unwrap()
                .valid
        );
        assert_eq!(
            ServerOcclusion::parse(r#"{"schema_version":1,"valid":false,"segments":[]}"#),
            Some(ServerOcclusion::unavailable())
        );
    }

    #[test]
    fn rejects_partial_nonfinite_oversized_or_private_payloads() {
        for payload in [
            r#"{"schema_version":2,"valid":true,"segments":[]}"#,
            r#"{"schema_version":1,"valid":true,"segments":[1,2,3]}"#,
            r#"{"schema_version":1,"valid":false,"segments":[1,2,3,4]}"#,
            r#"{"schema_version":1,"valid":true,"segments":[1e100,0,1,1]}"#,
            r#"{"schema_version":1,"valid":true,"segments":[],"sprite_id":"private"}"#,
        ] {
            assert!(ServerOcclusion::parse(payload).is_none(), "{payload}");
        }
        let oversized =
            serde_json::json!({"schema_version":1,"valid":true,"segments":vec![0;8192*4+4]});
        assert!(ServerOcclusion::parse(&oversized.to_string()).is_none());
    }
}
