use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};

/// Duration of silence (seconds) before auto-stopping the meeting
const AUTO_STOP_SILENCE_SECS: u64 = 150; // 2.5 minutes
/// RMS threshold below which audio is considered silence (for 16-bit samples)
const SILENCE_THRESHOLD: f64 = 200.0;

/// Shared meeting state, managed via `app.manage(Arc<Mutex<MeetingState>>)`
#[derive(Default)]
pub struct MeetingState {
    pub is_recording: bool,
    pub recording_id: Option<String>,
    pub start_time: Option<std::time::Instant>,
    pub audio_path: Option<PathBuf>,
    /// Set to true to signal the recording thread to stop
    pub stop_flag: Option<Arc<AtomicBool>>,
    /// Set to true when auto-stopped due to silence
    pub auto_stopped: bool,
}

/// Start recording microphone audio to a WAV file.
/// Returns (recording_id, wav_path, stop_flag).
///
/// All cpal work happens inside the spawned thread to avoid Send issues
/// (cpal::Stream contains raw pointers that aren't Send).
pub fn start_recording(data_dir: &Path) -> Result<(String, PathBuf, Arc<AtomicBool>), String> {
    use cpal::traits::HostTrait;

    let recording_id = uuid::Uuid::new_v4().to_string();

    // Ensure meetings directory exists
    let meetings_dir = data_dir.join("meetings");
    std::fs::create_dir_all(&meetings_dir)
        .map_err(|e| format!("Failed to create meetings dir: {}", e))?;

    let wav_path = meetings_dir.join(format!("{}.wav", recording_id));

    // Verify mic is available before spawning thread
    let host = cpal::default_host();
    let device = host.default_input_device()
        .ok_or("No microphone found. Please check your audio input settings.")?;

    use cpal::traits::DeviceTrait;
    let config = device.default_input_config()
        .map_err(|e| format!("Failed to get mic config: {}", e))?;

    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as u16;
    let sample_format = config.sample_format();

    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_clone = stop_flag.clone();
    let wav_path_clone = wav_path.clone();

    // Use a channel to report errors from the recording thread
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();

    std::thread::spawn(move || {
        use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

        let host = cpal::default_host();
        let device = match host.default_input_device() {
            Some(d) => d,
            None => {
                let _ = tx.send(Err("No microphone found".to_string()));
                return;
            }
        };

        let config = match device.default_input_config() {
            Ok(c) => c,
            Err(e) => {
                let _ = tx.send(Err(format!("Failed to get mic config: {}", e)));
                return;
            }
        };

        // Create WAV writer
        let spec = hound::WavSpec {
            channels,
            sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let writer = match hound::WavWriter::create(&wav_path_clone, spec) {
            Ok(w) => w,
            Err(e) => {
                let _ = tx.send(Err(format!("Failed to create WAV file: {}", e)));
                return;
            }
        };
        let writer = Arc::new(Mutex::new(Some(writer)));

        let err_fn = |e: cpal::StreamError| {
            eprintln!("[Audio] Stream error: {}", e);
        };

        // Track last time we heard non-silence for auto-stop
        let last_voice = Arc::new(Mutex::new(std::time::Instant::now()));
        let stop_for_silence = stop_clone.clone();

        let writer_clone = writer.clone();
        let last_voice_i16 = last_voice.clone();
        let stream_result = match sample_format {
            cpal::SampleFormat::I16 => {
                device.build_input_stream(
                    &config.into(),
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        // Compute RMS to detect voice activity
                        let rms = (data.iter().map(|&s| (s as f64) * (s as f64)).sum::<f64>()
                            / data.len().max(1) as f64).sqrt();
                        if rms > SILENCE_THRESHOLD {
                            if let Ok(mut t) = last_voice_i16.lock() {
                                *t = std::time::Instant::now();
                            }
                        }
                        if let Ok(mut guard) = writer_clone.lock() {
                            if let Some(ref mut w) = *guard {
                                for &sample in data {
                                    let _ = w.write_sample(sample);
                                }
                            }
                        }
                    },
                    err_fn,
                    None,
                )
            }
            cpal::SampleFormat::F32 => {
                let writer_clone2 = writer.clone();
                let last_voice_f32 = last_voice.clone();
                device.build_input_stream(
                    &config.into(),
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        let rms = (data.iter().map(|&s| {
                            let s16 = s * i16::MAX as f32;
                            (s16 as f64) * (s16 as f64)
                        }).sum::<f64>() / data.len().max(1) as f64).sqrt();
                        if rms > SILENCE_THRESHOLD {
                            if let Ok(mut t) = last_voice_f32.lock() {
                                *t = std::time::Instant::now();
                            }
                        }
                        if let Ok(mut guard) = writer_clone2.lock() {
                            if let Some(ref mut w) = *guard {
                                for &sample in data {
                                    let s = (sample * i16::MAX as f32).clamp(i16::MIN as f32, i16::MAX as f32) as i16;
                                    let _ = w.write_sample(s);
                                }
                            }
                        }
                    },
                    err_fn,
                    None,
                )
            }
            _ => {
                let _ = tx.send(Err(format!("Unsupported sample format: {:?}", sample_format)));
                return;
            }
        };

        let stream = match stream_result {
            Ok(s) => s,
            Err(e) => {
                let _ = tx.send(Err(format!("Failed to build stream: {}", e)));
                return;
            }
        };

        if let Err(e) = stream.play() {
            let _ = tx.send(Err(format!("Failed to start recording: {}", e)));
            return;
        }

        // Signal success
        let _ = tx.send(Ok(()));

        // Hold stream alive until stop_flag is set or silence auto-stop
        while !stop_for_silence.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(500));
            // Auto-stop after 5 min of silence
            if let Ok(t) = last_voice.lock() {
                if t.elapsed() >= std::time::Duration::from_secs(AUTO_STOP_SILENCE_SECS) {
                    println!("[Audio] Auto-stopping after {}s of silence", AUTO_STOP_SILENCE_SECS);
                    stop_for_silence.store(true, Ordering::Relaxed);
                }
            }
        }

        // Drop the stream (stops recording)
        drop(stream);

        // Finalize WAV file
        {
            let mut guard = match writer.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            if let Some(w) = guard.take() {
                if let Err(e) = w.finalize() {
                    eprintln!("[Audio] Failed to finalize WAV: {}", e);
                } else {
                    println!("[Audio] WAV finalized: {:?}", wav_path_clone);
                }
            }
        }
    });

    // Wait for thread to report success or error
    match rx.recv_timeout(std::time::Duration::from_secs(5)) {
        Ok(Ok(())) => {
            println!("[Audio] Recording started: {} ({}Hz, {}ch)", recording_id, sample_rate, channels);
            Ok((recording_id, wav_path, stop_flag))
        }
        Ok(Err(e)) => Err(e),
        Err(_) => Err("Timeout starting audio recording".to_string()),
    }
}

/// Check if a microphone input device is available.
pub fn check_mic_available() -> bool {
    use cpal::traits::HostTrait;
    let host = cpal::default_host();
    host.default_input_device().is_some()
}
