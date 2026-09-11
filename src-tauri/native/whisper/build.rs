//! Build script for whisper.cpp FFI bindings
//!
//! This script:
//! 1. Checks for whisper.cpp source files
//! 2. Compiles whisper.cpp as a static library if source is available
//! 3. Generates Rust FFI bindings using bindgen
//!
//! To use this, place whisper.cpp and whisper.h in src-tauri/native/whisper/
//! and run `cargo build`

use std::env;
use std::path::Path;

fn main() {
    // Check if whisper.cpp source files exist
    // Note: whisper.cpp has moved from ggerganov/whisper.cpp to ggml-org/whisper.cpp
    // and the file structure has changed. Place whisper.cpp and whisper.h in this directory.
    let whisper_cpp = Path::new("whisper.cpp");
    let whisper_h = Path::new("whisper.h");

    let out_dir = env::var("OUT_DIR").unwrap();

    if whisper_cpp.exists() && whisper_h.exists() {
        // whisper.cpp source is available - compile it
        println!("cargo:rerun-if-changed=whisper.cpp");
        println!("cargo:rerun-if-changed=whisper.h");

        // Compile whisper.cpp with CC
        // whisper.cpp requires C++17
        if cfg!(target_os = "macos") {
            cc::Build::new()
                .cpp(true)
                .cpp_set_stdlib("c++17")
                .flag("-O3")
                .flag("-ffast-math")
                .flag("-pthread")
                .include(".")
                .file("whisper.cpp")
                .compile("whisper");

            // For macOS, we need to link against Accelerate framework
            println!("cargo:rustc-link-arg=-framework");
            println!("cargo:rustc-link-arg=Accelerate");
        } else {
            cc::Build::new()
                .cpp(true)
                .flag("-std=c++17")
                .flag("-O3")
                .flag("-ffast-math")
                .flag("-pthread")
                .include(".")
                .file("whisper.cpp")
                .compile("whisper");
        }

        // Tell Cargo to look for the static library
        println!("cargo:rustc-link-lib=static=whisper");
        println!("cargo:rustc-link-search={}", out_dir);

        // For macOS, we need to link against Accelerate framework
        if cfg!(target_os = "macos") {
            println!("cargo:rustc-link-arg=-framework");
            println!("cargo:rustc-link-arg=Accelerate");
        }

        // Generate bindings with bindgen
        let bindings = bindgen::Builder::default()
            .header("whisper.h")
            .parse_callbacks(Box::new(bindgen::CargoCallbacks::new()))
            .generate()
            .expect("Unable to generate bindings");

        // Write the bindings to the $OUT_DIR/bindings.rs file.
        let out_path = Path::new(&out_dir).join("bindings.rs");
        bindings
            .write_to_file(out_path)
            .expect("Couldn't write bindings!");
    } else {
        // whisper.cpp source not available - provide stub implementations
        println!("cargo:warning=whisper.cpp source files not found in src-tauri/native/whisper/");
        println!("cargo:warning=To enable whisper.cpp integration, please place whisper.cpp and whisper.h in that directory");
        println!("cargo:warning=You can obtain whisper.cpp from: https://github.com/ggerganov/whisper.cpp");
        println!(
            "cargo:warning=Note: whisper.cpp requires GGML model files to be present at runtime"
        );

        // Create a stub bindings file
        let stub_bindings = r#"
// Stub bindings for whisper.cpp - source files not available
// To enable real whisper.cpp integration, place whisper.cpp and whisper.h
// in src-tauri/native/whisper/ and rebuild

use libc::c_int;

pub const WHISPER_SAMPLE_RATE: i32 = 16000;

// Opaque type for whisper context
#[repr(C)]
pub struct whisper_context {
    _opaque: [u8; 0],
}

// Opaque type for whisper state
#[repr(C)]
pub struct whisper_state {
    _opaque: [u8; 0],
}

// External C function declarations - these would be provided by whisper.cpp
// In stub mode, these point to our stub implementations below
extern "C" {
    pub fn whisper_init(path: *const std::os::raw::c_char) -> *mut whisper_context;
    pub fn whisper_free(ctx: *mut whisper_context);
    pub fn whisper_full(ctx: *mut whisper_context, params: *mut std::os::raw::c_void, n_samples: c_int) -> c_int;
    pub fn whisper_full_with_state(ctx: *mut whisper_context, params: *mut whisper_state) -> c_int;
    pub fn whisper_full_n_segments(ctx: *mut whisper_context) -> c_int;
    pub fn whisper_full_get_segment_text(ctx: *mut whisper_context, i_segment: c_int) -> *const std::os::raw::c_char;
    pub fn whisper_full_get_segment_t0(ctx: *mut whisper_context, i_segment: c_int) -> i64;
    pub fn whisper_full_get_segment_t1(ctx: *mut whisper_context, i_segment: c_int) -> i64;
    pub fn whisper_print_timings(ctx: *mut whisper_context);
    pub fn whisper_reset_timings(ctx: *mut whisper_context);
}

// Module containing stub implementations
mod stub_impl {
    use super::*;
    
    #[no_mangle]
    pub extern "C" fn whisper_init(_path: *const std::os::raw::c_char) -> *mut whisper_context {
        std::ptr::null_mut()
    }

    #[no_mangle]
    pub extern "C" fn whisper_free(_ctx: *mut whisper_context) {}

    #[no_mangle]
    pub extern "C" fn whisper_full(_ctx: *mut whisper_context, _params: *mut std::os::raw::c_void, _n_samples: c_int) -> c_int {
        0
    }

    #[no_mangle]
    pub extern "C" fn whisper_full_with_state(_ctx: *mut whisper_context, _params: *mut whisper_state) -> c_int {
        -1
    }

    #[no_mangle]
    pub extern "C" fn whisper_full_n_segments(_ctx: *mut whisper_context) -> c_int {
        0
    }

    #[no_mangle]
    pub extern "C" fn whisper_full_get_segment_text(_ctx: *mut whisper_context, _i_segment: c_int) -> *const std::os::raw::c_char {
        std::ptr::null()
    }

    #[no_mangle]
    pub extern "C" fn whisper_full_get_segment_t0(_ctx: *mut whisper_context, _i_segment: c_int) -> i64 {
        0
    }

    #[no_mangle]
    pub extern "C" fn whisper_full_get_segment_t1(_ctx: *mut whisper_context, _i_segment: c_int) -> i64 {
        0
    }

    #[no_mangle]
    pub extern "C" fn whisper_print_timings(_ctx: *mut whisper_context) {}

    #[no_mangle]
    pub extern "C" fn whisper_reset_timings(_ctx: *mut whisper_context) {}
}

"#;

        let out_path = Path::new(&out_dir).join("bindings.rs");
        std::fs::write(out_path, stub_bindings).expect("Couldn't write stub bindings!");
    }
}
