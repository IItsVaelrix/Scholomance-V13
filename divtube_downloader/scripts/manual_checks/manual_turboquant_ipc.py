import json
import pathlib
import subprocess

# Was ["node", "turboquant_plugin.js"], which resolved against the *current
# working directory* -- so the harness only ever worked from the module root
# and reported "Process died" with an empty stderr from anywhere else.
PLUGIN = pathlib.Path(__file__).resolve().parents[2] / "turboquant_plugin.js"

def run_test():
    print("Starting TurboQuant IPC Test Harness...")
    
    # Start the Node.js plugin
    process = subprocess.Popen(
        ["node", str(PLUGIN)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    def send_command(payload):
        req = json.dumps(payload)
        process.stdin.write(req + "\n")
        process.stdin.flush()
        
        # Read response
        response_line = process.stdout.readline()
        if not response_line:
            err = process.stderr.read()
            print(f"Error: Process died. Stderr: {err}")
            return None
            
        return json.loads(response_line)
        
    print("\n--- Test 1: PING ---")
    resp = send_command({"id": 1, "action": "ping"})
    print(f"Response: {resp}")
    
    print("\n--- Test 2: REGISTER GOLDEN CURVE ---")
    viral_text = "I beat Elden Ring using only a level 1 club - speedrun optimization"
    print(f"Text: '{viral_text}'")
    resp = send_command({
        "id": 2, 
        "action": "register", 
        "name": "elden-ring-viral", 
        "text": viral_text
    })
    print(f"Response: {resp}")
    
    print("\n--- Test 3: SCORE HIGH MATCH ---")
    good_title = "Elden Ring level 1 club only speedrun guide"
    print(f"Text: '{good_title}'")
    resp = send_command({
        "id": 3,
        "action": "score",
        "curve": "elden-ring-viral",
        "text": good_title
    })
    print(f"Response: {resp}")
    
    print("\n--- Test 4: SCORE LOW MATCH ---")
    bad_title = "Baking a delicious chocolate cake from scratch"
    print(f"Text: '{bad_title}'")
    resp = send_command({
        "id": 4,
        "action": "score",
        "curve": "elden-ring-viral",
        "text": bad_title
    })
    print(f"Response: {resp}")

    process.terminate()

if __name__ == "__main__":
    run_test()
