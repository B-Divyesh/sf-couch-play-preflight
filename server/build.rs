use std::{env, process::Command};

fn main() {
    println!("cargo:rerun-if-env-changed=BUILD_SHA");
    println!("cargo:rerun-if-changed=../.git/HEAD");

    let sha = env::var("BUILD_SHA").ok().filter(|value| !value.trim().is_empty()).or_else(|| {
        Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(env::var("CARGO_MANIFEST_DIR").expect("manifest directory"))
            .output()
            .ok()
            .filter(|output| output.status.success())
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|value| value.trim().to_owned())
    }).unwrap_or_else(|| "development".to_owned());

    println!("cargo:rustc-env=ROOM_READY_BUILD_SHA={sha}");
}
