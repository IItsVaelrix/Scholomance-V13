import json

log_path = "/home/deck/.gemini/antigravity-cli/brain/8589f370-519b-4b3f-a3f5-9e1cc80f0b37/.system_generated/logs/transcript_full.jsonl"
baseline = ""

with open(log_path, "r") as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get("type") == "PLANNER_RESPONSE":
                calls = data.get("tool_calls", [])
                for c in calls:
                    args = c.get("args", {})
                    if "CombatArenaScene.js" in str(args) and "CodeContent" in args:
                        # Found write_to_file? No, I likely used multi_replace.
                        pass
        except:
            pass

