//! Throwaway smoke test: decode each audio container/codec we claim to support.
//!   cargo run --example decode_smoke -p ck-core --features transcription -- <files...>

use std::path::PathBuf;

use ck_core::transcription::decode;

fn main() -> anyhow::Result<()> {
    let files: Vec<PathBuf> = std::env::args().skip(1).map(PathBuf::from).collect();
    let mut failed = false;
    for f in &files {
        match decode::decode_to_mono(f, &ck_core::transcription::Watch::default()) {
            Ok((samples, sr)) => {
                let secs = samples.len() as f64 / sr as f64;
                println!(
                    "OK  {:<40} {sr}Hz {:.2}s {} samples",
                    f.display(),
                    secs,
                    samples.len()
                );
            }
            Err(e) => {
                failed = true;
                println!("ERR {:<40} {e:#}", f.display());
            }
        }
    }
    if failed {
        std::process::exit(1);
    }
    Ok(())
}
