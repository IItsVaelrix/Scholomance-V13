import subprocess
import threading
import os

from tui.utils.throttle import gradle_throttle

class AgentService:
    def __init__(self):
        pass

    def run_command(self, cmd_num, url, callback, controller=None):
        token = controller.begin_agent() if controller else None

        def run():
            gradle_throttle.wait()
            env = os.environ.copy()
            env["JAVA_HOME"] = "/home/deck/.var/app/com.visualstudio.code/data/vscode/extensions/redhat.java-1.54.0-linux-x64/jre/21.0.10-linux-x86_64"
            env["PATH"] = env["JAVA_HOME"] + "/bin:" + env["PATH"]

            proc = None
            try:
                proc = subprocess.Popen(["./gradle-8.5/bin/gradle", "run", "-q"],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, env=env)
                if controller:
                    controller.register_agent_proc(proc)

                inputs = f"{cmd_num}\n{url}\ny\n3\n" if cmd_num == "2" else f"{cmd_num}\n{url}\n3\n"
                proc.stdin.write(inputs)
                proc.stdin.flush()

                output = proc.stdout.read()
                proc.wait()

                # Esc pressed while running → suppress output entirely.
                if controller and controller.agent_cancelled(token):
                    return

                for line in output.split('\n'):
                    if line.strip():
                        callback(f"[#FFD700]>[/] {line}")

                callback("[#7CFF8B]Task complete.[/]")
            except Exception as e:
                if not (controller and controller.agent_cancelled(token)):
                    callback(f"[#FF5C7A]Agent Error:[/] {e}")
            finally:
                if controller:
                    if proc:
                        controller.unregister_agent_proc(proc)
                    controller.end_agent()

        threading.Thread(target=run).start()
