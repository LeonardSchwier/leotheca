#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Disable WebGL and GPU compositing to fix EGL_BAD_PARAMETER on Wayland
    // (Fedora 43, GNOME 47, Mesa 25.3). Without these, WebKitGTK aborts
    // before the app can show anything.
    std::env::set_var("WEBKIT_DISABLE_WEBGL", "1");
    std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    std::env::set_var("WEBKIT_DISABLE_GPU", "1");
    leotheca_lib::run();
}
