/* @ts-self-types="./ttrpg_rust_core.d.ts" */

export class ActionsClient {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ActionsClientFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_actionsclient_free(ptr, 0);
    }
    /**
     * @param {any} actions
     * @returns {any}
     */
    batch_actions(actions) {
        const ret = wasm.actionsclient_batch_actions(this.__wbg_ptr, actions);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    can_redo() {
        const ret = wasm.actionsclient_can_redo(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    can_undo() {
        const ret = wasm.actionsclient_can_undo(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {string} table_id
     * @param {string} layer
     * @param {any} position
     * @param {string} texture_name
     * @returns {any}
     */
    create_sprite(table_id, layer, position, texture_name) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(layer, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(texture_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.actionsclient_create_sprite(this.__wbg_ptr, ptr0, len0, ptr1, len1, position, ptr2, len2);
        return ret;
    }
    /**
     * @param {string} name
     * @param {number} width
     * @param {number} height
     * @returns {any}
     */
    create_table(name, width, height) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.actionsclient_create_table(this.__wbg_ptr, ptr0, len0, width, height);
        return ret;
    }
    /**
     * @param {string} sprite_id
     * @returns {any}
     */
    delete_sprite(sprite_id) {
        const ptr0 = passStringToWasm0(sprite_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.actionsclient_delete_sprite(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @param {string} table_id
     * @returns {any}
     */
    delete_table(table_id) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.actionsclient_delete_table(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    disconnect_network_client() {
        wasm.actionsclient_disconnect_network_client(this.__wbg_ptr);
    }
    /**
     * @returns {any}
     */
    get_action_history() {
        const ret = wasm.actionsclient_get_action_history(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {any}
     */
    get_all_tables() {
        const ret = wasm.actionsclient_get_all_tables(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {string} layer
     * @returns {boolean}
     */
    get_layer_visibility(layer) {
        const ptr0 = passStringToWasm0(layer, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.actionsclient_get_layer_visibility(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * @param {string} sprite_id
     * @returns {any}
     */
    get_sprite_info(sprite_id) {
        const ptr0 = passStringToWasm0(sprite_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.actionsclient_get_sprite_info(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @param {string} layer
     * @returns {any}
     */
    get_sprites_by_layer(layer) {
        const ptr0 = passStringToWasm0(layer, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.actionsclient_get_sprites_by_layer(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @param {string} table_id
     * @returns {any}
     */
    get_table_info(table_id) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.actionsclient_get_table_info(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    is_network_connected() {
        const ret = wasm.actionsclient_is_network_connected(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {string} sprite_id
     * @param {string} new_layer
     * @returns {any}
     */
    move_sprite_to_layer(sprite_id, new_layer) {
        const ptr0 = passStringToWasm0(sprite_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(new_layer, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.actionsclient_move_sprite_to_layer(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret;
    }
    constructor() {
        const ret = wasm.actionsclient_new();
        this.__wbg_ptr = ret >>> 0;
        ActionsClientFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {any}
     */
    redo() {
        const ret = wasm.actionsclient_redo(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {Function} callback
     */
    set_action_handler(callback) {
        wasm.actionsclient_set_action_handler(this.__wbg_ptr, callback);
    }
    /**
     * @param {boolean} enabled
     */
    set_auto_sync(enabled) {
        wasm.actionsclient_set_auto_sync(this.__wbg_ptr, enabled);
    }
    /**
     * @param {Function} callback
     */
    set_error_handler(callback) {
        wasm.actionsclient_set_error_handler(this.__wbg_ptr, callback);
    }
    /**
     * @param {string} layer
     * @param {boolean} visible
     * @returns {any}
     */
    set_layer_visibility(layer, visible) {
        const ptr0 = passStringToWasm0(layer, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.actionsclient_set_layer_visibility(this.__wbg_ptr, ptr0, len0, visible);
        return ret;
    }
    /**
     * @param {NetworkClient} network_client
     */
    set_network_client(network_client) {
        _assertClass(network_client, NetworkClient);
        wasm.actionsclient_set_network_client(this.__wbg_ptr, network_client.__wbg_ptr);
    }
    /**
     * @param {Function} callback
     */
    set_state_change_handler(callback) {
        wasm.actionsclient_set_state_change_handler(this.__wbg_ptr, callback);
    }
    /**
     * @returns {any}
     */
    undo() {
        const ret = wasm.actionsclient_undo(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {string} sprite_id
     * @param {any} updates
     * @returns {any}
     */
    update_sprite(sprite_id, updates) {
        const ptr0 = passStringToWasm0(sprite_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.actionsclient_update_sprite(this.__wbg_ptr, ptr0, len0, updates);
        return ret;
    }
    /**
     * @param {string} table_id
     * @param {any} updates
     * @returns {any}
     */
    update_table(table_id, updates) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.actionsclient_update_table(this.__wbg_ptr, ptr0, len0, updates);
        return ret;
    }
}
if (Symbol.dispose) ActionsClient.prototype[Symbol.dispose] = ActionsClient.prototype.free;

export class AssetManager {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AssetManagerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_assetmanager_free(ptr, 0);
    }
    /**
     * @param {Uint8Array} data
     * @returns {string}
     */
    calculate_asset_hash(data) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.assetmanager_calculate_asset_hash(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @returns {Promise<void>}
     */
    cleanup_cache() {
        const ret = wasm.assetmanager_cleanup_cache(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Promise<void>}
     */
    clear_cache() {
        const ret = wasm.assetmanager_clear_cache(this.__wbg_ptr);
        return ret;
    }
    clear_download_queue() {
        wasm.assetmanager_clear_download_queue(this.__wbg_ptr);
    }
    /**
     * @param {string} url
     * @param {string | null} [expected_hash]
     * @returns {Promise<string>}
     */
    download_asset(url, expected_hash) {
        const ptr0 = passStringToWasm0(url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(expected_hash) ? 0 : passStringToWasm0(expected_hash, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.assetmanager_download_asset(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret;
    }
    /**
     * @param {string} xxhash
     * @returns {string | undefined}
     */
    get_asset_by_hash(xxhash) {
        const ptr0 = passStringToWasm0(xxhash, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.assetmanager_get_asset_by_hash(this.__wbg_ptr, ptr0, len0);
        let v2;
        if (ret[0] !== 0) {
            v2 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v2;
    }
    /**
     * @param {string} asset_id
     * @returns {Uint8Array | undefined}
     */
    get_asset_data(asset_id) {
        const ptr0 = passStringToWasm0(asset_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.assetmanager_get_asset_data(this.__wbg_ptr, ptr0, len0);
        let v2;
        if (ret[0] !== 0) {
            v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v2;
    }
    /**
     * @param {string} asset_id
     * @returns {string | undefined}
     */
    get_asset_info(asset_id) {
        const ptr0 = passStringToWasm0(asset_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.assetmanager_get_asset_info(this.__wbg_ptr, ptr0, len0);
        let v2;
        if (ret[0] !== 0) {
            v2 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v2;
    }
    /**
     * @returns {string}
     */
    get_cache_stats() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.assetmanager_get_cache_stats(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    get_download_queue_size() {
        const ret = wasm.assetmanager_get_download_queue_size(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string[]}
     */
    get_queued_downloads() {
        const ret = wasm.assetmanager_get_queued_downloads(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @param {string} asset_id
     * @returns {boolean}
     */
    has_asset(asset_id) {
        const ptr0 = passStringToWasm0(asset_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.assetmanager_has_asset(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * @param {string} xxhash
     * @returns {boolean}
     */
    has_asset_by_hash(xxhash) {
        const ptr0 = passStringToWasm0(xxhash, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.assetmanager_has_asset_by_hash(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * @returns {Promise<void>}
     */
    initialize() {
        const ret = wasm.assetmanager_initialize(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    list_assets() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.assetmanager_list_assets(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    constructor() {
        const ret = wasm.assetmanager_new();
        this.__wbg_ptr = ret >>> 0;
        AssetManagerFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {string} asset_id
     * @returns {boolean}
     */
    remove_asset(asset_id) {
        const ptr0 = passStringToWasm0(asset_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.assetmanager_remove_asset(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * @param {string} url
     * @returns {boolean}
     */
    remove_from_queue(url) {
        const ptr0 = passStringToWasm0(url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.assetmanager_remove_from_queue(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * @param {number} age_ms
     */
    set_max_age(age_ms) {
        wasm.assetmanager_set_max_age(this.__wbg_ptr, age_ms);
    }
    /**
     * @param {bigint} size_bytes
     */
    set_max_cache_size(size_bytes) {
        wasm.assetmanager_set_max_cache_size(this.__wbg_ptr, size_bytes);
    }
}
if (Symbol.dispose) AssetManager.prototype[Symbol.dispose] = AssetManager.prototype.free;

/**
 * Server-mirrored collision system for client-side planning previews.
 * Both Python and Rust implement identical logic.
 */
export class CollisionSystem {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CollisionSystemFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_collisionsystem_free(ptr, 0);
    }
    /**
     * Grid-aware distance in feet
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @param {number} ft_per_unit
     * @returns {number}
     */
    distance_ft(x1, y1, x2, y2, ft_per_unit) {
        const ret = wasm.collisionsystem_distance_ft(this.__wbg_ptr, x1, y1, x2, y2, ft_per_unit);
        return ret;
    }
    /**
     * A* pathfinding. Returns flat [x1,y1,x2,y2,...] waypoints or empty on failure.
     * @param {number} sx
     * @param {number} sy
     * @param {number} ex
     * @param {number} ey
     * @returns {Float32Array}
     */
    find_path(sx, sy, ex, ey) {
        const ret = wasm.collisionsystem_find_path(this.__wbg_ptr, sx, sy, ex, ey);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * True if the line segment from (x1,y1) to (x2,y2) is blocked.
     * Uses spatial hash when available; falls back to linear scan.
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @returns {boolean}
     */
    line_blocked(x1, y1, x2, y2) {
        const ret = wasm.collisionsystem_line_blocked(this.__wbg_ptr, x1, y1, x2, y2);
        return ret !== 0;
    }
    /**
     * BFS reachable cells for movement range overlay
     * @param {number} sx
     * @param {number} sy
     * @param {number} speed_ft
     * @param {number} ft_per_unit
     * @param {boolean} diagonal_5_10_5
     * @returns {any}
     */
    movement_range(sx, sy, speed_ft, ft_per_unit, diagonal_5_10_5) {
        const ret = wasm.collisionsystem_movement_range(this.__wbg_ptr, sx, sy, speed_ft, ft_per_unit, diagonal_5_10_5);
        return ret;
    }
    /**
     * @param {number} grid_size
     */
    constructor(grid_size) {
        const ret = wasm.collisionsystem_new(grid_size);
        this.__wbg_ptr = ret >>> 0;
        CollisionSystemFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Rebuild spatial hash index after walls/obstacles change.
     */
    rebuild_index() {
        wasm.collisionsystem_rebuild_index(this.__wbg_ptr);
    }
    /**
     * Load obstacles from JSON array: [{id,obstacle_type,x,y,width,height,radius,vertices?}, ...]
     * @param {string} json
     */
    set_obstacles(json) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.collisionsystem_set_obstacles(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Load walls from JSON array: [{x1,y1,x2,y2,is_door,door_open}, ...]
     * @param {string} json
     */
    set_walls(json) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.collisionsystem_set_walls(this.__wbg_ptr, ptr0, len0);
    }
}
if (Symbol.dispose) CollisionSystem.prototype[Symbol.dispose] = CollisionSystem.prototype.free;

export class NetworkClient {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        NetworkClientFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_networkclient_free(ptr, 0);
    }
    /**
     * @param {string} username
     * @param {string} password
     */
    authenticate(username, password) {
        const ptr0 = passStringToWasm0(username, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(password, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.networkclient_authenticate(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} asset_id
     * @param {boolean} upload_success
     */
    confirm_asset_upload(asset_id, upload_success) {
        const ptr0 = passStringToWasm0(asset_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.networkclient_confirm_asset_upload(this.__wbg_ptr, ptr0, len0, upload_success);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} url
     */
    connect(url) {
        const ptr0 = passStringToWasm0(url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.networkclient_connect(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    disconnect() {
        wasm.networkclient_disconnect(this.__wbg_ptr);
    }
    /**
     * @returns {string}
     */
    get_client_id() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.networkclient_get_client_id(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get_connection_state() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.networkclient_get_connection_state(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string | undefined}
     */
    get_session_code() {
        const ret = wasm.networkclient_get_session_code(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @returns {string | undefined}
     */
    get_username() {
        const ret = wasm.networkclient_get_username(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @returns {boolean}
     */
    is_connected() {
        const ret = wasm.networkclient_is_connected(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {string} session_code
     */
    join_session(session_code) {
        const ptr0 = passStringToWasm0(session_code, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.networkclient_join_session(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    constructor() {
        const ret = wasm.networkclient_new();
        this.__wbg_ptr = ret >>> 0;
        NetworkClientFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {string} asset_id
     */
    request_asset_download(asset_id) {
        const ptr0 = passStringToWasm0(asset_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.networkclient_request_asset_download(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} filename
     * @param {string} file_hash
     * @param {bigint} file_size
     */
    request_asset_upload(filename, file_hash, file_size) {
        const ptr0 = passStringToWasm0(filename, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(file_hash, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.networkclient_request_asset_upload(this.__wbg_ptr, ptr0, len0, ptr1, len1, file_size);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    request_player_list() {
        const ret = wasm.networkclient_request_player_list(this.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    request_table_list() {
        const ret = wasm.networkclient_request_table_list(this.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} message_type
     * @param {any} data
     */
    send_message(message_type, data) {
        const ptr0 = passStringToWasm0(message_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.networkclient_send_message(this.__wbg_ptr, ptr0, len0, data);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} table_name
     */
    send_new_table_request(table_name) {
        const ptr0 = passStringToWasm0(table_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.networkclient_send_new_table_request(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    send_ping() {
        const ret = wasm.networkclient_send_ping(this.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {any} sprite_data
     */
    send_sprite_create(sprite_data) {
        const ret = wasm.networkclient_send_sprite_create(this.__wbg_ptr, sprite_data);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} sprite_id
     */
    send_sprite_remove(sprite_id) {
        const ptr0 = passStringToWasm0(sprite_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.networkclient_send_sprite_remove(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {any} sprite_data
     */
    send_sprite_update(sprite_data) {
        const ret = wasm.networkclient_send_sprite_update(this.__wbg_ptr, sprite_data);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {any} request_data
     */
    send_table_request(request_data) {
        const ret = wasm.networkclient_send_table_request(this.__wbg_ptr, request_data);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {any} table_data
     */
    send_table_update(table_data) {
        const ret = wasm.networkclient_send_table_update(this.__wbg_ptr, table_data);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {Function} callback
     */
    set_connection_handler(callback) {
        wasm.networkclient_set_connection_handler(this.__wbg_ptr, callback);
    }
    /**
     * @param {Function} callback
     */
    set_error_handler(callback) {
        wasm.networkclient_set_error_handler(this.__wbg_ptr, callback);
    }
    /**
     * @param {Function} callback
     */
    set_message_handler(callback) {
        wasm.networkclient_set_message_handler(this.__wbg_ptr, callback);
    }
    /**
     * @param {number} user_id
     * @param {string} username
     * @param {string | null} [session_code]
     * @param {string | null} [jwt_token]
     */
    set_user_info(user_id, username, session_code, jwt_token) {
        const ptr0 = passStringToWasm0(username, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(session_code) ? 0 : passStringToWasm0(session_code, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        var ptr2 = isLikeNone(jwt_token) ? 0 : passStringToWasm0(jwt_token, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len2 = WASM_VECTOR_LEN;
        wasm.networkclient_set_user_info(this.__wbg_ptr, user_id, ptr0, len0, ptr1, len1, ptr2, len2);
    }
    /**
     * @param {string} action_data
     */
    sync_action(action_data) {
        const ptr0 = passStringToWasm0(action_data, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.networkclient_sync_action(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) NetworkClient.prototype[Symbol.dispose] = NetworkClient.prototype.free;

export class PaintSystem {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PaintSystemFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_paintsystem_free(ptr, 0);
    }
    /**
     * Add a stroke from a remote client (already-serialized JSON blob from server).
     * @param {string} stroke_json
     * @returns {boolean}
     */
    add_remote_stroke_json(stroke_json) {
        const ptr0 = passStringToWasm0(stroke_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.paintsystem_add_remote_stroke_json(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * @param {number} world_x
     * @param {number} world_y
     * @param {number} pressure
     * @returns {boolean}
     */
    add_stroke_point(world_x, world_y, pressure) {
        const ret = wasm.paintsystem_add_stroke_point(this.__wbg_ptr, world_x, world_y, pressure);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    can_redo() {
        const ret = wasm.paintsystem_can_redo(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    can_undo() {
        const ret = wasm.paintsystem_can_undo(this.__wbg_ptr);
        return ret !== 0;
    }
    clear_all_strokes() {
        wasm.paintsystem_clear_all_strokes(this.__wbg_ptr);
    }
    /**
     * @returns {boolean}
     */
    end_stroke() {
        const ret = wasm.paintsystem_end_stroke(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {number} width
     * @param {number} height
     */
    enter_paint_mode(width, height) {
        wasm.paintsystem_enter_paint_mode(this.__wbg_ptr, width, height);
    }
    exit_paint_mode() {
        wasm.paintsystem_exit_paint_mode(this.__wbg_ptr);
    }
    /**
     * @returns {any}
     */
    get_all_strokes_json() {
        const ret = wasm.paintsystem_get_all_strokes_json(this.__wbg_ptr);
        return ret;
    }
    /**
     * Bulk-load a JSON array of DrawStroke objects, replacing all existing strokes for the current table.
     * @param {string} strokes_json
     * @returns {boolean}
     */
    load_strokes_json(strokes_json) {
        const ptr0 = passStringToWasm0(strokes_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.paintsystem_load_strokes_json(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    constructor() {
        const ret = wasm.paintsystem_new();
        this.__wbg_ptr = ret >>> 0;
        PaintSystemFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {boolean}
     */
    redo_last_stroke() {
        const ret = wasm.paintsystem_redo_last_stroke(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Remove a specific stroke by its id from the current table.
     * @param {string} stroke_id
     * @returns {boolean}
     */
    remove_stroke_by_id(stroke_id) {
        const ptr0 = passStringToWasm0(stroke_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.paintsystem_remove_stroke_by_id(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * @param {string} blend_mode
     */
    set_blend_mode(blend_mode) {
        const ptr0 = passStringToWasm0(blend_mode, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.paintsystem_set_blend_mode(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {number} r
     * @param {number} g
     * @param {number} b
     * @param {number} a
     */
    set_brush_color(r, g, b, a) {
        wasm.paintsystem_set_brush_color(this.__wbg_ptr, r, g, b, a);
    }
    /**
     * @param {number} width
     */
    set_brush_width(width) {
        wasm.paintsystem_set_brush_width(this.__wbg_ptr, width);
    }
    /**
     * @param {string} table_id
     */
    set_current_table(table_id) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.paintsystem_set_current_table(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {number} world_x
     * @param {number} world_y
     * @param {number} pressure
     * @returns {boolean}
     */
    start_stroke(world_x, world_y, pressure) {
        const ret = wasm.paintsystem_start_stroke(this.__wbg_ptr, world_x, world_y, pressure);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    undo_last_stroke() {
        const ret = wasm.paintsystem_undo_last_stroke(this.__wbg_ptr);
        return ret !== 0;
    }
}
if (Symbol.dispose) PaintSystem.prototype[Symbol.dispose] = PaintSystem.prototype.free;

/**
 * Client-side planning layer — computes previews without mutating game state.
 * All results are read-only overlays on top of committed state.
 */
export class PlanningManager {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PlanningManagerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_planningmanager_free(ptr, 0);
    }
    /**
     * Remove all ghost previews
     */
    clear_all() {
        wasm.planningmanager_clear_all(this.__wbg_ptr);
    }
    clear_aoe() {
        wasm.planningmanager_clear_aoe(this.__wbg_ptr);
    }
    /**
     * Remove a ghost token preview
     * @param {string} sprite_id
     */
    clear_ghost(sprite_id) {
        const ptr0 = passStringToWasm0(sprite_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.planningmanager_clear_ghost(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Get current AoE template as JSON
     * @returns {any}
     */
    get_aoe() {
        const ret = wasm.planningmanager_get_aoe(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get a single ghost token as JSON
     * @param {string} sprite_id
     * @returns {any}
     */
    get_ghost(sprite_id) {
        const ptr0 = passStringToWasm0(sprite_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.planningmanager_get_ghost(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * Get all ghost tokens as JSON
     * @returns {any}
     */
    get_ghosts() {
        const ret = wasm.planningmanager_get_ghosts(this.__wbg_ptr);
        return ret;
    }
    /**
     * True if there is clear line of sight from (x1,y1) to (x2,y2)
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @returns {boolean}
     */
    has_los(x1, y1, x2, y2) {
        const ret = wasm.planningmanager_has_los(this.__wbg_ptr, x1, y1, x2, y2);
        return ret !== 0;
    }
    /**
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @returns {number}
     */
    measure_ft(x1, y1, x2, y2) {
        const ret = wasm.planningmanager_measure_ft(this.__wbg_ptr, x1, y1, x2, y2);
        return ret;
    }
    /**
     * Compute movement range BFS. Returns JSON with {normal, dash, blocked} cell arrays.
     * @param {number} sx
     * @param {number} sy
     * @param {number} speed_ft
     * @param {boolean} diagonal_5_10_5
     * @returns {any}
     */
    movement_range(sx, sy, speed_ft, diagonal_5_10_5) {
        const ret = wasm.planningmanager_movement_range(this.__wbg_ptr, sx, sy, speed_ft, diagonal_5_10_5);
        return ret;
    }
    /**
     * @param {number} grid_size
     * @param {number} ft_per_unit
     */
    constructor(grid_size, ft_per_unit) {
        const ret = wasm.planningmanager_new(grid_size, ft_per_unit);
        this.__wbg_ptr = ret >>> 0;
        PlanningManagerFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Set cone AoE template (angle in radians)
     * @param {number} ox
     * @param {number} oy
     * @param {number} angle
     * @param {number} length
     */
    set_aoe_cone(ox, oy, angle, length) {
        wasm.planningmanager_set_aoe_cone(this.__wbg_ptr, ox, oy, angle, length);
    }
    /**
     * Set cube AoE template
     * @param {number} cx
     * @param {number} cy
     * @param {number} side
     */
    set_aoe_cube(cx, cy, side) {
        wasm.planningmanager_set_aoe_cube(this.__wbg_ptr, cx, cy, side);
    }
    /**
     * Set line AoE template
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @param {number} width
     */
    set_aoe_line(x1, y1, x2, y2, width) {
        wasm.planningmanager_set_aoe_line(this.__wbg_ptr, x1, y1, x2, y2, width);
    }
    /**
     * Set sphere AoE template
     * @param {number} cx
     * @param {number} cy
     * @param {number} radius
     */
    set_aoe_sphere(cx, cy, radius) {
        wasm.planningmanager_set_aoe_sphere(this.__wbg_ptr, cx, cy, radius);
    }
    /**
     * @param {string} json
     */
    set_obstacles(json) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.planningmanager_set_obstacles(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string} json
     */
    set_walls(json) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.planningmanager_set_walls(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Start previewing a token move. Returns movement cost in feet.
     * @param {string} sprite_id
     * @param {number} real_x
     * @param {number} real_y
     * @param {number} preview_x
     * @param {number} preview_y
     * @param {number} speed_ft
     * @returns {number}
     */
    start_ghost(sprite_id, real_x, real_y, preview_x, preview_y, speed_ft) {
        const ptr0 = passStringToWasm0(sprite_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.planningmanager_start_ghost(this.__wbg_ptr, ptr0, len0, real_x, real_y, preview_x, preview_y, speed_ft);
        return ret;
    }
    /**
     * Given token positions (flat [x1,y1,x2,y2,...]), returns indices of tokens in AoE
     * @param {Float32Array} positions_flat
     * @returns {any}
     */
    tokens_in_aoe(positions_flat) {
        const ret = wasm.planningmanager_tokens_in_aoe(this.__wbg_ptr, positions_flat);
        return ret;
    }
}
if (Symbol.dispose) PlanningManager.prototype[Symbol.dispose] = PlanningManager.prototype.free;

export class RenderEngine {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(RenderEngine.prototype);
        obj.__wbg_ptr = ptr;
        RenderEngineFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RenderEngineFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_renderengine_free(ptr, 0);
    }
    /**
     * @param {string} id
     * @param {any} polygon
     */
    add_fog_polygon(id, polygon) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_add_fog_polygon(this.__wbg_ptr, ptr0, len0, polygon);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} id
     * @param {number} start_x
     * @param {number} start_y
     * @param {number} end_x
     * @param {number} end_y
     * @param {string} mode
     */
    add_fog_rectangle(id, start_x, start_y, end_x, end_y, mode) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(mode, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.renderengine_add_fog_rectangle(this.__wbg_ptr, ptr0, len0, start_x, start_y, end_x, end_y, ptr1, len1);
    }
    /**
     * @param {string} id
     * @param {number} x
     * @param {number} y
     */
    add_light(id, x, y) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.renderengine_add_light(this.__wbg_ptr, ptr0, len0, x, y);
    }
    /**
     * @param {string} layer_name
     * @param {any} sprite_data
     * @returns {string}
     */
    add_sprite_to_layer(layer_name, sprite_data) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(layer_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.renderengine_add_sprite_to_layer(this.__wbg_ptr, ptr0, len0, sprite_data);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * @param {string} wall_json
     * @returns {boolean}
     */
    add_wall(wall_json) {
        const ptr0 = passStringToWasm0(wall_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_add_wall(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * Snap all currently selected sprites to the nearest grid cell corner.
     */
    align_selected_to_grid() {
        wasm.renderengine_align_selected_to_grid(this.__wbg_ptr);
    }
    /**
     * @param {any} actions
     * @returns {any}
     */
    batch_actions(actions) {
        const ret = wasm.renderengine_batch_actions(this.__wbg_ptr, actions);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    can_redo() {
        const ret = wasm.renderengine_can_redo(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    can_undo() {
        const ret = wasm.renderengine_can_undo(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Cancel an in-progress draw/create operation without changing the active tool.
     * @returns {boolean}
     */
    cancel_current_operation() {
        const ret = wasm.renderengine_cancel_current_operation(this.__wbg_ptr);
        return ret !== 0;
    }
    clear_fog() {
        wasm.renderengine_clear_fog(this.__wbg_ptr);
    }
    /**
     * @param {string} layer_name
     * @returns {boolean}
     */
    clear_layer(layer_name) {
        const ptr0 = passStringToWasm0(layer_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_clear_layer(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    clear_runtime_event_handler() {
        wasm.renderengine_clear_runtime_event_handler(this.__wbg_ptr);
    }
    clear_runtime_operation_handler() {
        wasm.renderengine_clear_runtime_operation_handler(this.__wbg_ptr);
    }
    /**
     * Clear current selection
     */
    clear_selection() {
        wasm.renderengine_clear_selection(this.__wbg_ptr);
    }
    clear_walls() {
        wasm.renderengine_clear_walls(this.__wbg_ptr);
    }
    /**
     * @param {string} sprite_id
     * @returns {string | undefined}
     */
    copy_sprite(sprite_id) {
        const ptr0 = passStringToWasm0(sprite_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_copy_sprite(this.__wbg_ptr, ptr0, len0);
        let v2;
        if (ret[0] !== 0) {
            v2 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v2;
    }
    /**
     * @returns {string | undefined}
     */
    get_active_table_id() {
        const ret = wasm.renderengine_get_active_table_id(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    get_active_table_world_bounds() {
        const ret = wasm.renderengine_get_active_table_world_bounds(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @param {number} screen_x
     * @param {number} screen_y
     * @returns {string}
     */
    get_cursor_type(screen_x, screen_y) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.renderengine_get_cursor_type(this.__wbg_ptr, screen_x, screen_y);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string[]}
     */
    get_layer_names() {
        const ret = wasm.renderengine_get_layer_names(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @param {string} layer_name
     * @returns {number}
     */
    get_layer_sprite_count(layer_name) {
        const ptr0 = passStringToWasm0(layer_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_get_layer_sprite_count(this.__wbg_ptr, ptr0, len0);
        return ret >>> 0;
    }
    /**
     * @returns {Float32Array}
     */
    get_obstacle_segments_flat() {
        const ret = wasm.renderengine_get_obstacle_segments_flat(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get list of currently selected sprite IDs.
     * @returns {string[]}
     */
    get_selected_sprites() {
        const ret = wasm.renderengine_get_selected_sprites(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Get list of currently selected wall IDs.
     * @returns {string[]}
     */
    get_selected_walls() {
        const ret = wasm.renderengine_get_selected_walls(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Get sprite position for movement operations
     * @param {string} sprite_id
     * @returns {Float32Array | undefined}
     */
    get_sprite_position(sprite_id) {
        const ptr0 = passStringToWasm0(sprite_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_get_sprite_position(this.__wbg_ptr, ptr0, len0);
        let v2;
        if (ret[0] !== 0) {
            v2 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        }
        return v2;
    }
    /**
     * Get sprite scale for scaling operations
     * @param {string} sprite_id
     * @returns {Float32Array | undefined}
     */
    get_sprite_scale(sprite_id) {
        const ptr0 = passStringToWasm0(sprite_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_get_sprite_scale(this.__wbg_ptr, ptr0, len0);
        let v2;
        if (ret[0] !== 0) {
            v2 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        }
        return v2;
    }
    /**
     * Returns wall IDs in the same order as get_wall_render_data().
     * @returns {any[]}
     */
    get_wall_ids() {
        const ret = wasm.renderengine_get_wall_ids(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Float32Array}
     */
    get_wall_render_data() {
        const ret = wasm.renderengine_get_wall_render_data(this.__wbg_ptr);
        return ret;
    }
    /**
     * Full modifier support: ctrl for multi-select, alt to disable grid snap.
     * @param {number} screen_x
     * @param {number} screen_y
     * @param {boolean} ctrl_pressed
     * @param {boolean} alt_pressed
     * @returns {string | undefined}
     */
    handle_mouse_down_full(screen_x, screen_y, ctrl_pressed, alt_pressed) {
        const ret = wasm.renderengine_handle_mouse_down_full(this.__wbg_ptr, screen_x, screen_y, ctrl_pressed, alt_pressed);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @param {number} screen_x
     * @param {number} screen_y
     */
    handle_mouse_move(screen_x, screen_y) {
        wasm.renderengine_handle_mouse_move(this.__wbg_ptr, screen_x, screen_y);
    }
    /**
     * @param {number} screen_x
     * @param {number} screen_y
     */
    handle_mouse_up(screen_x, screen_y) {
        wasm.renderengine_handle_mouse_up(this.__wbg_ptr, screen_x, screen_y);
    }
    /**
     * @param {number} screen_x
     * @param {number} screen_y
     * @returns {string | undefined}
     */
    handle_right_click(screen_x, screen_y) {
        const ret = wasm.renderengine_handle_right_click(this.__wbg_ptr, screen_x, screen_y);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Handle table data received from server
     * @param {any} table_data_js
     */
    handle_table_data(table_data_js) {
        const ret = wasm.renderengine_handle_table_data(this.__wbg_ptr, table_data_js);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} screen_x
     * @param {number} screen_y
     * @param {number} delta_y
     */
    handle_wheel(screen_x, screen_y, delta_y) {
        wasm.renderengine_handle_wheel(this.__wbg_ptr, screen_x, screen_y, delta_y);
    }
    /**
     * @param {number} table_width
     * @param {number} table_height
     */
    hide_entire_table(table_width, table_height) {
        wasm.renderengine_hide_entire_table(this.__wbg_ptr, table_width, table_height);
    }
    /**
     * @returns {boolean}
     */
    is_in_fog_draw_mode() {
        const ret = wasm.renderengine_is_in_fog_draw_mode(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    is_in_light_drag_mode() {
        const ret = wasm.renderengine_is_in_light_drag_mode(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    is_point_in_fog(x, y) {
        const ret = wasm.renderengine_is_point_in_fog(this.__wbg_ptr, x, y);
        return ret !== 0;
    }
    /**
     * @param {string} name
     * @param {HTMLImageElement} image
     */
    load_texture(name, image) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_load_texture(this.__wbg_ptr, ptr0, len0, image);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} sprite_id
     * @param {string} new_layer
     * @returns {boolean}
     */
    move_sprite_to_layer(sprite_id, new_layer) {
        const ptr0 = passStringToWasm0(sprite_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(new_layer, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_move_sprite_to_layer(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret !== 0;
    }
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        const ret = wasm.renderengine_new(canvas);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        RenderEngineFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} world_x
     * @param {number} world_y
     * @param {number} pressure
     * @returns {boolean}
     */
    paint_add_point(world_x, world_y, pressure) {
        const ret = wasm.renderengine_paint_add_point(this.__wbg_ptr, world_x, world_y, pressure);
        return ret !== 0;
    }
    /**
     * @param {string} stroke_json
     * @returns {boolean}
     */
    paint_add_remote_stroke(stroke_json) {
        const ptr0 = passStringToWasm0(stroke_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_paint_add_remote_stroke(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    paint_can_redo() {
        const ret = wasm.renderengine_paint_can_redo(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    paint_can_undo() {
        const ret = wasm.renderengine_paint_can_undo(this.__wbg_ptr);
        return ret !== 0;
    }
    paint_cancel_stroke() {
        wasm.renderengine_paint_cancel_stroke(this.__wbg_ptr);
    }
    paint_clear_all() {
        wasm.renderengine_paint_clear_all(this.__wbg_ptr);
    }
    /**
     * @returns {boolean}
     */
    paint_end_stroke() {
        const ret = wasm.renderengine_paint_end_stroke(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {number} width
     * @param {number} height
     */
    paint_enter_mode(width, height) {
        wasm.renderengine_paint_enter_mode(this.__wbg_ptr, width, height);
    }
    paint_exit_mode() {
        wasm.renderengine_paint_exit_mode(this.__wbg_ptr);
    }
    /**
     * @returns {any}
     */
    paint_get_strokes() {
        const ret = wasm.renderengine_paint_get_strokes(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {string} strokes_json
     * @returns {boolean}
     */
    paint_load_strokes(strokes_json) {
        const ptr0 = passStringToWasm0(strokes_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_paint_load_strokes(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    paint_redo_stroke() {
        const ret = wasm.renderengine_paint_redo_stroke(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {string} stroke_id
     * @returns {boolean}
     */
    paint_remove_stroke(stroke_id) {
        const ptr0 = passStringToWasm0(stroke_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_paint_remove_stroke(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * @param {string} blend_mode
     */
    paint_set_blend_mode(blend_mode) {
        const ptr0 = passStringToWasm0(blend_mode, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.renderengine_paint_set_blend_mode(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {number} r
     * @param {number} g
     * @param {number} b
     * @param {number} a
     */
    paint_set_brush_color(r, g, b, a) {
        wasm.renderengine_paint_set_brush_color(this.__wbg_ptr, r, g, b, a);
    }
    /**
     * @param {number} width
     */
    paint_set_brush_width(width) {
        wasm.renderengine_paint_set_brush_width(this.__wbg_ptr, width);
    }
    /**
     * @param {string} table_id
     */
    paint_set_current_table(table_id) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.renderengine_paint_set_current_table(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {number} world_x
     * @param {number} world_y
     * @param {number} pressure
     * @returns {boolean}
     */
    paint_start_stroke(world_x, world_y, pressure) {
        const ret = wasm.renderengine_paint_start_stroke(this.__wbg_ptr, world_x, world_y, pressure);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    paint_undo_stroke() {
        const ret = wasm.renderengine_paint_undo_stroke(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {string} layer_name
     * @param {string} sprite_json
     * @param {number} offset_x
     * @param {number} offset_y
     * @returns {string}
     */
    paste_sprite(layer_name, sprite_json, offset_x, offset_y) {
        let deferred4_0;
        let deferred4_1;
        try {
            const ptr0 = passStringToWasm0(layer_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(sprite_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.renderengine_paste_sprite(this.__wbg_ptr, ptr0, len0, ptr1, len1, offset_x, offset_y);
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0; len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
    }
    /**
     * @param {string} id
     */
    remove_fog_polygon(id) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.renderengine_remove_fog_polygon(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string} id
     */
    remove_fog_rectangle(id) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.renderengine_remove_fog_rectangle(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string} id
     */
    remove_light(id) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.renderengine_remove_light(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Remove all selected walls and return the deleted IDs.
     * @returns {string[]}
     */
    remove_selected_walls() {
        const ret = wasm.renderengine_remove_selected_walls(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @param {string} sprite_id
     * @returns {boolean}
     */
    remove_sprite(sprite_id) {
        const ptr0 = passStringToWasm0(sprite_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_remove_sprite(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * @param {string} wall_id
     * @returns {boolean}
     */
    remove_wall(wall_id) {
        const ptr0 = passStringToWasm0(wall_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_remove_wall(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    render() {
        const ret = wasm.renderengine_render(this.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} width
     * @param {number} height
     */
    resize_canvas(width, height) {
        wasm.renderengine_resize_canvas(this.__wbg_ptr, width, height);
    }
    /**
     * @param {string} sprite_id
     * @param {number} new_width
     * @param {number} new_height
     * @returns {boolean}
     */
    resize_sprite(sprite_id, new_width, new_height) {
        const ptr0 = passStringToWasm0(sprite_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_resize_sprite(this.__wbg_ptr, ptr0, len0, new_width, new_height);
        return ret !== 0;
    }
    /**
     * @param {string} sprite_id
     * @param {number} rotation_degrees
     * @returns {boolean}
     */
    rotate_sprite(sprite_id, rotation_degrees) {
        const ptr0 = passStringToWasm0(sprite_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_rotate_sprite(this.__wbg_ptr, ptr0, len0, rotation_degrees);
        return ret !== 0;
    }
    /**
     * @param {number} screen_x
     * @param {number} screen_y
     * @returns {Float64Array}
     */
    screen_to_world(screen_x, screen_y) {
        const ret = wasm.renderengine_screen_to_world(this.__wbg_ptr, screen_x, screen_y);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Select all sprites in all layers
     */
    select_all_sprites() {
        wasm.renderengine_select_all_sprites(this.__wbg_ptr);
    }
    /**
     * @param {string} layer_name
     */
    set_active_layer(layer_name) {
        const ptr0 = passStringToWasm0(layer_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.renderengine_set_active_layer(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {boolean} alt
     */
    set_alt_pressed(alt) {
        wasm.renderengine_set_alt_pressed(this.__wbg_ptr, alt);
    }
    /**
     * @param {number} level
     */
    set_ambient_light(level) {
        wasm.renderengine_set_ambient_light(this.__wbg_ptr, level);
    }
    /**
     * @param {string} hex
     */
    set_background_color(hex) {
        const ptr0 = passStringToWasm0(hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.renderengine_set_background_color(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {number} world_x
     * @param {number} world_y
     * @param {number} zoom
     */
    set_camera(world_x, world_y, zoom) {
        wasm.renderengine_set_camera(this.__wbg_ptr, world_x, world_y, zoom);
    }
    /**
     * @param {number} user_id
     */
    set_current_user_id(user_id) {
        wasm.renderengine_set_current_user_id(this.__wbg_ptr, user_id);
    }
    /**
     * @param {boolean} enabled
     */
    set_dynamic_lighting_enabled(enabled) {
        wasm.renderengine_set_dynamic_lighting_enabled(this.__wbg_ptr, enabled);
    }
    /**
     * @param {boolean} is_gm
     */
    set_gm_mode(is_gm) {
        wasm.renderengine_set_gm_mode(this.__wbg_ptr, is_gm);
    }
    /**
     * @param {boolean} enabled
     */
    set_grid_enabled(enabled) {
        wasm.renderengine_set_grid_enabled(this.__wbg_ptr, enabled);
    }
    /**
     * @param {number} size
     */
    set_grid_size(size) {
        wasm.renderengine_set_grid_size(this.__wbg_ptr, size);
    }
    /**
     * @param {boolean} enabled
     */
    set_grid_snapping(enabled) {
        wasm.renderengine_set_grid_snapping(this.__wbg_ptr, enabled);
    }
    set_input_mode_create_circle() {
        wasm.renderengine_set_input_mode_create_circle(this.__wbg_ptr);
    }
    set_input_mode_create_line() {
        wasm.renderengine_set_input_mode_create_line(this.__wbg_ptr);
    }
    set_input_mode_create_polygon() {
        wasm.renderengine_set_input_mode_create_polygon(this.__wbg_ptr);
    }
    set_input_mode_create_rectangle() {
        wasm.renderengine_set_input_mode_create_rectangle(this.__wbg_ptr);
    }
    set_input_mode_create_text() {
        wasm.renderengine_set_input_mode_create_text(this.__wbg_ptr);
    }
    set_input_mode_draw_wall() {
        wasm.renderengine_set_input_mode_draw_wall(this.__wbg_ptr);
    }
    set_input_mode_measurement() {
        wasm.renderengine_set_input_mode_measurement(this.__wbg_ptr);
    }
    set_input_mode_paint() {
        wasm.renderengine_set_input_mode_paint(this.__wbg_ptr);
    }
    set_input_mode_select() {
        wasm.renderengine_set_input_mode_select(this.__wbg_ptr);
    }
    /**
     * @param {string} layer_name
     * @param {string} blend_mode
     * @returns {boolean}
     */
    set_layer_blend_mode(layer_name, blend_mode) {
        const ptr0 = passStringToWasm0(layer_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(blend_mode, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_set_layer_blend_mode(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret !== 0;
    }
    /**
     * @param {string} layer_name
     * @param {number} r
     * @param {number} g
     * @param {number} b
     * @returns {boolean}
     */
    set_layer_color(layer_name, r, g, b) {
        const ptr0 = passStringToWasm0(layer_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_set_layer_color(this.__wbg_ptr, ptr0, len0, r, g, b);
        return ret !== 0;
    }
    /**
     * @param {string} layer_name
     * @param {number} opacity
     * @returns {boolean}
     */
    set_layer_opacity(layer_name, opacity) {
        const ptr0 = passStringToWasm0(layer_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_set_layer_opacity(this.__wbg_ptr, ptr0, len0, opacity);
        return ret !== 0;
    }
    /**
     * @param {string} layer_name
     * @param {boolean} visible
     * @returns {boolean}
     */
    set_layer_visibility(layer_name, visible) {
        const ptr0 = passStringToWasm0(layer_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_set_layer_visibility(this.__wbg_ptr, ptr0, len0, visible);
        return ret !== 0;
    }
    /**
     * @param {string} id
     * @param {number} r
     * @param {number} g
     * @param {number} b
     * @param {number} a
     */
    set_light_color(id, r, g, b, a) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.renderengine_set_light_color(this.__wbg_ptr, ptr0, len0, r, g, b, a);
    }
    /**
     * @param {string} id
     * @param {number} intensity
     */
    set_light_intensity(id, intensity) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.renderengine_set_light_intensity(this.__wbg_ptr, ptr0, len0, intensity);
    }
    /**
     * @param {string} id
     * @param {number} radius
     */
    set_light_radius(id, radius) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.renderengine_set_light_radius(this.__wbg_ptr, ptr0, len0, radius);
    }
    /**
     * @param {Function} callback
     */
    set_runtime_event_handler(callback) {
        wasm.renderengine_set_runtime_event_handler(this.__wbg_ptr, callback);
    }
    /**
     * @param {Function} callback
     */
    set_runtime_operation_handler(callback) {
        wasm.renderengine_set_runtime_operation_handler(this.__wbg_ptr, callback);
    }
    /**
     * @param {string} color
     * @param {number} opacity
     * @param {boolean} filled
     */
    set_shape_style(color, opacity, filled) {
        const ptr0 = passStringToWasm0(color, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.renderengine_set_shape_style(this.__wbg_ptr, ptr0, len0, opacity, filled);
    }
    /**
     * Set the active tool mode (select / move / align).
     * @param {string} mode
     */
    set_tool_mode(mode) {
        const ptr0 = passStringToWasm0(mode, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.renderengine_set_tool_mode(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {number} zoom
     */
    set_zoom(zoom) {
        wasm.renderengine_set_zoom(this.__wbg_ptr, zoom);
    }
    /**
     * Start camera pan mode for middle/right mouse button drag.
     * @param {number} screen_x
     * @param {number} screen_y
     */
    start_camera_pan(screen_x, screen_y) {
        wasm.renderengine_start_camera_pan(this.__wbg_ptr, screen_x, screen_y);
    }
    /**
     * @param {string} id
     */
    toggle_light(id) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.renderengine_toggle_light(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Translate all selected walls and return their updated endpoint payloads.
     * @param {number} dx
     * @param {number} dy
     * @returns {Array<any>}
     */
    translate_selected_walls(dx, dy) {
        const ret = wasm.renderengine_translate_selected_walls(this.__wbg_ptr, dx, dy);
        return ret;
    }
    /**
     * @param {string} id
     * @param {number} x
     * @param {number} y
     */
    update_light_position(id, x, y) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.renderengine_update_light_position(this.__wbg_ptr, ptr0, len0, x, y);
    }
    /**
     * @param {string} sprite_id
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    update_sprite_position(sprite_id, x, y) {
        const ptr0 = passStringToWasm0(sprite_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_update_sprite_position(this.__wbg_ptr, ptr0, len0, x, y);
        return ret !== 0;
    }
    /**
     * @param {string} sprite_id
     * @param {number} scale_x
     * @param {number} scale_y
     * @returns {boolean}
     */
    update_sprite_scale(sprite_id, scale_x, scale_y) {
        const ptr0 = passStringToWasm0(sprite_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_update_sprite_scale(this.__wbg_ptr, ptr0, len0, scale_x, scale_y);
        return ret !== 0;
    }
    /**
     * @param {string} wall_id
     * @param {string} updates_json
     * @returns {boolean}
     */
    update_wall(wall_id, updates_json) {
        const ptr0 = passStringToWasm0(wall_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(updates_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.renderengine_update_wall(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret !== 0;
    }
    /**
     * @param {number} world_x
     * @param {number} world_y
     * @returns {Float64Array}
     */
    world_to_screen(world_x, world_y) {
        const ret = wasm.renderengine_world_to_screen(this.__wbg_ptr, world_x, world_y);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
}
if (Symbol.dispose) RenderEngine.prototype[Symbol.dispose] = RenderEngine.prototype.free;

export class TableManager {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TableManagerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_tablemanager_free(ptr, 0);
    }
    /**
     * @param {string} table_id
     * @param {string} table_name
     * @param {number} width
     * @param {number} height
     */
    create_table(table_id, table_name, width, height) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(table_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.tablemanager_create_table(this.__wbg_ptr, ptr0, len0, ptr1, len1, width, height);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {string | undefined}
     */
    get_active_table_id() {
        const ret = wasm.tablemanager_get_active_table_id(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @returns {string}
     */
    get_all_tables() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.tablemanager_get_all_tables(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} table_id
     * @returns {string | undefined}
     */
    get_table_info(table_id) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tablemanager_get_table_info(this.__wbg_ptr, ptr0, len0);
        let v2;
        if (ret[0] !== 0) {
            v2 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v2;
    }
    /**
     * @param {string} table_id
     * @returns {Float64Array | undefined}
     */
    get_visible_bounds(table_id) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tablemanager_get_visible_bounds(this.__wbg_ptr, ptr0, len0);
        let v2;
        if (ret[0] !== 0) {
            v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        }
        return v2;
    }
    /**
     * @param {string} table_id
     * @param {number} screen_x
     * @param {number} screen_y
     * @returns {boolean}
     */
    is_point_in_table_area(table_id, screen_x, screen_y) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tablemanager_is_point_in_table_area(this.__wbg_ptr, ptr0, len0, screen_x, screen_y);
        return ret !== 0;
    }
    constructor() {
        const ret = wasm.tablemanager_new();
        this.__wbg_ptr = ret >>> 0;
        TableManagerFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {string} table_id
     * @param {number} dx
     * @param {number} dy
     * @returns {boolean}
     */
    pan_viewport(table_id, dx, dy) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tablemanager_pan_viewport(this.__wbg_ptr, ptr0, len0, dx, dy);
        return ret !== 0;
    }
    /**
     * @param {string} table_id
     * @param {number} pixels
     * @returns {number}
     */
    pixels_to_units(table_id, pixels) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tablemanager_pixels_to_units(this.__wbg_ptr, ptr0, len0, pixels);
        return ret;
    }
    /**
     * @param {string} table_id
     * @returns {boolean}
     */
    remove_table(table_id) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tablemanager_remove_table(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * @param {string} table_id
     * @param {number} screen_x
     * @param {number} screen_y
     * @returns {Float64Array | undefined}
     */
    screen_to_table(table_id, screen_x, screen_y) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tablemanager_screen_to_table(this.__wbg_ptr, ptr0, len0, screen_x, screen_y);
        let v2;
        if (ret[0] !== 0) {
            v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        }
        return v2;
    }
    /**
     * @param {string} table_id
     * @returns {boolean}
     */
    set_active_table(table_id) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tablemanager_set_active_table(this.__wbg_ptr, ptr0, len0);
        return ret !== 0;
    }
    /**
     * @param {number} width
     * @param {number} height
     */
    set_canvas_size(width, height) {
        wasm.tablemanager_set_canvas_size(this.__wbg_ptr, width, height);
    }
    /**
     * @param {string} table_id
     * @param {boolean} show_grid
     * @param {number} cell_size
     * @returns {boolean}
     */
    set_table_grid(table_id, show_grid, cell_size) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tablemanager_set_table_grid(this.__wbg_ptr, ptr0, len0, show_grid, cell_size);
        return ret !== 0;
    }
    /**
     * @param {string} table_id
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     * @returns {boolean}
     */
    set_table_screen_area(table_id, x, y, width, height) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tablemanager_set_table_screen_area(this.__wbg_ptr, ptr0, len0, x, y, width, height);
        return ret !== 0;
    }
    /**
     * @param {string} table_id
     * @param {number} grid_cell_px
     * @param {number} cell_distance
     * @param {string} unit
     * @returns {boolean}
     */
    set_table_units(table_id, grid_cell_px, cell_distance, unit) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(unit, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.tablemanager_set_table_units(this.__wbg_ptr, ptr0, len0, grid_cell_px, cell_distance, ptr1, len1);
        return ret !== 0;
    }
    /**
     * @param {string} table_id
     * @param {number} x
     * @param {number} y
     * @returns {Float64Array | undefined}
     */
    snap_to_grid(table_id, x, y) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tablemanager_snap_to_grid(this.__wbg_ptr, ptr0, len0, x, y);
        let v2;
        if (ret[0] !== 0) {
            v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        }
        return v2;
    }
    /**
     * @param {string} table_id
     * @param {number} table_x
     * @param {number} table_y
     * @returns {Float64Array | undefined}
     */
    table_to_screen(table_id, table_x, table_y) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tablemanager_table_to_screen(this.__wbg_ptr, ptr0, len0, table_x, table_y);
        let v2;
        if (ret[0] !== 0) {
            v2 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        }
        return v2;
    }
    /**
     * @param {string} table_id
     * @param {number} game_distance
     * @returns {number}
     */
    units_to_pixels(table_id, game_distance) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tablemanager_units_to_pixels(this.__wbg_ptr, ptr0, len0, game_distance);
        return ret;
    }
    /**
     * @param {string} table_id
     * @param {number} zoom_factor
     * @param {number} center_x
     * @param {number} center_y
     * @returns {boolean}
     */
    zoom_table(table_id, zoom_factor, center_x, center_y) {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tablemanager_zoom_table(this.__wbg_ptr, ptr0, len0, zoom_factor, center_x, center_y);
        return ret !== 0;
    }
}
if (Symbol.dispose) TableManager.prototype[Symbol.dispose] = TableManager.prototype.free;

/**
 * Table synchronization manager for TTRPG web client
 * Handles table data reception and applies authoritative server sprite updates.
 */
export class TableSync {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TableSyncFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_tablesync_free(ptr, 0);
    }
    /**
     * Get sprites from current table (flattened from all layers)
     * @returns {any}
     */
    get_sprites() {
        const ret = wasm.tablesync_get_sprites(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get sprites by layer
     * @param {string} layer_name
     * @returns {any}
     */
    get_sprites_by_layer(layer_name) {
        const ptr0 = passStringToWasm0(layer_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tablesync_get_sprites_by_layer(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * Get current table data
     * @returns {any}
     */
    get_table_data() {
        const ret = wasm.tablesync_get_table_data(this.__wbg_ptr);
        return ret;
    }
    /**
     * Get current table ID
     * @returns {string | undefined}
     */
    get_table_id() {
        const ret = wasm.tablesync_get_table_id(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Handle table update errors
     * @param {string} error_message
     */
    handle_error(error_message) {
        const ptr0 = passStringToWasm0(error_message, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.tablesync_handle_error(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Handle sprite update received from server
     * @param {any} update_data_js
     */
    handle_sprite_update(update_data_js) {
        const ret = wasm.tablesync_handle_sprite_update(this.__wbg_ptr, update_data_js);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Handle table data received from server
     * @param {any} table_data_js
     */
    handle_table_data(table_data_js) {
        const ret = wasm.tablesync_handle_table_data(this.__wbg_ptr, table_data_js);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    constructor() {
        const ret = wasm.tablesync_new();
        this.__wbg_ptr = ret >>> 0;
        TableSyncFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Request table data from server
     * @param {string} table_name
     */
    request_table(table_name) {
        const ptr0 = passStringToWasm0(table_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.tablesync_request_table(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Set error handler
     * @param {Function} callback
     */
    set_error_handler(callback) {
        wasm.tablesync_set_error_handler(this.__wbg_ptr, callback);
    }
    /**
     * Set the network client for sending messages
     * @param {object} network_client
     */
    set_network_client(network_client) {
        wasm.tablesync_set_network_client(this.__wbg_ptr, network_client);
    }
    /**
     * Set callback for sprite updates
     * @param {Function} callback
     */
    set_sprite_update_handler(callback) {
        wasm.tablesync_set_sprite_update_handler(this.__wbg_ptr, callback);
    }
    /**
     * Set callback for when table data is received
     * @param {Function} callback
     */
    set_table_received_handler(callback) {
        wasm.tablesync_set_table_received_handler(this.__wbg_ptr, callback);
    }
}
if (Symbol.dispose) TableSync.prototype[Symbol.dispose] = TableSync.prototype.free;

/**
 * @param {number} player_x
 * @param {number} player_y
 * @param {Float32Array} obstacles
 * @param {number} max_dist
 * @returns {any}
 */
export function compute_visibility_polygon(player_x, player_y, obstacles, max_dist) {
    const ret = wasm.compute_visibility_polygon(player_x, player_y, obstacles, max_dist);
    return ret;
}

/**
 * @returns {any[]}
 */
export function create_default_brush_presets() {
    const ret = wasm.create_default_brush_presets();
    var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
}

/**
 * Initialize the WebGL game renderer
 *
 * Creates a new `RenderEngine` instance bound to the provided HTML canvas element.
 * This is the main entry point for initializing the WASM-based rendering system.
 *
 * # Arguments
 *
 * * `canvas` - HTML canvas element where the game will be rendered
 *
 * # Returns
 *
 * * `Ok(RenderEngine)` - Successfully initialized render engine
 * * `Err(JsValue)` - WebGL initialization error
 *
 * # Examples
 *
 * ```javascript
 * // JavaScript usage
 * import init, { init_game_renderer } from './pkg/ttrpg_rust_core.js';
 *
 * await init(); // Initialize WASM module
 *
 * const canvas = document.getElementById('game-canvas');
 * try {
 *     const renderer = init_game_renderer(canvas);
 *     console.log('Renderer initialized successfully');
 * } catch (error) {
 *     console.error('Failed to initialize renderer:', error);
 * }
 * ```
 *
 * # WebGL Requirements
 *
 * - WebGL2 support required
 * - Stencil buffer recommended for shadow rendering
 * - Minimum canvas size: 300x200 pixels
 * @param {HTMLCanvasElement} canvas
 * @returns {RenderEngine}
 */
export function init_game_renderer(canvas) {
    const ret = wasm.init_game_renderer(canvas);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return RenderEngine.__wrap(ret[0]);
}

/**
 * WASM module initialization and panic hook setup
 *
 * This function is automatically called when the WASM module loads.
 * Sets up panic handlers to provide readable error messages in the browser console.
 *
 * # Panic Handling
 *
 * Uses `console_error_panic_hook` to convert Rust panics into JavaScript errors
 * with full stack traces visible in browser developer tools.
 *
 * # Examples
 *
 * ```javascript
 * // Automatic initialization on module load
 * import init from './pkg/ttrpg_rust_core.js';
 *
 * // This calls main() automatically
 * await init();
 * // TTRPG Rust Core initialized
 * ```
 */
export function main() {
    wasm.main();
}

/**
 * Get the current crate version
 *
 * Returns the version string defined in Cargo.toml at compile time.
 * Useful for debugging and version compatibility checks.
 *
 * # Returns
 *
 * Version string in semver format (e.g., "0.1.0")
 *
 * # Examples
 *
 * ```javascript
 * import { version } from './pkg/ttrpg_rust_core.js';
 *
 * console.log('WASM Core Version:', version());
 * // Output: WASM Core Version: 0.1.0
 * ```
 * @returns {string}
 */
export function version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_2e59b1b37a9a34c3: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_String_11905339415cf58e: function(arg0, arg1) {
            const ret = String(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_bigint_get_as_i64_2c5082002e4826e2: function(arg0, arg1) {
            const v = arg1;
            const ret = typeof(v) === 'bigint' ? v : undefined;
            getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_boolean_get_a86c216575a75c30: function(arg0) {
            const v = arg0;
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_dd5d2d07ce9e6c57: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_in_4bd7a57e54337366: function(arg0, arg1) {
            const ret = arg0 in arg1;
            return ret;
        },
        __wbg___wbindgen_is_bigint_6c98f7e945dacdde: function(arg0) {
            const ret = typeof(arg0) === 'bigint';
            return ret;
        },
        __wbg___wbindgen_is_function_49868bde5eb1e745: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_null_344c8750a8525473: function(arg0) {
            const ret = arg0 === null;
            return ret;
        },
        __wbg___wbindgen_is_object_40c5a80572e8f9d3: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_b29b5c5a8065ba1a: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_c0cca72b82b86f4d: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_jsval_eq_7d430e744a913d26: function(arg0, arg1) {
            const ret = arg0 === arg1;
            return ret;
        },
        __wbg___wbindgen_jsval_loose_eq_3a72ae764d46d944: function(arg0, arg1) {
            const ret = arg0 == arg1;
            return ret;
        },
        __wbg___wbindgen_number_get_7579aab02a8a620c: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_914df97fcfa788f2: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_81fc77679af83bc6: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_3c3b4f651835fbcb: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_activeTexture_55755e76627be758: function(arg0, arg1) {
            arg0.activeTexture(arg1 >>> 0);
        },
        __wbg_arrayBuffer_dae084a298aa5fe0: function() { return handleError(function (arg0) {
            const ret = arg0.arrayBuffer();
            return ret;
        }, arguments); },
        __wbg_attachShader_91626cdf6ee920b8: function(arg0, arg1, arg2) {
            arg0.attachShader(arg1, arg2);
        },
        __wbg_bindBuffer_ec76634c95f563c2: function(arg0, arg1, arg2) {
            arg0.bindBuffer(arg1 >>> 0, arg2);
        },
        __wbg_bindFramebuffer_c0a4ba2bb49f7c82: function(arg0, arg1, arg2) {
            arg0.bindFramebuffer(arg1 >>> 0, arg2);
        },
        __wbg_bindRenderbuffer_7b127e74cfceb241: function(arg0, arg1, arg2) {
            arg0.bindRenderbuffer(arg1 >>> 0, arg2);
        },
        __wbg_bindTexture_3f1c468809dfc331: function(arg0, arg1, arg2) {
            arg0.bindTexture(arg1 >>> 0, arg2);
        },
        __wbg_blendFunc_9ec46725800dafb1: function(arg0, arg1, arg2) {
            arg0.blendFunc(arg1 >>> 0, arg2 >>> 0);
        },
        __wbg_bufferData_74194b1c2d90193e: function(arg0, arg1, arg2, arg3) {
            arg0.bufferData(arg1 >>> 0, arg2, arg3 >>> 0);
        },
        __wbg_call_368fa9c372d473ba: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = arg0.call(arg1, arg2, arg3);
            return ret;
        }, arguments); },
        __wbg_call_7f2987183bb62793: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_call_d578befcc3145dee: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_checkFramebufferStatus_ff80b6175b39d000: function(arg0, arg1) {
            const ret = arg0.checkFramebufferStatus(arg1 >>> 0);
            return ret;
        },
        __wbg_clearColor_4c23ac0feeb06fb4: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.clearColor(arg1, arg2, arg3, arg4);
        },
        __wbg_clearStencil_4d7e0568af04ac91: function(arg0, arg1) {
            arg0.clearStencil(arg1);
        },
        __wbg_clear_98a9ca84e00ae8e2: function(arg0, arg1) {
            arg0.clear(arg1 >>> 0);
        },
        __wbg_close_f181fdc02ee236e6: function() { return handleError(function (arg0) {
            arg0.close();
        }, arguments); },
        __wbg_code_c96efa5c1a80b2d9: function(arg0) {
            const ret = arg0.code;
            return ret;
        },
        __wbg_colorMask_134144611b082d70: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.colorMask(arg1 !== 0, arg2 !== 0, arg3 !== 0, arg4 !== 0);
        },
        __wbg_compileShader_30b1185156c62e3a: function(arg0, arg1) {
            arg0.compileShader(arg1);
        },
        __wbg_createBuffer_bdda716ebf68ba59: function(arg0) {
            const ret = arg0.createBuffer();
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_createFramebuffer_b2cc13b01b560d6f: function(arg0) {
            const ret = arg0.createFramebuffer();
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_createProgram_ba013605ddf3824a: function(arg0) {
            const ret = arg0.createProgram();
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_createRenderbuffer_0029ab986ce8c0da: function(arg0) {
            const ret = arg0.createRenderbuffer();
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_createShader_b2c5333fcc05114e: function(arg0, arg1) {
            const ret = arg0.createShader(arg1 >>> 0);
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_createTexture_ab0a6dde87005cb1: function(arg0) {
            const ret = arg0.createTexture();
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_data_60b50110c5bd9349: function(arg0) {
            const ret = arg0.data;
            return ret;
        },
        __wbg_disableVertexAttribArray_a1f4414d0521b130: function(arg0, arg1) {
            arg0.disableVertexAttribArray(arg1 >>> 0);
        },
        __wbg_disable_5c6898ffc41889ea: function(arg0, arg1) {
            arg0.disable(arg1 >>> 0);
        },
        __wbg_done_547d467e97529006: function(arg0) {
            const ret = arg0.done;
            return ret;
        },
        __wbg_drawArrays_079aad920afe1404: function(arg0, arg1, arg2, arg3) {
            arg0.drawArrays(arg1 >>> 0, arg2, arg3);
        },
        __wbg_drawElements_f0da90b9c827e09d: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.drawElements(arg1 >>> 0, arg2, arg3 >>> 0, arg4);
        },
        __wbg_enableVertexAttribArray_b4abeab358174fdb: function(arg0, arg1) {
            arg0.enableVertexAttribArray(arg1 >>> 0);
        },
        __wbg_enable_9328f475236428ef: function(arg0, arg1) {
            arg0.enable(arg1 >>> 0);
        },
        __wbg_entries_616b1a459b85be0b: function(arg0) {
            const ret = Object.entries(arg0);
            return ret;
        },
        __wbg_error_38bec0a78dd8ded8: function(arg0) {
            console.error(arg0);
        },
        __wbg_error_a6fa202b58aa1cd3: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_fetch_0e70fe3bd20ee8c4: function(arg0, arg1) {
            const ret = arg0.fetch(arg1);
            return ret;
        },
        __wbg_framebufferRenderbuffer_2604d9558c7cddc1: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.framebufferRenderbuffer(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4);
        },
        __wbg_framebufferTexture2D_88c527c558c09cf5: function(arg0, arg1, arg2, arg3, arg4, arg5) {
            arg0.framebufferTexture2D(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4, arg5);
        },
        __wbg_getAttribLocation_085226b5f2506399: function(arg0, arg1, arg2, arg3) {
            const ret = arg0.getAttribLocation(arg1, getStringFromWasm0(arg2, arg3));
            return ret;
        },
        __wbg_getContext_d61338bafcc57ccd: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = arg0.getContext(getStringFromWasm0(arg1, arg2), arg3);
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        }, arguments); },
        __wbg_getParameter_037149e897c929ad: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.getParameter(arg1 >>> 0);
            return ret;
        }, arguments); },
        __wbg_getProgramInfoLog_b2d112da8cb8c5c5: function(arg0, arg1, arg2) {
            const ret = arg1.getProgramInfoLog(arg2);
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_getProgramParameter_2b7693f9edfde93d: function(arg0, arg1, arg2) {
            const ret = arg0.getProgramParameter(arg1, arg2 >>> 0);
            return ret;
        },
        __wbg_getShaderInfoLog_57aaac3110ec22f3: function(arg0, arg1, arg2) {
            const ret = arg1.getShaderInfoLog(arg2);
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_getShaderParameter_2b6f35d96d51cc82: function(arg0, arg1, arg2) {
            const ret = arg0.getShaderParameter(arg1, arg2 >>> 0);
            return ret;
        },
        __wbg_getUniformLocation_8d93a5f3de4232bf: function(arg0, arg1, arg2, arg3) {
            const ret = arg0.getUniformLocation(arg1, getStringFromWasm0(arg2, arg3));
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_get_4848e350b40afc16: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_ed0642c4b9d31ddf: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_f96702c6245e4ef9: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_unchecked_7d7babe32e9e6a54: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_with_ref_key_f38bf27dc398d91b: function(arg0, arg1) {
            const ret = arg0[arg1];
            return ret;
        },
        __wbg_height_734034c3ff2654af: function(arg0) {
            const ret = arg0.height;
            return ret;
        },
        __wbg_instanceof_ArrayBuffer_ff7c1337a5e3b33a: function(arg0) {
            let result;
            try {
                result = arg0 instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Response_06795eab66cc4036: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Response;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8Array_4b8da683deb25d72: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_WebGl2RenderingContext_6502f76e53996a5e: function(arg0) {
            let result;
            try {
                result = arg0 instanceof WebGL2RenderingContext;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Window_c0fee4c064502536: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Window;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_db61795ad004c139: function(arg0) {
            const ret = Array.isArray(arg0);
            return ret;
        },
        __wbg_isSafeInteger_ea83862ba994770c: function(arg0) {
            const ret = Number.isSafeInteger(arg0);
            return ret;
        },
        __wbg_iterator_de403ef31815a3e6: function() {
            const ret = Symbol.iterator;
            return ret;
        },
        __wbg_length_0c32cb8543c8e4c8: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_6e821edde497a532: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_fd4646b401926788: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_lineWidth_df37f1a33e7791b8: function(arg0, arg1) {
            arg0.lineWidth(arg1);
        },
        __wbg_linkProgram_d86c69f8f86f3031: function(arg0, arg1) {
            arg0.linkProgram(arg1);
        },
        __wbg_log_4c0baeb8af2f8f89: function(arg0) {
            console.log(arg0);
        },
        __wbg_new_227d7c05414eb861: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_new_4f9fafbb3909af72: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_84748f0feee3d22f: function() { return handleError(function () {
            const ret = new Image();
            return ret;
        }, arguments); },
        __wbg_new_99cabae501c0a8a0: function() {
            const ret = new Map();
            return ret;
        },
        __wbg_new_a2d8434834334bbf: function() { return handleError(function (arg0, arg1) {
            const ret = new WebSocket(getStringFromWasm0(arg0, arg1));
            return ret;
        }, arguments); },
        __wbg_new_a560378ea1240b14: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_f3c9df4f38f3f798: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_from_slice_d85ad974cf8f6f35: function(arg0, arg1) {
            const ret = new Float32Array(getArrayF32FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_typed_14d7cc391ce53d2c: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen__convert__closures_____invoke__h2bc1731c5b684db1(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_with_str_and_init_f663b6d334baa878: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = new Request(getStringFromWasm0(arg0, arg1), arg2);
            return ret;
        }, arguments); },
        __wbg_next_01132ed6134b8ef5: function(arg0) {
            const ret = arg0.next;
            return ret;
        },
        __wbg_next_b3713ec761a9dbfd: function() { return handleError(function (arg0) {
            const ret = arg0.next();
            return ret;
        }, arguments); },
        __wbg_now_88621c9c9a4f3ffc: function() {
            const ret = Date.now();
            return ret;
        },
        __wbg_ok_36f7b13b74596c24: function(arg0) {
            const ret = arg0.ok;
            return ret;
        },
        __wbg_prototypesetcall_3e05eb9545565046: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_prototypesetcall_66c8e1fb820946be: function(arg0, arg1, arg2) {
            Float32Array.prototype.set.call(getArrayF32FromWasm0(arg0, arg1), arg2);
        },
        __wbg_push_6bdbc990be5ac37b: function(arg0, arg1) {
            const ret = arg0.push(arg1);
            return ret;
        },
        __wbg_queueMicrotask_abaf92f0bd4e80a4: function(arg0) {
            const ret = arg0.queueMicrotask;
            return ret;
        },
        __wbg_queueMicrotask_df5a6dac26d818f3: function(arg0) {
            queueMicrotask(arg0);
        },
        __wbg_random_a72d453e63c9558c: function() {
            const ret = Math.random();
            return ret;
        },
        __wbg_reason_85e58391371e868d: function(arg0, arg1) {
            const ret = arg1.reason;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_renderbufferStorage_d95f75be57ae52b3: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.renderbufferStorage(arg1 >>> 0, arg2 >>> 0, arg3, arg4);
        },
        __wbg_resolve_0a79de24e9d2267b: function(arg0) {
            const ret = Promise.resolve(arg0);
            return ret;
        },
        __wbg_send_4f53c94146f0274d: function() { return handleError(function (arg0, arg1, arg2) {
            arg0.send(getStringFromWasm0(arg1, arg2));
        }, arguments); },
        __wbg_set_08463b1df38a7e29: function(arg0, arg1, arg2) {
            const ret = arg0.set(arg1, arg2);
            return ret;
        },
        __wbg_set_6c60b2e8ad0e9383: function(arg0, arg1, arg2) {
            arg0[arg1 >>> 0] = arg2;
        },
        __wbg_set_8ee2d34facb8466e: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_set_crossOrigin_c4ac0a40ad3cd9fa: function(arg0, arg1, arg2) {
            arg0.crossOrigin = arg1 === 0 ? undefined : getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_d1cb61e9f39c870f: function(arg0, arg1, arg2) {
            arg0[arg1] = arg2;
        },
        __wbg_set_method_1971272fe557e972: function(arg0, arg1, arg2) {
            arg0.method = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_mode_d1b643087602281a: function(arg0, arg1) {
            arg0.mode = __wbindgen_enum_RequestMode[arg1];
        },
        __wbg_set_onclose_47cce56c686db4fb: function(arg0, arg1) {
            arg0.onclose = arg1;
        },
        __wbg_set_onerror_3db8bc3e52b2b10b: function(arg0, arg1) {
            arg0.onerror = arg1;
        },
        __wbg_set_onerror_e34026e082457bd6: function(arg0, arg1) {
            arg0.onerror = arg1;
        },
        __wbg_set_onload_3c53c47535b74614: function(arg0, arg1) {
            arg0.onload = arg1;
        },
        __wbg_set_onmessage_45bd33b110c54f5b: function(arg0, arg1) {
            arg0.onmessage = arg1;
        },
        __wbg_set_onopen_7ffeb01f8a628209: function(arg0, arg1) {
            arg0.onopen = arg1;
        },
        __wbg_set_src_5d34b11a5c99434b: function(arg0, arg1, arg2) {
            arg0.src = getStringFromWasm0(arg1, arg2);
        },
        __wbg_shaderSource_cae157a332281ae7: function(arg0, arg1, arg2, arg3) {
            arg0.shaderSource(arg1, getStringFromWasm0(arg2, arg3));
        },
        __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_static_accessor_GLOBAL_THIS_a1248013d790bf5f: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_f2e0f995a21329ff: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_24f78b6d23f286ea: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_59fd959c540fe405: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_status_44ecb0ac1da253f4: function(arg0) {
            const ret = arg0.status;
            return ret;
        },
        __wbg_stencilFunc_a4af3e3e84cac925: function(arg0, arg1, arg2, arg3) {
            arg0.stencilFunc(arg1 >>> 0, arg2, arg3 >>> 0);
        },
        __wbg_stencilMask_c3deb341c2545445: function(arg0, arg1) {
            arg0.stencilMask(arg1 >>> 0);
        },
        __wbg_stencilOp_8359e0f701f4c57a: function(arg0, arg1, arg2, arg3) {
            arg0.stencilOp(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0);
        },
        __wbg_stringify_a2c39d991e1bf91d: function() { return handleError(function (arg0) {
            const ret = JSON.stringify(arg0);
            return ret;
        }, arguments); },
        __wbg_texImage2D_6a3521456a5f13ec: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10) {
            arg0.texImage2D(arg1 >>> 0, arg2, arg3, arg4, arg5, arg6, arg7 >>> 0, arg8 >>> 0, arg9 === 0 ? undefined : getArrayU8FromWasm0(arg9, arg10));
        }, arguments); },
        __wbg_texImage2D_f9640d9ab0d312d4: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
            arg0.texImage2D(arg1 >>> 0, arg2, arg3, arg4 >>> 0, arg5 >>> 0, arg6);
        }, arguments); },
        __wbg_texParameteri_51f89620521fe4f5: function(arg0, arg1, arg2, arg3) {
            arg0.texParameteri(arg1 >>> 0, arg2 >>> 0, arg3);
        },
        __wbg_then_00eed3ac0b8e82cb: function(arg0, arg1, arg2) {
            const ret = arg0.then(arg1, arg2);
            return ret;
        },
        __wbg_then_a0c8db0381c8994c: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbg_uniform1f_fc8bddcb58797aec: function(arg0, arg1, arg2) {
            arg0.uniform1f(arg1, arg2);
        },
        __wbg_uniform1i_acce06d190ce18d5: function(arg0, arg1, arg2) {
            arg0.uniform1i(arg1, arg2);
        },
        __wbg_uniform2f_186549d813184ee8: function(arg0, arg1, arg2, arg3) {
            arg0.uniform2f(arg1, arg2, arg3);
        },
        __wbg_uniform3f_51c0e038d1d16f4c: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.uniform3f(arg1, arg2, arg3, arg4);
        },
        __wbg_uniform4f_50286376821185ad: function(arg0, arg1, arg2, arg3, arg4, arg5) {
            arg0.uniform4f(arg1, arg2, arg3, arg4, arg5);
        },
        __wbg_uniformMatrix3fv_dc7481350ed17ade: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.uniformMatrix3fv(arg1, arg2 !== 0, getArrayF32FromWasm0(arg3, arg4));
        },
        __wbg_useProgram_f79c775d2e8824a9: function(arg0, arg1) {
            arg0.useProgram(arg1);
        },
        __wbg_value_7f6052747ccf940f: function(arg0) {
            const ret = arg0.value;
            return ret;
        },
        __wbg_vertexAttribPointer_7db76295987fda72: function(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
            arg0.vertexAttribPointer(arg1 >>> 0, arg2, arg3 >>> 0, arg4 !== 0, arg5, arg6);
        },
        __wbg_viewport_de5bbf3f5c97bfcf: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.viewport(arg1, arg2, arg3, arg4);
        },
        __wbg_warn_2b0a27f629a4bb1e: function(arg0) {
            console.warn(arg0);
        },
        __wbg_width_80cea93fc7f63070: function(arg0) {
            const ret = arg0.width;
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 192, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__h379eeb6857ff453f);
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("CloseEvent")], shim_idx: 117, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__h46355d3965ce5f88);
            return ret;
        },
        __wbindgen_cast_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("ErrorEvent")], shim_idx: 117, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__h46355d3965ce5f88_2);
            return ret;
        },
        __wbindgen_cast_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("Event")], shim_idx: 117, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__h46355d3965ce5f88_3);
            return ret;
        },
        __wbindgen_cast_0000000000000005: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("MessageEvent")], shim_idx: 117, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__h46355d3965ce5f88_4);
            return ret;
        },
        __wbindgen_cast_0000000000000006: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [], shim_idx: 116, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__h933b87fda231a098);
            return ret;
        },
        __wbindgen_cast_0000000000000007: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000008: function(arg0) {
            // Cast intrinsic for `I64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000009: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(F32)) -> NamedExternref("Float32Array")`.
            const ret = getArrayF32FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_000000000000000a: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U16)) -> NamedExternref("Uint16Array")`.
            const ret = getArrayU16FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_000000000000000b: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_000000000000000c: function(arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./ttrpg_rust_core_bg.js": import0,
    };
}

function wasm_bindgen__convert__closures_____invoke__h933b87fda231a098(arg0, arg1) {
    wasm.wasm_bindgen__convert__closures_____invoke__h933b87fda231a098(arg0, arg1);
}

function wasm_bindgen__convert__closures_____invoke__h46355d3965ce5f88(arg0, arg1, arg2) {
    wasm.wasm_bindgen__convert__closures_____invoke__h46355d3965ce5f88(arg0, arg1, arg2);
}

function wasm_bindgen__convert__closures_____invoke__h46355d3965ce5f88_2(arg0, arg1, arg2) {
    wasm.wasm_bindgen__convert__closures_____invoke__h46355d3965ce5f88_2(arg0, arg1, arg2);
}

function wasm_bindgen__convert__closures_____invoke__h46355d3965ce5f88_3(arg0, arg1, arg2) {
    wasm.wasm_bindgen__convert__closures_____invoke__h46355d3965ce5f88_3(arg0, arg1, arg2);
}

function wasm_bindgen__convert__closures_____invoke__h46355d3965ce5f88_4(arg0, arg1, arg2) {
    wasm.wasm_bindgen__convert__closures_____invoke__h46355d3965ce5f88_4(arg0, arg1, arg2);
}

function wasm_bindgen__convert__closures_____invoke__h379eeb6857ff453f(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen__convert__closures_____invoke__h379eeb6857ff453f(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen__convert__closures_____invoke__h2bc1731c5b684db1(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen__convert__closures_____invoke__h2bc1731c5b684db1(arg0, arg1, arg2, arg3);
}


const __wbindgen_enum_RequestMode = ["same-origin", "no-cors", "cors", "navigate"];
const ActionsClientFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_actionsclient_free(ptr >>> 0, 1));
const AssetManagerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_assetmanager_free(ptr >>> 0, 1));
const CollisionSystemFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_collisionsystem_free(ptr >>> 0, 1));
const NetworkClientFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_networkclient_free(ptr >>> 0, 1));
const PaintSystemFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_paintsystem_free(ptr >>> 0, 1));
const PlanningManagerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_planningmanager_free(ptr >>> 0, 1));
const RenderEngineFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_renderengine_free(ptr >>> 0, 1));
const TableManagerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_tablemanager_free(ptr >>> 0, 1));
const TableSyncFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_tablesync_free(ptr >>> 0, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_destroy_closure(state.a, state.b));

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
    }
    wasm.__externref_drop_slice(ptr, len);
    return result;
}

function getArrayU16FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint16ArrayMemory0().subarray(ptr / 2, ptr / 2 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint16ArrayMemory0 = null;
function getUint16ArrayMemory0() {
    if (cachedUint16ArrayMemory0 === null || cachedUint16ArrayMemory0.byteLength === 0) {
        cachedUint16ArrayMemory0 = new Uint16Array(wasm.memory.buffer);
    }
    return cachedUint16ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_destroy_closure(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedFloat32ArrayMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
    cachedUint16ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('ttrpg_rust_core_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
