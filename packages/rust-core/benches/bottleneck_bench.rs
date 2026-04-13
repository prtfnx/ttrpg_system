use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use ttrpg_rust_core::types::{Sprite, Layer};
use ttrpg_rust_core::math::Vec2;
use std::collections::HashMap;

// ── Helpers ──

fn make_sprite(id: usize, x: f64, y: f64, table_id: &str) -> Sprite {
    let mut s = Sprite::new(
        format!("sprite_{id}"), x, y, 64.0, 64.0, "tokens".to_string(),
    );
    s.table_id = table_id.to_string();
    s
}

fn make_layers(n_sprites: usize) -> HashMap<String, Layer> {
    let mut layers = HashMap::new();
    let layer_names = ["map", "tokens", "obstacles", "effects", "dm", "light", "fog"];
    for (i, name) in layer_names.iter().enumerate() {
        let mut layer = Layer::new(i as i32);
        if *name == "tokens" {
            for j in 0..n_sprites {
                let x = (j % 20) as f64 * 64.0;
                let y = (j / 20) as f64 * 64.0;
                layer.sprites.push(make_sprite(j, x, y, "table_1"));
            }
        }
        layers.insert(name.to_string(), layer);
    }
    layers
}

// ── BOTTLENECK 1: Grid vertex generation (per-frame allocation) ──

fn grid_vertex_gen(grid_size: f32, viewport_w: f32, viewport_h: f32) -> Vec<f32> {
    let start_x = 0.0_f32;
    let end_x = viewport_w;
    let start_y = 0.0_f32;
    let end_y = viewport_h;

    let mut vertices = Vec::new();
    let mut x = start_x;
    while x <= end_x {
        vertices.extend_from_slice(&[x, start_y, x, end_y]);
        x += grid_size;
    }
    let mut y = start_y;
    while y <= end_y {
        vertices.extend_from_slice(&[start_x, y, end_x, y]);
        y += grid_size;
    }
    vertices
}

fn grid_vertex_gen_preallocated(grid_size: f32, viewport_w: f32, viewport_h: f32, buf: &mut Vec<f32>) {
    buf.clear();
    let cols = ((viewport_w / grid_size).ceil() as usize + 1) * 4;
    let rows = ((viewport_h / grid_size).ceil() as usize + 1) * 4;
    buf.reserve(cols + rows);

    let mut x = 0.0_f32;
    while x <= viewport_w {
        buf.extend_from_slice(&[x, 0.0, x, viewport_h]);
        x += grid_size;
    }
    let mut y = 0.0_f32;
    while y <= viewport_h {
        buf.extend_from_slice(&[0.0, y, viewport_w, y]);
        y += grid_size;
    }
}

fn bench_grid_vertex_gen(c: &mut Criterion) {
    let mut group = c.benchmark_group("grid_vertex_gen");
    for (label, w, h) in [("1080p", 1920.0, 1080.0), ("4K", 3840.0, 2160.0)] {
        group.bench_with_input(BenchmarkId::new("alloc_each_frame", label), &(w, h), |b, &(w, h)| {
            b.iter(|| grid_vertex_gen(black_box(50.0), black_box(w), black_box(h)))
        });
        group.bench_with_input(BenchmarkId::new("preallocated", label), &(w, h), |b, &(w, h)| {
            let mut buf = Vec::with_capacity(4000);
            b.iter(|| grid_vertex_gen_preallocated(black_box(50.0), black_box(w), black_box(h), &mut buf))
        });
    }
    group.finish();
}

// ── BOTTLENECK 2: Layer sort + linear sprite search (per mouse event) ──

fn find_sprite_at(
    world_pos: Vec2,
    layers: &HashMap<String, Layer>,
    active_table_id: &str,
) -> Option<String> {
    let mut sorted: Vec<_> = layers.iter().collect();
    sorted.sort_by_key(|(_, l)| std::cmp::Reverse(l.z_order()));

    for (_name, layer) in &sorted {
        if !layer.selectable || !layer.settings.visible { continue; }
        for sprite in layer.sprites.iter().rev() {
            if sprite.table_id != active_table_id { continue; }
            if sprite.contains_world_point(world_pos) {
                return Some(sprite.id.clone());
            }
        }
    }
    None
}

fn bench_sprite_lookup(c: &mut Criterion) {
    let mut group = c.benchmark_group("sprite_lookup");
    for n in [20, 100, 500] {
        let layers = make_layers(n);
        let click_pos = Vec2::new(320.0, 320.0); // middle of grid
        group.bench_with_input(BenchmarkId::from_parameter(n), &n, |b, _| {
            b.iter(|| find_sprite_at(black_box(click_pos), &layers, "table_1"))
        });
    }
    group.finish();
}

// ── BOTTLENECK 3: String table_id comparison in render loop ──

fn filter_sprites_string(sprites: &[Sprite], active_table_id: &str) -> usize {
    sprites.iter().filter(|s| s.table_id == active_table_id).count()
}

fn filter_sprites_prefix(sprites: &[Sprite], prefix: u8) -> usize {
    // Simulate integer ID comparison (first byte check as proxy)
    sprites.iter().filter(|s| s.table_id.as_bytes().first() == Some(&prefix)).count()
}

fn bench_table_id_filter(c: &mut Criterion) {
    let mut group = c.benchmark_group("table_id_filter");
    for n in [50, 200, 1000] {
        let sprites: Vec<Sprite> = (0..n)
            .map(|i| make_sprite(i, (i % 20) as f64 * 64.0, (i / 20) as f64 * 64.0, "table_1"))
            .collect();
        group.bench_with_input(BenchmarkId::new("string_eq", n), &sprites, |b, sprites| {
            b.iter(|| filter_sprites_string(sprites, black_box("table_1")))
        });
        group.bench_with_input(BenchmarkId::new("byte_prefix", n), &sprites, |b, sprites| {
            b.iter(|| filter_sprites_prefix(sprites, black_box(b't')))
        });
    }
    group.finish();
}

// ── BOTTLENECK 4: Polygon vertex reconstruction (per obstacle per frame) ──

fn build_polygon_line_verts(polygon_vertices: &[[f32; 2]]) -> Vec<f32> {
    let mut line_verts = Vec::with_capacity(polygon_vertices.len() * 4);
    for i in 0..polygon_vertices.len() {
        let next = (i + 1) % polygon_vertices.len();
        line_verts.push(polygon_vertices[i][0]);
        line_verts.push(polygon_vertices[i][1]);
        line_verts.push(polygon_vertices[next][0]);
        line_verts.push(polygon_vertices[next][1]);
    }
    line_verts
}

fn bench_polygon_verts(c: &mut Criterion) {
    let mut group = c.benchmark_group("polygon_line_verts");
    for n_verts in [4, 8, 20] {
        let verts: Vec<[f32; 2]> = (0..n_verts)
            .map(|i| {
                let angle = (i as f32 / n_verts as f32) * std::f32::consts::TAU;
                [100.0 + 50.0 * angle.cos(), 100.0 + 50.0 * angle.sin()]
            })
            .collect();
        group.bench_with_input(BenchmarkId::from_parameter(n_verts), &verts, |b, v| {
            b.iter(|| build_polygon_line_verts(black_box(v)))
        });
    }
    group.finish();
}

// ── BOTTLENECK 5: Sprite serde (JSON parse on every network message) ──

fn bench_sprite_serde(c: &mut Criterion) {
    let sprite = make_sprite(0, 100.0, 200.0, "table_1");
    let json = serde_json::to_string(&sprite).unwrap();

    let mut group = c.benchmark_group("sprite_serde");
    group.bench_function("serialize", |b| {
        b.iter(|| serde_json::to_string(black_box(&sprite)).unwrap())
    });
    group.bench_function("deserialize", |b| {
        b.iter(|| serde_json::from_str::<Sprite>(black_box(&json)).unwrap())
    });
    group.finish();
}

criterion_group!(
    bottlenecks,
    bench_grid_vertex_gen,
    bench_sprite_lookup,
    bench_table_id_filter,
    bench_polygon_verts,
    bench_sprite_serde,
);
criterion_main!(bottlenecks);
