fn main() {
    tauri_build::build();

    // Compile Objective-C helper for safe NSWindow operations on macOS
    #[cfg(target_os = "macos")]
    {
        cc::Build::new()
            .file("src/macos_helper.m")
            .flag("-fobjc-arc")
            .compile("macos_helper");
        println!("cargo:rustc-link-lib=framework=Cocoa");
        println!("cargo:rustc-link-lib=framework=Carbon");
    }
}
