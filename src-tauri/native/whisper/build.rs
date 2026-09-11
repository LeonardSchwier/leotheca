//! Build script for whisper.cpp FFI bindings
//!
//! This script:
//! 1. Downloads whisper.cpp source (or uses vendored source)
//! 2. Compiles whisper.cpp as a static library
//! 3. Generates Rust FFI bindings

use std::env;
use std::path::Path;

fn main() {
    // Tell Cargo to look for the static library
    println!("cargo:rustc-link-lib=static=whisper");
    println!("cargo:rustc-link-search=native=src-tauri/native/whisper/target");
    
    // For macOS, we need to link against Accelerate framework
    if cfg!(target_os = "macos") {
        println!("cargo:rustc-link-arg=-framework");
        println!("cargo:rustc-link-arg=Accelerate");
    }
    
    // Re-run build script if whisper.cpp source changes
    println!("cargo:rerun-if-changed=src-tauri/native/whisper/whisper.cpp");
    println!("cargo:rerun-if-changed=src-tauri/native/whisper/whisper.h");
}