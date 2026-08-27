import os
import subprocess
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[1]
LAUNCHER = PROJECT_DIR / "run-phone-companion.sh"


def test_phone_launcher_enables_lan_chat_and_confirmed_downloads(tmp_path):
    capture = tmp_path / "capture-launch.sh"
    capture.write_text(
        "#!/usr/bin/env bash\n"
        "printf '%s\\n' \"$DIVTUBE_REMOTE_COMPANION_ENABLED\"\n"
        "printf '%s\\n' \"$DIVTUBE_REMOTE_COMPANION_LAN_ENABLED\"\n"
        "printf '%s\\n' \"$DIVTUBE_REMOTE_COMPANION_MODE\"\n"
        "printf '%s\\n' \"$DIVTUBE_REMOTE_COMPANION_PORT\"\n"
        "pwd\n",
        encoding="utf-8",
    )
    capture.chmod(0o755)

    env = os.environ.copy()
    env["DIVTUBE_LAUNCH_TARGET"] = str(capture)
    result = subprocess.run(
        [str(LAUNCHER)],
        cwd=tmp_path,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.splitlines() == [
        "true",
        "true",
        "downloads_confirmed",
        # Pinned instead of the OS-assigned ephemeral port every prior
        # gateway restart got — some networks appear to treat that high
        # random-port range differently from an ordinary fixed one.
        "8766",
        str(PROJECT_DIR),
    ]
