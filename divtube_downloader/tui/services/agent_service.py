import glob
import os
import re
import shutil
import subprocess
import threading

from tui.utils.throttle import gradle_throttle


def _is_valid_java_home(path):
    """A JAVA_HOME is usable only if it actually contains a java launcher."""
    return bool(path) and os.path.isfile(os.path.join(path, "bin", "java"))


def _version_key(path):
    """Natural-order sort key so redhat.java-1.55.0 ranks above 1.54.0 / 1.9.0."""
    return [int(n) for n in re.findall(r"\d+", path)]


# JDKs are discovered dynamically: the old hard-coded VSCode-extension path broke
# the moment the Java extension auto-updated (1.54.0 → 1.55.0), which silently
# killed every gradle-backed feature (/download, /analyze). Globs survive bumps.
_DEFAULT_JAVA_GLOBS = [
    os.path.expanduser(
        "~/.var/app/com.visualstudio.code/data/vscode/extensions/redhat.java-*/jre/*"
    ),
    os.path.expanduser("~/.vscode/extensions/redhat.java-*/jre/*"),
    os.path.expanduser("~/.vscode-server/extensions/redhat.java-*/jre/*"),
    "/usr/lib/jvm/*",
    "/usr/lib/jvm/*/jre",
]


def resolve_java_home(env=None, search_globs=None):
    """Find a usable JAVA_HOME without hard-coding a version-pinned path.

    Order: an already-valid JAVA_HOME, then the newest bundled/system JDK matched
    by glob, then whatever `java` is on PATH. Returns None if nothing is found.
    """
    env = os.environ if env is None else env
    globs = _DEFAULT_JAVA_GLOBS if search_globs is None else search_globs

    jh = env.get("JAVA_HOME")
    if _is_valid_java_home(jh):
        return jh

    candidates = []
    for pattern in globs:
        candidates.extend(p for p in glob.glob(pattern) if _is_valid_java_home(p))
    if candidates:
        candidates.sort(key=_version_key)
        return candidates[-1]

    java = shutil.which("java", path=env.get("PATH"))
    if java:
        # <home>/bin/java → <home>
        return os.path.dirname(os.path.dirname(os.path.realpath(java)))

    return None


# Menu options driven over the Java backend's stdin.
CMD_DOWNLOAD_VIDEO = "2"
CMD_DOWNLOAD_AUDIO = "6"
_DOWNLOAD_CMDS = (CMD_DOWNLOAD_VIDEO, CMD_DOWNLOAD_AUDIO)
_AUDIO_FLAGS = ("--audio", "--mp3", "-a")


def parse_download_args(args):
    """Split /download arguments into (url, audio_only). The --audio/--mp3/-a flag
    may appear before or after the URL."""
    args = args or []
    audio = any(a in _AUDIO_FLAGS for a in args)
    url = next((a for a in args if not a.startswith("-")), "")
    return url, audio


def build_agent_inputs(cmd_num, url):
    """Build the stdin script fed to the Java menu. Download options (video/audio)
    must answer the y/n rights-confirmation prompt; others skip it."""
    if cmd_num in _DOWNLOAD_CMDS:
        return f"{cmd_num}\n{url}\ny\n3\n"
    return f"{cmd_num}\n{url}\n3\n"


# The Java backend emits one of these per yt-dlp progress tick:
#   Progress: 6.1% | 14.45MiB/s | 00:00
_PROGRESS_RE = re.compile(r"Progress:\s*([0-9.]+)%\s*\|\s*(.*?)\s*\|\s*(.*)")


def parse_progress_line(line):
    """Return (percent, speed, eta) for a backend progress line, else None."""
    m = _PROGRESS_RE.search(line or "")
    if not m:
        return None
    try:
        return float(m.group(1)), m.group(2).strip(), m.group(3).strip()
    except ValueError:
        return None


class AgentService:
    def __init__(self):
        pass

    def run_command(self, cmd_num, url, callback, controller=None,
                    on_progress=None, on_done=None):
        token = controller.begin_agent() if controller else None

        def run():
            success = False
            gradle_throttle.wait()
            env = os.environ.copy()
            java_home = resolve_java_home(env)
            if not java_home:
                if not (controller and controller.agent_cancelled(token)):
                    callback(
                        "[#FF5C7A]Java not found.[/] Install a JDK 17+ or set "
                        "JAVA_HOME — the download/analyze backend needs it."
                    )
                if controller:
                    controller.end_agent()
                return
            env["JAVA_HOME"] = java_home
            env["PATH"] = os.path.join(java_home, "bin") + os.pathsep + env.get("PATH", "")

            proc = None
            try:
                proc = subprocess.Popen(["./gradle-8.5/bin/gradle", "run", "-q"],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, env=env)
                if controller:
                    controller.register_agent_proc(proc)

                inputs = build_agent_inputs(cmd_num, url)
                proc.stdin.write(inputs)
                proc.stdin.flush()

                # Stream stdout line-by-line so download progress reaches the UI
                # live instead of arriving in one batch after the process exits.
                # readline (not `for line in proc.stdout`) avoids the iterator's
                # read-ahead buffering that would otherwise delay progress ticks.
                for raw in iter(proc.stdout.readline, ""):
                    if controller and controller.agent_cancelled(token):
                        break  # Esc pressed — stop forwarding output
                    line = raw.rstrip("\n")
                    if not line.strip():
                        continue
                    progress = parse_progress_line(line)
                    if progress is not None:
                        if on_progress:
                            on_progress(*progress)
                        continue  # drive the meter; don't spam the chat
                    callback(f"[#FFD700]>[/] {line}")
                proc.wait()

                if controller and controller.agent_cancelled(token):
                    return

                success = True
                callback("[#7CFF8B]Task complete.[/]")
            except Exception as e:
                if not (controller and controller.agent_cancelled(token)):
                    callback(f"[#FF5C7A]Agent Error:[/] {e}")
            finally:
                if on_done:
                    on_done(success)
                if controller:
                    if proc:
                        controller.unregister_agent_proc(proc)
                    controller.end_agent()

        threading.Thread(target=run).start()
