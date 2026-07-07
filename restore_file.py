import json

log_path = "/home/deck/.gemini/antigravity-cli/brain/8589f370-519b-4b3f-a3f5-9e1cc80f0b37/.system_generated/logs/transcript_full.jsonl"
file_path = "src/phaser/CombatArenaScene.js"

with open(file_path, "r") as f:
    content = f.read()

# We only want to apply changes up to step 1165. The disastrous one was 1184.
with open(log_path, "r") as f:
    for line in f:
        try:
            data = json.loads(line)
            step = data.get("step_index")
            if step > 1166:
                break
            
            if data.get("type") == "PLANNER_RESPONSE":
                calls = data.get("tool_calls", [])
                for c in calls:
                    args = c.get("args", {})
                    target_file = args.get("TargetFile", "")
                    
                    if file_path in target_file:
                        if c["name"] == "replace_file_content":
                            target = args.get("TargetContent", "")
                            repl = args.get("ReplacementContent", "")
                            if target in content:
                                content = content.replace(target, repl, 1)
                        elif c["name"] == "multi_replace_file_content":
                            chunks = args.get("ReplacementChunks", [])
                            for chunk in chunks:
                                target = chunk.get("TargetContent", "")
                                repl = chunk.get("ReplacementContent", "")
                                if target in content:
                                    content = content.replace(target, repl, 1)
        except Exception as e:
            pass

with open(file_path, "w") as f:
    f.write(content)

print("Restored file successfully.")
