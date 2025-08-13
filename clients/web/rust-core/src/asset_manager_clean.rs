use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use web_sys::console;
use js_sys::Uint8Array;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AssetInfo {
    pub id: String,
    pub name: String,
    pub url: String,
    pub hash: String,
    pub size: u64,
    pub mime_type: String,
    pub cached_at: f64,
    pub last_accessed: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AssetCacheEntry {
    pub info: AssetInfo,
    pub data: Vec<u8>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CacheStats {
    pub total_assets: u32,
    pub total_size: u64,
    pub cache_hits: u32,
    pub cache_misses: u32,
    pub last_cleanup: f64,
}

#[wasm_bindgen]
pub struct AssetManager {
    cache: HashMap<String, AssetCacheEntry>,
    stats: CacheStats,
    max_cache_size: u64,
    max_age_ms: f64,
}

#[wasm_bindgen]
impl AssetManager {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            cache: HashMap::new(),
            stats: CacheStats {
                total_assets: 0,
                total_size: 0,
                cache_hits: 0,
                cache_misses: 0,
                last_cleanup: js_sys::Date::now(),
            },
            max_cache_size: 100 * 1024 * 1024, // 100MB default
            max_age_ms: 24.0 * 60.0 * 60.0 * 1000.0, // 24 hours
        }
    }

    #[wasm_bindgen]
    pub fn initialize(&mut self) -> Result<(), JsValue> {
        console::log_1(&"Asset Manager initialized".into());
        Ok(())
    }

    #[wasm_bindgen]
    pub fn get_cache_stats(&self) -> String {
        serde_json::to_string(&self.stats).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn has_asset(&self, asset_id: &str) -> bool {
        self.cache.contains_key(asset_id)
    }

    #[wasm_bindgen]
    pub fn get_asset_info(&self, asset_id: &str) -> Option<String> {
        self.cache
            .get(asset_id)
            .map(|entry| serde_json::to_string(&entry.info).unwrap_or_default())
    }

    #[wasm_bindgen]
    pub fn get_asset_data(&mut self, asset_id: &str) -> Option<Uint8Array> {
        if let Some(entry) = self.cache.get_mut(asset_id) {
            // Update last accessed time
            entry.info.last_accessed = js_sys::Date::now();
            self.stats.cache_hits += 1;
            
            // Convert Vec<u8> to Uint8Array
            let array = Uint8Array::new_with_length(entry.data.len() as u32);
            array.copy_from(&entry.data);
            Some(array)
        } else {
            self.stats.cache_misses += 1;
            None
        }
    }

    #[wasm_bindgen]
    pub fn cache_asset(&mut self, asset_info_json: &str, data: &Uint8Array) -> Result<(), JsValue> {
        let asset_info: AssetInfo = serde_json::from_str(asset_info_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid asset info JSON: {}", e)))?;

        // Convert Uint8Array to Vec<u8>
        let mut data_vec = vec![0u8; data.length() as usize];
        data.copy_to(&mut data_vec);

        // Compute hash for integrity verification
        let computed_hash = self.compute_hash(&data_vec);
        let mut asset_info = asset_info;
        asset_info.hash = computed_hash;
        asset_info.cached_at = js_sys::Date::now();
        asset_info.last_accessed = asset_info.cached_at;

        let cache_entry = AssetCacheEntry {
            info: asset_info.clone(),
            data: data_vec,
        };

        // Check cache size limits before adding
        if self.stats.total_size + asset_info.size > self.max_cache_size {
            self.cleanup_cache()?;
        }

        // Update stats
        if !self.cache.contains_key(&asset_info.id) {
            self.stats.total_assets += 1;
            self.stats.total_size += asset_info.size;
        }

        self.cache.insert(asset_info.id.clone(), cache_entry);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn remove_asset(&mut self, asset_id: &str) -> bool {
        if let Some(entry) = self.cache.remove(asset_id) {
            self.stats.total_assets -= 1;
            self.stats.total_size -= entry.info.size;
            true
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub fn cleanup_cache(&mut self) -> Result<(), JsValue> {
        let now = js_sys::Date::now();
        let mut expired_assets = Vec::new();

        // Find expired assets
        for (id, entry) in &self.cache {
            if now - entry.info.last_accessed > self.max_age_ms {
                expired_assets.push(id.clone());
            }
        }

        // Remove expired assets
        for id in expired_assets.iter() {
            if let Some(entry) = self.cache.remove(id) {
                self.stats.total_assets -= 1;
                self.stats.total_size -= entry.info.size;
            }
        }

        // If still over cache limit, remove least recently used assets
        if self.stats.total_size > self.max_cache_size {
            let mut assets_by_access: Vec<_> = self.cache.iter().collect();
            assets_by_access.sort_by(|a, b| a.1.info.last_accessed.partial_cmp(&b.1.info.last_accessed).unwrap());

            while self.stats.total_size > self.max_cache_size && !assets_by_access.is_empty() {
                if let Some((id, _)) = assets_by_access.first() {
                    let id = id.to_string();
                    if let Some(entry) = self.cache.remove(&id) {
                        self.stats.total_assets -= 1;
                        self.stats.total_size -= entry.info.size;
                    }
                    assets_by_access.remove(0);
                }
            }
        }

        self.stats.last_cleanup = now;
        console::log_1(&format!("Cache cleanup completed. Removed {} expired assets", expired_assets.len()).into());
        Ok(())
    }

    #[wasm_bindgen]
    pub fn clear_cache(&mut self) {
        self.cache.clear();
        self.stats.total_assets = 0;
        self.stats.total_size = 0;
        console::log_1(&"Asset cache cleared".into());
    }

    #[wasm_bindgen]
    pub fn list_assets(&self) -> Vec<String> {
        self.cache.keys().cloned().collect()
    }

    #[wasm_bindgen]
    pub fn set_cache_limits(&mut self, max_size_mb: u64, max_age_hours: f64) {
        self.max_cache_size = max_size_mb * 1024 * 1024;
        self.max_age_ms = max_age_hours * 60.0 * 60.0 * 1000.0;
        console::log_1(&format!("Cache limits updated: {}MB, {}h", max_size_mb, max_age_hours).into());
    }

    // Private helper methods
    fn compute_hash(&self, data: &[u8]) -> String {
        // Simple hash implementation - in production would use SHA256
        let mut hash = 0u64;
        for byte in data {
            hash = hash.wrapping_mul(31).wrapping_add(*byte as u64);
        }
        format!("{:x}", hash)
    }
}
