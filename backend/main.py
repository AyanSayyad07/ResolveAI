import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from agent import CustomerSupportAgent

app = FastAPI(title="Hiver AI Agent API")

# Allow CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

agent = CustomerSupportAgent()

# Load test tweets if available
def load_test_tweets():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(base_dir, "test_tweets.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"Warning: could not load {path}: {e}")
        return []

class ProcessTweetRequest(BaseModel):
    tweet_id: Optional[str] = "custom"
    author: Optional[str] = "customer"
    text: str

@app.get("/api/health")
def get_health_status():
    from agent import is_gemini_configured, GEMINI_MODELS
    tweets = load_test_tweets()
    return {
        "status": "healthy",
        "gemini_configured": is_gemini_configured(),
        "model": GEMINI_MODELS[0] if is_gemini_configured() else "Local Rule Engine",
        "total_sample_tweets": len(tweets)
    }

@app.get("/api/tweets")
def get_test_tweets():
    return load_test_tweets()

@app.post("/api/process")
def process_tweet(request: ProcessTweetRequest):
    try:
        result = agent.process_tweet(request.text)
        return {
            "tweet_id": request.tweet_id or "custom",
            "author": request.author or "customer",
            "original_text": request.text,
            "agent_result": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
