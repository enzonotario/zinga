use std::thread;
use std::time::{Duration, Instant};

use super::REMOTE_SERVER_PORT;

pub fn looks_like_zinga(comm: &str, exe_name: Option<&str>) -> bool {
    let comm = comm.trim().to_ascii_lowercase();
    if comm.starts_with("zinga") {
        return true;
    }
    exe_name
        .map(|name| name.to_ascii_lowercase().starts_with("zinga"))
        .unwrap_or(false)
}

pub fn close_other_instances() -> Result<u32, String> {
    let self_pid = std::process::id();
    let pids = other_zinga_pids(self_pid);
    let mut ffmpeg_pids = descendant_ffmpeg(self_pid);
    ffmpeg_pids.extend(
        zinga_marked_ffmpeg()
            .into_iter()
            .filter(|pid| !shares_process_tree(*pid, self_pid)),
    );
    ffmpeg_pids.sort_unstable();
    ffmpeg_pids.dedup();

    if pids.is_empty() && ffmpeg_pids.is_empty() {
        return Ok(0);
    }

    for pid in &pids {
        signal(*pid, false);
    }
    for pid in &ffmpeg_pids {
        signal(*pid, false);
    }

    let deadline = Instant::now() + Duration::from_secs(2);
    while Instant::now() < deadline {
        let alive = pids.iter().any(|pid| process_alive(*pid));
        if !alive && !port_in_use(REMOTE_SERVER_PORT) {
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }
    for pid in &pids {
        if process_alive(*pid) {
            signal(*pid, true);
        }
    }
    for pid in &ffmpeg_pids {
        if process_alive(*pid) {
            signal(*pid, true);
        }
    }
    thread::sleep(Duration::from_millis(200));
    sweep_orphan_zinga_ffmpeg(self_pid);
    Ok(pids.len() as u32)
}

pub fn cleanup_ffmpeg_on_exit() {
    let self_pid = std::process::id();
    let mut ffmpeg_pids = descendant_ffmpeg(self_pid);
    ffmpeg_pids.extend(zinga_marked_ffmpeg());
    ffmpeg_pids.sort_unstable();
    ffmpeg_pids.dedup();
    for pid in &ffmpeg_pids {
        signal(*pid, false);
    }
    thread::sleep(Duration::from_millis(150));
    for pid in &ffmpeg_pids {
        if process_alive(*pid) {
            signal(*pid, true);
        }
    }
}

fn sweep_orphan_zinga_ffmpeg(self_pid: u32) {
    for pid in zinga_marked_ffmpeg() {
        if shares_process_tree(pid, self_pid) {
            continue;
        }
        signal(pid, true);
    }
}

fn port_in_use(port: u16) -> bool {
    match std::net::TcpListener::bind(("0.0.0.0", port)) {
        Ok(listener) => {
            drop(listener);
            false
        }
        Err(error) => error.kind() == std::io::ErrorKind::AddrInUse,
    }
}

fn cmdline_looks_like_zinga_ffmpeg_str(cmdline: &str) -> bool {
    let lower = cmdline.to_ascii_lowercase();
    lower.contains("zinga-mpd") || lower.contains("com.enzonotario.zinga")
}

#[cfg(target_os = "linux")]
mod platform {
    use super::{cmdline_looks_like_zinga_ffmpeg_str, looks_like_zinga};
    use std::fs;
    use std::path::Path;
    use std::process::Command;

    pub(super) fn other_zinga_pids(self_pid: u32) -> Vec<u32> {
        let Ok(entries) = fs::read_dir("/proc") else {
            return Vec::new();
        };
        let mut pids = Vec::new();
        for entry in entries.flatten() {
            let Some(pid) = entry
                .file_name()
                .to_str()
                .and_then(|name| name.parse::<u32>().ok())
            else {
                continue;
            };
            if pid == self_pid || shares_process_tree(pid, self_pid) || !process_is_zinga(pid) {
                continue;
            }
            pids.push(pid);
        }
        pids
    }

    pub(super) fn descendant_ffmpeg(root: u32) -> Vec<u32> {
        let Ok(entries) = fs::read_dir("/proc") else {
            return Vec::new();
        };
        let mut pids = Vec::new();
        for entry in entries.flatten() {
            let Some(pid) = entry
                .file_name()
                .to_str()
                .and_then(|name| name.parse::<u32>().ok())
            else {
                continue;
            };
            if pid == root || !process_is_ffmpeg(pid) {
                continue;
            }
            if shares_process_tree(pid, root) {
                pids.push(pid);
            }
        }
        pids
    }

    pub(super) fn zinga_marked_ffmpeg() -> Vec<u32> {
        let Ok(entries) = fs::read_dir("/proc") else {
            return Vec::new();
        };
        let mut pids = Vec::new();
        for entry in entries.flatten() {
            let Some(pid) = entry
                .file_name()
                .to_str()
                .and_then(|name| name.parse::<u32>().ok())
            else {
                continue;
            };
            if process_is_ffmpeg(pid) && cmdline_looks_like_zinga_ffmpeg(pid) {
                pids.push(pid);
            }
        }
        pids
    }

    pub(super) fn shares_process_tree(pid: u32, self_pid: u32) -> bool {
        if pid == self_pid {
            return true;
        }
        let mut current = pid;
        for _ in 0..64 {
            let Some(parent) = parent_pid(current) else {
                break;
            };
            if parent == self_pid {
                return true;
            }
            if parent <= 1 {
                break;
            }
            current = parent;
        }
        let mut current = self_pid;
        for _ in 0..64 {
            let Some(parent) = parent_pid(current) else {
                return false;
            };
            if parent == pid {
                return true;
            }
            if parent <= 1 {
                return false;
            }
            current = parent;
        }
        false
    }

    pub(super) fn process_alive(pid: u32) -> bool {
        Path::new(&format!("/proc/{pid}")).exists()
    }

    pub(super) fn signal(pid: u32, force: bool) {
        let signal = if force { "-KILL" } else { "-TERM" };
        let _ = Command::new("kill")
            .args([signal, &pid.to_string()])
            .status();
    }

    fn process_is_zinga(pid: u32) -> bool {
        let comm = fs::read_to_string(format!("/proc/{pid}/comm")).unwrap_or_default();
        let exe_name = fs::read_link(format!("/proc/{pid}/exe"))
            .ok()
            .and_then(|path| {
                path.file_name()
                    .map(|name| name.to_string_lossy().into_owned())
            });
        looks_like_zinga(&comm, exe_name.as_deref())
    }

    fn process_is_ffmpeg(pid: u32) -> bool {
        let comm = fs::read_to_string(format!("/proc/{pid}/comm")).unwrap_or_default();
        comm.trim().eq_ignore_ascii_case("ffmpeg")
    }

    fn cmdline_looks_like_zinga_ffmpeg(pid: u32) -> bool {
        let Ok(bytes) = fs::read(format!("/proc/{pid}/cmdline")) else {
            return false;
        };
        let cmdline = String::from_utf8_lossy(&bytes).replace('\0', " ");
        cmdline_looks_like_zinga_ffmpeg_str(&cmdline)
    }

    fn parent_pid(pid: u32) -> Option<u32> {
        let status = fs::read_to_string(format!("/proc/{pid}/status")).ok()?;
        for line in status.lines() {
            if let Some(rest) = line.strip_prefix("PPid:") {
                return rest.trim().parse().ok();
            }
        }
        None
    }
}

#[cfg(windows)]
mod platform {
    use super::{cmdline_looks_like_zinga_ffmpeg_str, looks_like_zinga};
    use std::collections::HashMap;
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    #[derive(Clone)]
    struct ProcessInfo {
        pid: u32,
        name: String,
        cmdline: String,
        parent: u32,
    }

    pub(super) fn other_zinga_pids(self_pid: u32) -> Vec<u32> {
        let processes = list_processes();
        processes
            .iter()
            .filter(|process| {
                process.pid != self_pid
                    && looks_like_zinga(&process.name, Some(&process.name))
                    && !shares_process_tree_with(&processes, process.pid, self_pid)
            })
            .map(|process| process.pid)
            .collect()
    }

    pub(super) fn descendant_ffmpeg(root: u32) -> Vec<u32> {
        let processes = list_processes();
        processes
            .iter()
            .filter(|process| {
                process.pid != root
                    && process.name.eq_ignore_ascii_case("ffmpeg.exe")
                    && shares_process_tree_with(&processes, process.pid, root)
            })
            .map(|process| process.pid)
            .collect()
    }

    pub(super) fn zinga_marked_ffmpeg() -> Vec<u32> {
        list_processes()
            .into_iter()
            .filter(|process| {
                process.name.eq_ignore_ascii_case("ffmpeg.exe")
                    && cmdline_looks_like_zinga_ffmpeg_str(&process.cmdline)
            })
            .map(|process| process.pid)
            .collect()
    }

    pub(super) fn shares_process_tree(pid: u32, self_pid: u32) -> bool {
        shares_process_tree_with(&list_processes(), pid, self_pid)
    }

    pub(super) fn process_alive(pid: u32) -> bool {
        list_processes().iter().any(|process| process.pid == pid)
    }

    pub(super) fn signal(pid: u32, force: bool) {
        let mut command = Command::new("taskkill");
        command.creation_flags(CREATE_NO_WINDOW);
        command.arg("/PID").arg(pid.to_string());
        if force {
            command.arg("/F");
        }
        let _ = command.status();
    }

    fn shares_process_tree_with(processes: &[ProcessInfo], pid: u32, self_pid: u32) -> bool {
        if pid == self_pid {
            return true;
        }
        let parents: HashMap<u32, u32> = processes
            .iter()
            .map(|process| (process.pid, process.parent))
            .collect();
        let mut current = pid;
        for _ in 0..64 {
            let Some(parent) = parents.get(&current).copied() else {
                break;
            };
            if parent == self_pid {
                return true;
            }
            if parent == 0 || parent == current {
                break;
            }
            current = parent;
        }
        let mut current = self_pid;
        for _ in 0..64 {
            let Some(parent) = parents.get(&current).copied() else {
                return false;
            };
            if parent == pid {
                return true;
            }
            if parent == 0 || parent == current {
                return false;
            }
            current = parent;
        }
        false
    }

    fn list_processes() -> Vec<ProcessInfo> {
        let mut command = Command::new("powershell");
        command.creation_flags(CREATE_NO_WINDOW);
        command.args([
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine,ParentProcessId | ConvertTo-Csv -NoTypeInformation",
        ]);
        let Ok(output) = command.output() else {
            return Vec::new();
        };
        if !output.status.success() {
            return Vec::new();
        }
        parse_process_csv(&String::from_utf8_lossy(&output.stdout))
    }

    fn parse_process_csv(csv: &str) -> Vec<ProcessInfo> {
        csv.lines()
            .skip(1)
            .filter_map(|line| {
                let cols = split_csv_line(line);
                let pid = cols.first()?.trim_matches('"').parse().ok()?;
                let name = cols.get(1)?.trim_matches('"').to_string();
                let cmdline = cols
                    .get(2)
                    .map(|value| value.trim_matches('"').to_string())
                    .unwrap_or_default();
                let parent = cols
                    .get(3)
                    .and_then(|value| value.trim_matches('"').parse().ok())
                    .unwrap_or(0);
                Some(ProcessInfo {
                    pid,
                    name,
                    cmdline,
                    parent,
                })
            })
            .collect()
    }

    fn split_csv_line(line: &str) -> Vec<String> {
        let mut fields = Vec::new();
        let mut current = String::new();
        let mut in_quotes = false;
        let mut chars = line.chars().peekable();
        while let Some(ch) = chars.next() {
            match ch {
                '"' => {
                    if in_quotes && chars.peek() == Some(&'"') {
                        current.push('"');
                        chars.next();
                    } else {
                        in_quotes = !in_quotes;
                    }
                }
                ',' if !in_quotes => {
                    fields.push(std::mem::take(&mut current));
                }
                _ => current.push(ch),
            }
        }
        fields.push(current);
        fields
    }
}

#[cfg(not(any(target_os = "linux", windows)))]
mod platform {
    pub(super) fn other_zinga_pids(_self_pid: u32) -> Vec<u32> {
        Vec::new()
    }

    pub(super) fn descendant_ffmpeg(_root: u32) -> Vec<u32> {
        Vec::new()
    }

    pub(super) fn zinga_marked_ffmpeg() -> Vec<u32> {
        Vec::new()
    }

    pub(super) fn shares_process_tree(pid: u32, self_pid: u32) -> bool {
        pid == self_pid
    }

    pub(super) fn process_alive(_pid: u32) -> bool {
        false
    }

    pub(super) fn signal(_pid: u32, _force: bool) {}
}

use platform::{
    descendant_ffmpeg, other_zinga_pids, process_alive, shares_process_tree, signal,
    zinga_marked_ffmpeg,
};

#[cfg(test)]
mod tests {
    use super::{cmdline_looks_like_zinga_ffmpeg_str, looks_like_zinga};

    #[test]
    fn matches_zinga_process_names() {
        assert!(looks_like_zinga("zinga", None));
        assert!(looks_like_zinga("Zinga_0.0.1_amd", None));
        assert!(looks_like_zinga("AppRun", Some("zinga")));
        assert!(looks_like_zinga("zinga.exe", Some("zinga.exe")));
        assert!(!looks_like_zinga("ffmpeg", None));
        assert!(!looks_like_zinga(
            "WebKitWebProces",
            Some("WebKitWebProcess")
        ));
    }

    #[test]
    fn matches_zinga_ffmpeg_cmdline() {
        assert!(cmdline_looks_like_zinga_ffmpeg_str(
            "ffmpeg -i /home/enzo/.cache/com.enzonotario.zinga/zinga-mpd/123.mpd -f s16le pipe:1"
        ));
        assert!(!cmdline_looks_like_zinga_ffmpeg_str(
            "ffmpeg -i /tmp/other.mpd -f s16le pipe:1"
        ));
    }
}
