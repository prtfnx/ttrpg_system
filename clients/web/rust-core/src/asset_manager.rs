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
    pub fn set_cache_limits(&mut self, max_size_mb: u64, max_age_hours: f64) {
        self.max_cache_size = max_size_mb * 1024 * 1024;
        self.max_age_ms = max_age_hours * 60.0 * 60.0 * 1000.0;
    }

    #[wasm_bindgen]
    pub fn is_cached(&self, asset_id: &str) -> bool {
        self.cache.contains_key(asset_id)
    }

    #[wasm_bindgen]
    pub fn get_asset_info(&self, asset_id: &str) -> Option<String> {
        self.cache.get(asset_id)
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

        // Verify data integrity
        let computed_hash = self.compute_hash(&data_vec);
        if computed_hash != asset_info.hash {
            return Err(JsValue::from_str("Asset integrity check failed"));
        }

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

        // Persist to IndexedDB
        self.persist_to_indexeddb(&asset_info.id)?;

        Ok(())
    }

    #[wasm_bindgen]
    pub fn remove_asset(&mut self, asset_id: &str) -> bool {
        if let Some(entry) = self.cache.remove(asset_id) {
            self.stats.total_assets -= 1;
            self.stats.total_size -= entry.info.size;
            
            // Remove from IndexedDB
            let _ = self.remove_from_indexeddb(asset_id);
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
        for id in &expired_assets {
            self.remove_asset(id);
        }

        // If still over limit, remove least recently used assets
        if self.stats.total_size > self.max_cache_size {
            let mut lru_assets: Vec<_> = self.cache.iter()
                .map(|(id, entry)| (id.clone(), entry.info.last_accessed))
                .collect();
            
            lru_assets.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());

            while self.stats.total_size > self.max_cache_size && !lru_assets.is_empty() {
                let (id, _) = lru_assets.remove(0);
                self.remove_asset(&id);
            }
        }

        self.stats.last_cleanup = now;
        
        console::log_1(&format!("Cache cleanup completed. Removed {} expired assets", expired_assets.len()).into());
        Ok(())
    }

    #[wasm_bindgen]
    pub fn clear_cache(&mut self) -> Result<(), JsValue> {
        self.cache.clear();
        self.stats = CacheStats {
            total_assets: 0,
            total_size: 0,
            cache_hits: self.stats.cache_hits,
            cache_misses: self.stats.cache_misses,
            last_cleanup: js_sys::Date::now(),
        };

        // Clear IndexedDB
        self.clear_indexeddb()?;
        
        console::log_1(&"Asset cache cleared".into());
        Ok(())
    }

    #[wasm_bindgen]
    pub fn get_cache_stats(&self) -> String {
        serde_json::to_string(&self.stats).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn preload_assets(&mut self, asset_urls: Vec<String>) -> js_sys::Promise {
        let promise = js_sys::Promise::new(&mut |resolve, _reject| {
            console::log_1(&format!("Starting preload of {} assets", asset_urls.len()).into());
            
            // In a real implementation, this would use fetch API
            // For now, just resolve immediately
            resolve.call0(&JsValue::UNDEFINED).unwrap();
        });

        promise
    }

    #[wasm_bindgen]
    pub fn get_asset_list(&self) -> Vec<String> {
        self.cache.keys().cloned().collect()
    }

    #[wasm_bindgen]
    pub fn export_cache(&self) -> Result<String, JsValue> {
        let cache_data: HashMap<String, AssetInfo> = self.cache.iter()
            .map(|(k, v)| (k.clone(), v.info.clone()))
            .collect();

        serde_json::to_string(&cache_data)
            .map_err(|e| JsValue::from_str(&format!("Failed to export cache: {}", e)))
    }

    #[wasm_bindgen]
    pub fn import_cache(&mut self, cache_json: &str) -> Result<(), JsValue> {
        let _cache_data: HashMap<String, AssetInfo> = serde_json::from_str(cache_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid cache JSON: {}", e)))?;

        // Note: This would need to be implemented with actual data loading
        console::log_1(&"Cache import initiated".into());
        Ok(())
    }
}

impl AssetManager {
    fn compute_hash(&self, data: &[u8]) -> String {
        // Simple hash implementation using djb2 algorithm
        let mut hash: u32 = 5381;
        for byte in data {
            hash = hash.wrapping_mul(33).wrapping_add(*byte as u32);
        }
        format!("{:x}", hash)
    }

    fn persist_to_indexeddb(&self, _asset_id: &str) -> Result<(), JsValue> {
        // In a real implementation, this would use IndexedDB API
        // For now, just return success
        Ok(())
    }

    fn remove_from_indexeddb(&self, _asset_id: &str) -> Result<(), JsValue> {
        // In a real implementation, this would use IndexedDB API
        Ok(())
    }

    fn clear_indexeddb(&self) -> Result<(), JsValue> {
        // In a real implementation, this would clear IndexedDB
        Ok(())
    }
}

#[wasm_bindgen]
pub struct AssetUploader {
    upload_progress: HashMap<String, f64>,
    active_uploads: u32,
    max_concurrent_uploads: u32,
}

#[wasm_bindgen]
impl AssetUploader {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            upload_progress: HashMap::new(),
            active_uploads: 0,
            max_concurrent_uploads: 3,
        }
    }

    #[wasm_bindgen]
    pub fn set_max_concurrent_uploads(&mut self, max: u32) {
        self.max_concurrent_uploads = max;
    }

    #[wasm_bindgen]
    pub fn upload_asset(&mut self, asset_id: String, _url: String, _data: &Uint8Array) -> js_sys::Promise {
        let promise = js_sys::Promise::new(&mut |resolve, _reject| {
            console::log_1(&format!("Starting upload for asset: {}", asset_id).into());
            
            // In a real implementation, this would use fetch API with progress tracking
            // For now, simulate upload completion
            resolve.call1(&JsValue::UNDEFINED, &JsValue::from_str(&asset_id)).unwrap();
        });

        self.upload_progress.insert(asset_id, 0.0);
        self.active_uploads += 1;

        promise
    }

    #[wasm_bindgen]
    pub fn get_upload_progress(&self, asset_id: &str) -> f64 {
        self.upload_progress.get(asset_id).copied().unwrap_or(0.0)
    }

    #[wasm_bindgen]
    pub fn cancel_upload(&mut self, asset_id: &str) -> bool {
        if self.upload_progress.remove(asset_id).is_some() {
            if self.active_uploads > 0 {
                self.active_uploads -= 1;
            }
            console::log_1(&format!("Cancelled upload for asset: {}", asset_id).into());
            true
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub fn get_active_uploads(&self) -> u32 {
        self.active_uploads
    }

    #[wasm_bindgen]
    pub fn get_upload_queue_size(&self) -> u32 {
        self.upload_progress.len() as u32
    }
}
