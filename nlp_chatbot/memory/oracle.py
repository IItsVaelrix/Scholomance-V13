import requests
import json

def get_oracle_context(query: str, speculativeEnvelope: dict = None) -> str:
    """
    Pings the central Javascript/WASM TurboQuant API over localhost HTTP.
    This routes the Oracle memory to the core CODEx Authority Server.
    """
    try:
        url = "http://localhost:3000/api/oracle/query"
        payload = {
            "query": query,
            "telemetry": {
                "emotion": {"primary": "neutral"}
            }
        }
        if speculativeEnvelope:
            payload["telemetry"]["speculativeEnvelope"] = speculativeEnvelope
        
        response = requests.post(url, json=payload, timeout=5)
        
        if response.status_code == 200:
            data = response.json().get("data", {})
            return data.get("responseText", "")
        else:
            print(f"Oracle JS API returned {response.status_code}")
            return ""
            
    except requests.exceptions.ConnectionError:
        print("Oracle JS API is offline. Make sure the Node server is running on port 3000.")
        return ""
    except Exception as e:
        print(f"Oracle API error: {e}")
        return ""
