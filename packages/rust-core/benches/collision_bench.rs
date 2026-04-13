use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use ttrpg_rust_core::CollisionSystem;

fn walls_json(n: usize) -> String {
    let segs: Vec<String> = (0..n)
        .map(|i| {
            let x = (i as f64) * 64.0;
            format!(
                r#"{{"x1":{},"y1":0,"x2":{},"y2":640,"is_door":false,"door_open":false}}"#,
                x, x
            )
        })
        .collect();
    format!("[{}]", segs.join(","))
}

fn obstacles_json(n: usize) -> String {
    let obs: Vec<String> = (0..n)
        .map(|i| {
            let x = (i as f64) * 80.0 + 40.0;
            format!(
                r#"{{"id":"o{}","obstacle_type":"circle","x":{},"y":320,"width":0,"height":0,"radius":20,"vertices":[]}}"#,
                i, x
            )
        })
        .collect();
    format!("[{}]", obs.join(","))
}

fn setup_system(n_walls: usize, n_obstacles: usize) -> CollisionSystem {
    let mut sys = CollisionSystem::new(64.0);
    sys.set_walls(&walls_json(n_walls));
    sys.set_obstacles(&obstacles_json(n_obstacles));
    sys
}

fn bench_line_blocked(c: &mut Criterion) {
    let mut group = c.benchmark_group("line_blocked");
    for n in [10, 50, 200] {
        let sys = setup_system(n, n / 2);
        group.bench_with_input(BenchmarkId::from_parameter(n), &n, |b, _| {
            b.iter(|| sys.line_blocked(black_box(0.0), black_box(0.0), black_box(800.0), black_box(600.0)))
        });
    }
    group.finish();
}

fn bench_find_path(c: &mut Criterion) {
    let mut group = c.benchmark_group("find_path");
    for n in [10, 50, 200] {
        let sys = setup_system(n, n / 2);
        group.bench_with_input(BenchmarkId::from_parameter(n), &n, |b, _| {
            b.iter(|| sys.find_path(black_box(0.0), black_box(0.0), black_box(800.0), black_box(600.0)))
        });
    }
    group.finish();
}

fn bench_rebuild_index(c: &mut Criterion) {
    let mut group = c.benchmark_group("rebuild_index");
    for n in [10, 50, 200] {
        group.bench_with_input(BenchmarkId::from_parameter(n), &n, |b, &n| {
            b.iter_batched(
                || setup_system(n, n / 2),
                |mut sys| sys.rebuild_index(),
                criterion::BatchSize::SmallInput,
            )
        });
    }
    group.finish();
}

criterion_group!(benches, bench_line_blocked, bench_find_path, bench_rebuild_index);
criterion_main!(benches);
