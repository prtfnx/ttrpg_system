use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const FNV_OFFSET_BASIS: u64 = 0xcbf29ce484222325;
const FNV_PRIME: u64 = 0x100000001b3;

fn collect_rust_sources(directory: &Path, files: &mut Vec<PathBuf>) {
    let mut entries = fs::read_dir(directory)
        .unwrap_or_else(|error| panic!("failed to read {}: {error}", directory.display()))
        .map(|entry| entry.expect("failed to read source directory entry").path())
        .collect::<Vec<_>>();
    entries.sort();
    for path in entries {
        if path.is_dir() {
            collect_rust_sources(&path, files);
        } else if path.extension().is_some_and(|extension| extension == "rs") {
            files.push(path);
        }
    }
}

fn update_hash(hash: &mut u64, bytes: &[u8]) {
    for byte in bytes {
        *hash ^= u64::from(*byte);
        *hash = hash.wrapping_mul(FNV_PRIME);
    }
}

fn main() {
    let root = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("manifest directory"));
    let mut files = vec![
        root.join("build.rs"),
        root.join("Cargo.toml"),
        root.join("Cargo.lock"),
    ];
    collect_rust_sources(&root.join("src"), &mut files);
    files.sort_by_key(|path| path.strip_prefix(&root).unwrap().to_path_buf());

    let mut hash = FNV_OFFSET_BASIS;
    for path in files {
        let relative = path
            .strip_prefix(&root)
            .expect("fingerprinted file must be inside the crate")
            .to_string_lossy()
            .replace('\\', "/");
        println!("cargo:rerun-if-changed={relative}");
        update_hash(&mut hash, relative.as_bytes());
        update_hash(&mut hash, &[0]);
        update_hash(
            &mut hash,
            &fs::read(&path)
                .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display())),
        );
        update_hash(&mut hash, &[0]);
    }

    println!("cargo:rustc-env=TTRPG_CORE_BUILD_FINGERPRINT=fnv1a64:{hash:016x}");
}
