import json

log_path = "/home/deck/.gemini/antigravity-cli/brain/8589f370-519b-4b3f-a3f5-9e1cc80f0b37/.system_generated/logs/transcript_full.jsonl"
last_content = ""

with open(log_path, 'r') as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get("type") == "PLANNER_RESPONSE":
                calls = data.get("tool_calls", [])
                for c in calls:
                    args = c.get("args", {})
                    if "CombatArenaScene.js" in str(args):
                        if "ReplacementContent" in str(args) or "CodeContent" in str(args):
                            # just print that we found a modification
                            print(f"Found modification in step {data.get('step_index')}")
        except:
            pass
