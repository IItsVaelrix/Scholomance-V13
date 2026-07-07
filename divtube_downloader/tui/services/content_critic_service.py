import json
import os
import threading
import urllib.request
import urllib.error

from tui.services.env_config import get_config, get_model
from tui.services.memory_service import MemoryService
from tui.services.tool_service import ToolService
from tui.utils.throttle import llm_throttle

class ContentCriticService:
    def __init__(self):
        self.active_model = get_model() or "grok-build-0.1"
        self.memory = MemoryService()
        self.tools = ToolService()

    def get_models(self, callback, on_fetched=None):
        def run():
            api_key, base_url, models_url = get_config()
            
            if not api_key:
                callback("[red]Error: No API Key found. Run '/apikey <key>' to set it.[/]")
                return

            callback(f"[#6A5A6A]Fetching available models from {models_url}...[/]")
            url = f"{models_url}/models" if not models_url.endswith("/models") else models_url
            req = urllib.request.Request(url, method="GET")
            req.add_header("Authorization", f"Bearer {api_key}")
            req.add_header("User-Agent", "curl/8.5.0")
            
            try:
                with urllib.request.urlopen(req, timeout=15) as response:
                    res_body = response.read()
                    res_json = json.loads(res_body)
                    
                    if "data" in res_json:
                        models = []
                        for m in res_json["data"]:
                            m_id = m.get("id", "unknown")
                            models.append(m_id)

                        if on_fetched:
                            on_fetched(models, []) # treat all as available
                        else:
                            callback(f"\n[bold magenta]❖ API MODELS ❖[/]\nAvailable: {len(models)}\n")
                    else:
                        callback("[red]Error: Invalid response format from models endpoint.[/]")
            except urllib.error.HTTPError as e:
                err_msg = e.read().decode('utf-8').replace('[', '\\[')
                callback(f"[red]API Error ({e.code}):[/] {err_msg}")
            except Exception as e:
                err_str = str(e).replace('[', '\\[')
                callback(f"[red]Request Error:[/] {err_str}")

        threading.Thread(target=run).start()

    def critique(self, file_path, model_name, callback, skill_name="youtube_feedback.md"):
        def run():
            if not os.path.exists(file_path):
                callback(f"[red]Error: File '{file_path}' not found.[/]", success=False, is_final=True)
                return
            
            try:
                with open(file_path, 'r') as f:
                    content_json = f.read()
                    if file_path.endswith(".json"):
                        json.loads(content_json)
            except Exception as e:
                callback(f"[red]Error reading file:[/] {e}", success=False, is_final=True)
                return

            api_key, base_url, models_url = get_config()
            
            if not api_key:
                callback("[red]Error: No API Key found. Run '/apikey <key>' to set it.[/]", success=False, is_final=True)
                return

            callback(f"[#6A5A6A]Analyzing '{file_path}' via {base_url}...[/]", success=True, is_final=False)

            # Determine where to find the prompt
            if skill_name == "mirrorborne-scholomance":
                prompt_path = "/home/deck/Downloads/Scholomance-V12-main/.agents/skills/mirrorborne-scholomance/SKILL.md"
                base_prompt = "You are the Mirrorborne Scholomance. Analyze this text with maximum depth."
            else:
                prompt_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "skills", skill_name)
                base_prompt = "You are an elite YouTube Content Strategist."
                
            if os.path.exists(prompt_path):
                with open(prompt_path, "r", encoding="utf-8") as pf:
                    base_prompt = pf.read()

            memory_context = self.memory.get_recent_critiques(limit=2)
            system_prompt = base_prompt + f"\n\n{memory_context}\n\nCRITIQUE INSTRUCTIONS:\nCritique the provided video JSON against the above framework and output your analysis following the exact 'Report Template' format. Use tools if necessary."

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Critique this video JSON:\n\n{content_json}"}
            ]

            def do_api_call(msgs, use_tools=True):
                payload = {
                    "model": model_name,
                    "messages": msgs
                }
                if use_tools and hasattr(self, "tools") and self.tools.tools:
                    import copy
                    safe_tools = copy.deepcopy(self.tools.tools)
                    def _strip_custom(d):
                        if isinstance(d, dict):
                            d.pop("default", None)
                            d.pop("is_coding_action", None)
                            for v in d.values():
                                _strip_custom(v)
                        elif isinstance(d, list):
                            for item in d:
                                _strip_custom(item)
                    _strip_custom(safe_tools)
                    payload["tools"] = safe_tools

                url = f"{base_url}/chat/completions" if not base_url.endswith("/chat/completions") else base_url
                req = urllib.request.Request(url, method="POST")
                req.add_header("Authorization", f"Bearer {api_key}")
                req.add_header("Content-Type", "application/json")
                req.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                req.add_header("HTTP-Referer", "https://github.com/DivTube")
                req.add_header("X-Title", "DivTube Cockpit")

                data = json.dumps(payload).encode('utf-8')
                with urllib.request.urlopen(req, data=data) as response:
                    return json.loads(response.read())

            try:
                MAX_TURNS = 3
                use_tools = True
                for turn in range(MAX_TURNS):
                    try:
                        llm_throttle.wait()
                        res_json = do_api_call(messages, use_tools)
                    except urllib.error.HTTPError as e:
                        err_msg = e.read().decode('utf-8')
                        if use_tools and (e.code in (400, 501) or "support" in err_msg.lower() or "tool" in err_msg.lower() or "not implemented" in err_msg.lower()):
                            callback(f"[dim][#6A5A6A]API returned {e.code} with tools — retrying without tool calling. Error: {err_msg[:300]}[/][/]")
                            # Fallback without tools if the model doesn't support them
                            use_tools = False
                            llm_throttle.wait()
                            try:
                                res_json = do_api_call(messages, use_tools)
                            except urllib.error.HTTPError as e2:
                                raise Exception(f"API Error ({e2.code}) after tool fallback: {e2.read().decode('utf-8')}")
                        else:
                            raise Exception(f"API Error ({e.code}): {err_msg}")
                    
                    if "choices" in res_json and len(res_json["choices"]) > 0:
                        choice = res_json["choices"][0]
                        message = choice["message"]
                        
                        if message.get("tool_calls"):
                            # Agent wants to use a tool
                            messages.append(message)
                            for tool_call in message["tool_calls"]:
                                func_name = tool_call["function"]["name"]
                                try:
                                    func_args = json.loads(tool_call["function"]["arguments"])
                                    import rich.panel, rich.syntax
                                    args_str = json.dumps(func_args, indent=2)
                                    syntax = rich.syntax.Syntax(args_str, "json", theme="monokai", word_wrap=True)
                                    panel = rich.panel.Panel(syntax, title=f"[bold #FFD700]⚡ {func_name}[/]", border_style="#B48EAD", expand=False)
                                    callback(panel, success=True, is_final=False)
                                except Exception:
                                    func_args = {}
                                    callback(f"  [bold #FFD700]⚡[/] [#B48EAD]{func_name}()[/] -> [red]ERROR PARSING ARGS[/]", success=False, is_final=False)
                                
                                def log_tool(msg):
                                    callback(msg, success=True, is_final=False)
                                
                                tool_result = self.tools.execute_tool(func_name, func_args, log_tool)
                                
                                messages.append({
                                    "role": "tool",
                                    "tool_call_id": tool_call["id"],
                                    "name": func_name,
                                    "content": tool_result
                                })
                            continue # Call API again with tool results
                        else:
                            # Final text response
                            criticism = message.get("content", "")
                            
                            # Save to memory so the AI remembers it next time
                            self.memory.save_critique(file_path, content_json, criticism)
                            
                            # Automatically save the report as a markdown file for external viewing
                            reports_dir = os.path.join(os.getcwd(), "reports")
                            os.makedirs(reports_dir, exist_ok=True)
                            
                            base_name = os.path.basename(file_path)
                            name_without_ext = os.path.splitext(base_name)[0]
                            report_filename = os.path.join(reports_dir, f"{name_without_ext}_critique.md")
                            
                            try:
                                with open(report_filename, "w", encoding="utf-8") as rf:
                                    rf.write(criticism)
                                saved_msg = f"Saved critique to {report_filename} and local SQLite memory"
                            except Exception as e:
                                saved_msg = f"Saved to local SQLite memory (Failed to write markdown file: {e})"
                            
                            formatted = criticism.replace("[", "\\[")
                            callback(f"\n[bold magenta]❖ OPENCODE CONTENT CRITIC ❖[/]\n\n{formatted}\n", success=True, is_final=True)
                            
                            # Update inspector or UI silently
                            callback(f"[dim green]✔ {saved_msg} ({self.memory.count()} total records)[/]", success=True, is_final=False)
                            return
                    else:
                        callback("[red]Error: Invalid response format from OpenCode.[/]", success=False, is_final=True)
                        return
                
                callback("[red]Error: Exceeded maximum tool iterations (3 turns).[/]", success=False, is_final=True)
            except urllib.error.HTTPError as e:
                err_msg = e.read().decode('utf-8').replace('[', '\\[')
                if e.code == 429:
                    callback(f"[red]API Error (429): Too Many Requests.[/]\n[italic]This means you have hit a rate limit or are out of credits with the provider.\nWait a moment, or ensure your account is funded.[/]", success=False, is_final=True)
                elif e.code == 503:
                    callback(f"[red]API Error (503): Service Unavailable.[/]\n[italic]The AI provider is currently overloaded or down. Please try again later, or switch to a different provider.[/]", success=False, is_final=True)
                else:
                    callback(f"[red]API Error ({e.code}):[/] {err_msg}", success=False, is_final=True)
            except Exception as e:
                err_str = str(e).replace('[', '\\[')
                callback(f"[red]Request Error:[/] {err_str}", success=False, is_final=True)

        threading.Thread(target=run).start()
