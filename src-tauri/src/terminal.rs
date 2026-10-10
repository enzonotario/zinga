use crate::setup::{can_run_install, EXTERNAL_ENV_DENYLIST, INSTALL_COMMAND};
use portable_pty::{native_pty_system, Child, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::sync::mpsc;
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

const DEFAULT_COLS: u16 = 100;
const DEFAULT_ROWS: u16 = 30;
const OUTPUT_DRAIN_TIMEOUT: Duration = Duration::from_secs(1);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum TerminalCommand {
    InstallDependencies,
}

impl TerminalCommand {
    fn is_allowed(self) -> bool {
        match self {
            Self::InstallDependencies => can_run_install(),
        }
    }

    fn builder(self) -> CommandBuilder {
        match self {
            Self::InstallDependencies => shell_command(INSTALL_COMMAND),
        }
    }
}

#[derive(Clone, Serialize)]
struct TerminalOutput {
    id: String,
    data: String,
}

#[derive(Clone, Serialize)]
struct TerminalExit {
    id: String,
    code: Option<u32>,
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

struct SpawnedPty {
    session: Session,
    reader: Box<dyn Read + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct TerminalState {
    sessions: Mutex<HashMap<String, Session>>,
}

impl TerminalState {
    fn sessions(&self) -> Result<MutexGuard<'_, HashMap<String, Session>>, String> {
        self.sessions
            .lock()
            .map_err(|_| "Terminal state is unavailable".to_string())
    }

    fn remove(&self, id: &str) -> Option<Session> {
        self.sessions.lock().ok()?.remove(id)
    }
}

fn shell_command(script: &str) -> CommandBuilder {
    let mut builder = CommandBuilder::new("bash");
    builder.args(["-lc", script]);
    builder.env("TERM", "xterm-256color");
    for key in EXTERNAL_ENV_DENYLIST {
        builder.env_remove(key);
    }
    builder
}

fn pty_size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }
}

fn spawn_pty(builder: CommandBuilder, size: PtySize) -> Result<SpawnedPty, String> {
    let pair = native_pty_system()
        .openpty(size)
        .map_err(|e| format!("Failed to open PTY: {e}"))?;
    let child = pair
        .slave
        .spawn_command(builder)
        .map_err(|e| format!("Failed to start command: {e}"))?;
    drop(pair.slave);
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to read PTY: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to write PTY: {e}"))?;
    let killer = child.clone_killer();
    Ok(SpawnedPty {
        session: Session {
            master: pair.master,
            writer,
            killer,
        },
        reader,
        child,
    })
}

fn incomplete_utf8_tail(bytes: &[u8]) -> usize {
    for back in 1..=bytes.len().min(3) {
        let byte = bytes[bytes.len() - back];
        if byte & 0xC0 == 0x80 {
            continue;
        }
        let needed = match byte {
            0xF0.. => 4,
            0xE0.. => 3,
            0xC0.. => 2,
            _ => 1,
        };
        return if needed > back { back } else { 0 };
    }
    0
}

fn take_utf8(pending: &mut Vec<u8>) -> String {
    let complete = pending.len() - incomplete_utf8_tail(pending);
    let text = String::from_utf8_lossy(&pending[..complete]).into_owned();
    pending.drain(..complete);
    text
}

fn pump_output(mut reader: Box<dyn Read + Send>, mut on_output: impl FnMut(String)) {
    let mut buffer = [0u8; 8192];
    let mut pending = Vec::new();
    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => {
                pending.extend_from_slice(&buffer[..n]);
                let text = take_utf8(&mut pending);
                if !text.is_empty() {
                    on_output(text);
                }
            }
            Err(e) if e.kind() == ErrorKind::Interrupted => continue,
            Err(_) => break,
        }
    }
    if !pending.is_empty() {
        on_output(String::from_utf8_lossy(&pending).into_owned());
    }
}

fn run_to_exit(
    reader: Box<dyn Read + Send>,
    mut child: Box<dyn Child + Send + Sync>,
    on_output: impl FnMut(String) + Send + 'static,
) -> Option<u32> {
    let (done_tx, done_rx) = mpsc::channel();
    std::thread::spawn(move || {
        pump_output(reader, on_output);
        let _ = done_tx.send(());
    });
    let code = child.wait().ok().map(|status| status.exit_code());
    let _ = done_rx.recv_timeout(OUTPUT_DRAIN_TIMEOUT);
    code
}

#[tauri::command]
pub async fn terminal_start(
    app: AppHandle,
    state: State<'_, TerminalState>,
    command: TerminalCommand,
) -> Result<String, String> {
    if !command.is_allowed() {
        return Err("This command is not available on this system".to_string());
    }

    let mut sessions = state.sessions()?;
    if !sessions.is_empty() {
        return Err("A terminal session is already running".to_string());
    }

    let SpawnedPty {
        session,
        reader,
        child,
    } = spawn_pty(command.builder(), pty_size(DEFAULT_COLS, DEFAULT_ROWS))?;
    let id = uuid::Uuid::new_v4().to_string();
    sessions.insert(id.clone(), session);
    drop(sessions);

    let output_app = app.clone();
    let output_id = id.clone();
    let exit_id = id.clone();
    std::thread::spawn(move || {
        let code = run_to_exit(reader, child, move |data| {
            let _ = output_app.emit(
                "terminal-output",
                TerminalOutput {
                    id: output_id.clone(),
                    data,
                },
            );
        });
        app.state::<TerminalState>().remove(&exit_id);
        let _ = app.emit("terminal-exit", TerminalExit { id: exit_id, code });
    });

    Ok(id)
}

#[tauri::command]
pub async fn terminal_write(
    state: State<'_, TerminalState>,
    id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = state.sessions()?;
    let session = sessions
        .get_mut(&id)
        .ok_or_else(|| "Terminal session not found".to_string())?;
    session
        .writer
        .write_all(data.as_bytes())
        .and_then(|_| session.writer.flush())
        .map_err(|e| format!("Failed to write to terminal: {e}"))
}

#[tauri::command]
pub async fn terminal_resize(
    state: State<'_, TerminalState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    if cols == 0 || rows == 0 {
        return Ok(());
    }
    let sessions = state.sessions()?;
    let session = sessions
        .get(&id)
        .ok_or_else(|| "Terminal session not found".to_string())?;
    session
        .master
        .resize(pty_size(cols, rows))
        .map_err(|e| format!("Failed to resize terminal: {e}"))
}

#[tauri::command]
pub async fn terminal_kill(state: State<'_, TerminalState>, id: String) -> Result<(), String> {
    let Some(mut session) = state.remove(&id) else {
        return Ok(());
    };
    session
        .killer
        .kill()
        .map_err(|e| format!("Failed to stop terminal: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn collect_until(rx: &mpsc::Receiver<String>, needle: &str) -> String {
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut output = String::new();
        while !output.contains(needle) && Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(100)) {
                Ok(chunk) => output.push_str(&chunk),
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        output
    }

    fn run(builder: CommandBuilder) -> (String, Option<u32>) {
        let SpawnedPty {
            session,
            reader,
            child,
        } = spawn_pty(builder, pty_size(DEFAULT_COLS, DEFAULT_ROWS)).unwrap();
        let (tx, rx) = mpsc::channel();
        let code = run_to_exit(reader, child, move |chunk| {
            let _ = tx.send(chunk);
        });
        let output = collect_until(&rx, "hello");
        drop(session);
        (output, code)
    }

    #[test]
    fn streams_pty_output_and_exit_code() {
        let mut builder = CommandBuilder::new("echo");
        builder.arg("hello");
        let (output, code) = run(builder);
        assert!(output.contains("hello"), "unexpected output: {output:?}");
        assert_eq!(code, Some(0));
    }

    #[test]
    fn reports_non_zero_exit_code() {
        let (output, code) = run(shell_command("echo hello; exit 3"));
        assert!(output.contains("hello"), "unexpected output: {output:?}");
        assert_eq!(code, Some(3));
    }

    #[test]
    fn install_command_runs_through_a_sanitized_login_shell() {
        let builder = TerminalCommand::InstallDependencies.builder();
        let argv: Vec<_> = builder
            .get_argv()
            .iter()
            .map(|a| a.to_str().unwrap())
            .collect();
        assert_eq!(argv, ["bash", "-lc", INSTALL_COMMAND]);
        for key in EXTERNAL_ENV_DENYLIST {
            assert!(builder.get_env(key).is_none(), "{key} was not removed");
        }
    }

    #[test]
    fn only_allowlisted_commands_deserialize() {
        let command: TerminalCommand =
            serde_json::from_value("InstallDependencies".into()).unwrap();
        assert_eq!(command, TerminalCommand::InstallDependencies);
        assert!(serde_json::from_value::<TerminalCommand>("rm -rf /".into()).is_err());
        assert!(
            serde_json::from_value::<TerminalCommand>(serde_json::json!({ "Shell": "id" }))
                .is_err()
        );
    }

    #[test]
    fn keeps_split_utf8_sequences_for_the_next_chunk() {
        let bytes = "añ".as_bytes();
        let mut pending = bytes[..2].to_vec();
        assert_eq!(take_utf8(&mut pending), "a");
        assert_eq!(pending, [bytes[1]]);
        pending.push(bytes[2]);
        assert_eq!(take_utf8(&mut pending), "ñ");
        assert!(pending.is_empty());
    }
}
