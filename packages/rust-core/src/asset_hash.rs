use xxhash_rust::xxh64::xxh64;

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

/// Compute the canonical lowercase xxHash64 used by the asset protocol.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub fn calculate_asset_hash(data: &[u8]) -> String {
    format!("{:016x}", xxh64(data, 0))
}

#[cfg(test)]
mod tests {
    use super::calculate_asset_hash;

    #[test]
    fn produces_stable_protocol_hashes() {
        assert_eq!(calculate_asset_hash(b""), "ef46db3751d8e999");
        assert_eq!(calculate_asset_hash(b"hello"), "26c7827d889f6da3");
    }
}
