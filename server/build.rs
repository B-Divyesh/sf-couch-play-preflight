use std::{env, fs, path::PathBuf, process::Command};

fn main() {
    println!("cargo:rerun-if-env-changed=BUILD_SHA");
    println!("cargo:rerun-if-env-changed=GIT_SHA");
    println!("cargo:rerun-if-env-changed=SOURCE_COMMIT");
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest directory"));
    let git_dir = manifest_dir.join("..").join(".git");
    let head = git_dir.join("HEAD");
    println!("cargo:rerun-if-changed={}", head.display());
    // On a normal branch HEAD only names a ref, so watching HEAD alone leaves
    // a cached binary reporting the previous commit after `git commit`.
    if let Some(reference) = fs::read_to_string(&head).ok().and_then(|value| value.strip_prefix("ref: ").map(str::trim).map(str::to_owned)) {
        println!("cargo:rerun-if-changed={}", git_dir.join(reference).display());
    }
    println!("cargo:rerun-if-changed={}", git_dir.join("packed-refs").display());

    let supplied_sha = ["BUILD_SHA", "GIT_SHA", "SOURCE_COMMIT"]
        .into_iter()
        .find_map(|name| {
            env::var(name).ok().filter(|value| {
                let value = value.trim();
                !value.is_empty() && value != "development"
            })
        });
    let sha = supplied_sha.or_else(|| {
        Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&manifest_dir)
            .output()
            .ok()
            .filter(|output| output.status.success())
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|value| value.trim().to_owned())
    }).unwrap_or_else(|| "development".to_owned());

    println!("cargo:rustc-env=ROOM_READY_BUILD_SHA={sha}");
}
