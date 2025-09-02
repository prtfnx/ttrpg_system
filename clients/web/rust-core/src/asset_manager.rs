use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use web_sys::{console, window, Request, RequestInit, RequestMode, Response};
use js_sys::{Uint8Array, ArrayBuffer, Date};
use wasm_bindgen::JsCast;
use xxhash_rust::xxh64::xxh64;

fn calculate_hash(data: &[u8]) -> u64 {
    xxh64(data, 0)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AssetInfo {
    pub id: String,
    pub name: String,
    pub url: String,
    pub xxhash: String,
    pub size: u64,
    pub mime_type: String,
    pub cached_at: f64,
    pub last_accessed: f64,
    pub download_progress: f64,
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
    pub download_queue_size: u32,
    pub total_downloads: u32,
    pub failed_downloads: u32,
    pub hash_verifications: u32,
    pub hash_failures: u32,
}

#[wasm_bindgen]
pub struct AssetManager {
    cache: HashMap<String, AssetCacheEntry>,
    hash_lookup: HashMap<String, String>, // xxhash -> asset_id
    download_queue: Vec<String>,
    stats: CacheStats,
    max_cache_size: u64,
    max_age_ms: f64,
}

#[wasm_bindgen]
impl AssetManager {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        console::log_1(&"Starting AssetManager constructor...".into());
        
        let cache = HashMap::new();
        console::log_1(&"Created cache HashMap".into());
        
        let hash_lookup = HashMap::new();
        console::log_1(&"Created hash_lookup HashMap".into());
        
        let download_queue = Vec::new();
        console::log_1(&"Created download_queue Vec".into());
        
        let current_time = Date::now();
        console::log_1(&format!("Current time: {}", current_time).into());
        
        let stats = CacheStats {
            total_assets: 0,
            total_size: 0,
            cache_hits: 0,
            cache_misses: 0,
            last_cleanup: current_time,
            download_queue_size: 0,
            total_downloads: 0,
            failed_downloads: 0,
            hash_verifications: 0,
            hash_failures: 0,
        };
        console::log_1(&"Created stats".into());
        
        let manager = Self {
            cache,
            hash_lookup,
            download_queue,
            stats,
            max_cache_size: 100 * 1024 * 1024, // 100MB default
            max_age_ms: 24.0 * 60.0 * 60.0 * 1000.0, // 24 hours
        };
        
        console::log_1(&"AssetManager constructor completed successfully".into());
        manager
    }

    #[wasm_bindgen]
    pub async fn initialize(&mut self) -> Result<(), JsValue> {
        console::log_1(&"Initializing Asset Manager...".into());
        console::log_1(&"Asset Manager initialized successfully".into());
        Ok(())
    }

    #[wasm_bindgen]
    pub async fn download_asset(&mut self, url: String, expected_hash: Option<String>) -> Result<String, JsValue> {
        console::log_1(&format!("Downloading asset: {}", url).into());
        
        // Add to download queue if not already queued
        if !self.download_queue.contains(&url) {
            self.download_queue.push(url.clone());
            self.stats.download_queue_size = self.download_queue.len() as u32;
        }
        
        // Check if already cached by hash
        if let Some(ref hash) = expected_hash {
            if let Some(asset_id) = self.hash_lookup.get(hash) {
                if let Some(entry) = self.cache.get_mut(asset_id) {
                    entry.info.last_accessed = Date::now();
                    self.stats.cache_hits += 1;
                    console::log_1(&format!("Asset found in cache by hash: {}", hash).into());
                    // Remove from download queue since it's cached
                    self.download_queue.retain(|queued_url| queued_url != &url);
                    self.stats.download_queue_size = self.download_queue.len() as u32;
                    return Ok(asset_id.clone());
                }
                }
            }
        }
        
        // Download the asset
        let request_init = RequestInit::new();
        request_init.set_method("GET");
        request_init.set_mode(RequestMode::Cors);
        
        let request = Request::new_with_str_and_init(&url, &request_init)?;
        let window = window().ok_or("No window found")?;
        let resp_value = JsFuture::from(window.fetch_with_request(&request)).await?;
        let resp: Response = resp_value.dyn_into()?;
        
        if !resp.ok() {
            self.stats.failed_downloads += 1;
            return Err(JsValue::from_str(&format!("Failed to download asset: HTTP {}", resp.status())));
        }
        
        // Get response data
        let array_buffer = JsFuture::from(resp.array_buffer()?).await?;
        let array_buffer: ArrayBuffer = array_buffer.dyn_into()?;
        let uint8_array = Uint8Array::new(&array_buffer);
        let data = uint8_array.to_vec();
        
        // Calculate hash and verify if expected
        let calculated_hash = calculate_hash(&data);
        let hash_string = format!("{:016x}", calculated_hash);
        
        self.stats.hash_verifications += 1;
        
        if let Some(ref expected) = expected_hash {
            if expected != &hash_string {
                self.stats.hash_failures += 1;
                return Err(JsValue::from_str(&format!(
                    "Hash verification failed. Expected: {}, Got: {}", expected, hash_string
                )));
            }
        }
        
        // Extract filename from URL
        let filename = url.split('/').last().unwrap_or("unknown").to_string();
        
        // Determine MIME type from file extension
        let mime_type = match filename.split('.').last().unwrap_or("") {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "svg" => "image/svg+xml",
            "json" => "application/json",
            "txt" => "text/plain",
            _ => "application/octet-stream",
        }.to_string();
        
        // Create asset info
        let asset_id = format!("asset_{}", hash_string);
        let now = Date::now();
        
        let asset_info = AssetInfo {
            id: asset_id.clone(),
            name: filename,
            url: url.clone(),
            xxhash: hash_string.clone(),
            size: data.len() as u64,
            mime_type,
            cached_at: now,
            last_accessed: now,
            download_progress: 100.0,
        };
        
        let cache_entry = AssetCacheEntry {
            info: asset_info,
            data,
        };
        
        // Update cache and stats
        self.cache.insert(asset_id.clone(), cache_entry.clone());
        self.hash_lookup.insert(hash_string, asset_id.clone());
        self.stats.total_assets += 1;
        self.stats.total_size += cache_entry.info.size;
        self.stats.total_downloads += 1;
        
        // Cleanup if cache is too large
        self.cleanup_cache().await;
        
        // Remove from download queue when completed
        self.download_queue.retain(|queued_url| queued_url != &url);
        self.stats.download_queue_size = self.download_queue.len() as u32;
        
        console::log_1(&format!("Asset downloaded and cached: {}", asset_id).into());
        Ok(asset_id)
    }

    #[wasm_bindgen]
    pub fn get_asset_data(&mut self, asset_id: String) -> Option<Vec<u8>> {
        if let Some(entry) = self.cache.get_mut(&asset_id) {
            entry.info.last_accessed = Date::now();
            self.stats.cache_hits += 1;
            Some(entry.data.clone())
        } else {
            self.stats.cache_misses += 1;
            None
        }
    }

    #[wasm_bindgen]
    pub fn get_asset_info(&self, asset_id: String) -> Option<String> {
        self.cache.get(&asset_id)
            .and_then(|entry| serde_json::to_string(&entry.info).ok())
    }

    #[wasm_bindgen]
    pub fn has_asset(&self, asset_id: String) -> bool {
        self.cache.contains_key(&asset_id)
    }

    #[wasm_bindgen]
    pub fn has_asset_by_hash(&self, xxhash: String) -> bool {
        self.hash_lookup.contains_key(&xxhash)
    }

    #[wasm_bindgen]
    pub fn get_asset_by_hash(&mut self, xxhash: String) -> Option<String> {
        if let Some(asset_id) = self.hash_lookup.get(&xxhash).cloned() {
            if let Some(entry) = self.cache.get_mut(&asset_id) {
                entry.info.last_accessed = Date::now();
                self.stats.cache_hits += 1;
                return Some(asset_id);
            }
        }
        self.stats.cache_misses += 1;
        None
    }

    #[wasm_bindgen]
    pub fn remove_asset(&mut self, asset_id: String) -> bool {
        if let Some(entry) = self.cache.remove(&asset_id) {
            self.hash_lookup.remove(&entry.info.xxhash);
            self.stats.total_assets -= 1;
            self.stats.total_size -= entry.info.size;
            true
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub async fn cleanup_cache(&mut self) {
        let now = Date::now();
        let max_age = self.max_age_ms;
        
        // Remove expired assets
        let mut to_remove = Vec::new();
        for (asset_id, entry) in &self.cache {
            if now - entry.info.last_accessed > max_age {
                to_remove.push(asset_id.clone());
            }
        }
        
        for asset_id in to_remove {
            self.remove_asset(asset_id);
        }
        
        // If still over size limit, remove least recently used
        while self.stats.total_size > self.max_cache_size && !self.cache.is_empty() {
            let mut oldest_id = String::new();
            let mut oldest_time = f64::INFINITY;
            
            for (asset_id, entry) in &self.cache {
                if entry.info.last_accessed < oldest_time {
                    oldest_time = entry.info.last_accessed;
                    oldest_id = asset_id.clone();
                }
            }
            
            if !oldest_id.is_empty() {
                self.remove_asset(oldest_id);
            } else {
                break;
            }
        }
        
        self.stats.last_cleanup = now;
        console::log_1(&format!("Cache cleanup completed. Assets: {}, Size: {} bytes", 
            self.stats.total_assets, self.stats.total_size).into());
    }

    #[wasm_bindgen]
    pub fn get_cache_stats(&self) -> String {
        serde_json::to_string(&self.stats).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn list_assets(&self) -> String {
        let asset_list: Vec<&AssetInfo> = self.cache.values().map(|entry| &entry.info).collect();
        serde_json::to_string(&asset_list).unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn set_max_cache_size(&mut self, size_bytes: u64) {
        self.max_cache_size = size_bytes;
    }

    #[wasm_bindgen]
    pub fn set_max_age(&mut self, age_ms: f64) {
        self.max_age_ms = age_ms;
    }

    #[wasm_bindgen]
    pub async fn clear_cache(&mut self) {
        self.cache.clear();
        self.hash_lookup.clear();
        self.stats.total_assets = 0;
        self.stats.total_size = 0;
        
        console::log_1(&"Asset cache cleared".into());
    }

    #[wasm_bindgen]
    pub fn calculate_asset_hash(&self, data: &[u8]) -> String {
        format!("{:016x}", calculate_hash(data))
    }

    #[wasm_bindgen]
    pub fn get_download_queue_size(&self) -> u32 {
        self.download_queue.len() as u32
    }

    #[wasm_bindgen]
    pub fn get_queued_downloads(&self) -> Vec<String> {
        self.download_queue.clone()
    }

    #[wasm_bindgen]
    pub fn clear_download_queue(&mut self) {
        self.download_queue.clear();
        self.stats.download_queue_size = 0;
    }

    #[wasm_bindgen]
    pub fn remove_from_queue(&mut self, url: String) -> bool {
        let initial_len = self.download_queue.len();
        self.download_queue.retain(|queued_url| queued_url != &url);
        let removed = self.download_queue.len() < initial_len;
        if removed {
            self.stats.download_queue_size = self.download_queue.len() as u32;
        }
        removed
    }
}
