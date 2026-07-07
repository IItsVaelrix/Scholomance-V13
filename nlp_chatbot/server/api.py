from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from model.chatbot import ChatbotModel
from memory.session import SessionMemory
from memory.oracle import get_oracle_context

app = FastAPI(title="NLP Chatbot API")

# Add CORS middleware to allow the React frontend to communicate with the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

chatbot = ChatbotModel()
memory = SessionMemory(max_turns=6)

class ChatRequest(BaseModel):
    session_id: str
    message: str

class ChatResponse(BaseModel):
    response: str

@app.get("/health")
def health():
    return {"status": "ok"}

import requests

@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    # Add user message to memory
    memory.add_message(req.session_id, req.message)
    history = memory.get_history(req.session_id)
    
    bot_response = ""
    # Attempt to hit the new LiteraryGenius-DialoGPT-TurboMemory backend
    try:
        literary_req = {
            "user_text": req.message,
            "task": "Analyze and rewrite"
        }
        res = requests.post("http://localhost:8080/generate", json=literary_req, timeout=5)
        if res.status_code == 200:
            data = res.json()
            bot_response = data.get("response", "")
            
            # If the engine provided an analysis, we can append it!
            analysis = data.get("analysis_signals", {})
            cliches = analysis.get("found_cliches", [])
            if cliches:
                bot_response += f"\n\n*(Critique: I noticed you used {len(cliches)} cliches: {', '.join(cliches)}. I polished them out.)*"
    except Exception as e:
        bot_response = ""

    # Fallback to the old basic ChatbotModel if the new engine is down/still training
    if not bot_response:
        bot_response = chatbot.generate_response(history)
    
    # Retrieve Oracle context and attach it to the final output
    oracle_context = get_oracle_context(req.message)
    if oracle_context:
        # Prepend the refined literary quote so the Oracle speaks first
        bot_response = f"*{oracle_context}*\n\n{bot_response}"
    
    # Add bot response to memory
    memory.add_message(req.session_id, bot_response)
    
    return ChatResponse(response=bot_response)

# Run with: uvicorn server.api:app --reload --port 8000
