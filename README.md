# ResolveAI

ResolveAI is an AI-powered customer support and automated ticket resolution agent platform. It integrates intelligent tweet/ticket triaging, classification, response generation, and evaluation with a modern Next.js dashboard and a FastAPI backend.

---

## 📁 Project Structure

```
ResolveAI/
├── backend/          # FastAPI backend, agent pipeline, and evaluation logic
│   ├── agent.py          # AI agent implementation & prompt orchestration
│   ├── data_pipeline.py  # Data extraction & ingestion pipeline
│   ├── main.py           # FastAPI application & REST endpoints
│   ├── requirements.txt  # Python backend dependencies
│   └── test_tweets.json  # Sample dataset for testing & demonstration
├── frontend/         # Next.js modern web dashboard (Tailwind CSS, TypeScript)
│   ├── src/app/          # App router pages & components
│   └── package.json      # Frontend dependencies & scripts
├── evaluation/       # Benchmark and evaluation harnesses
│   └── eval_harness.py   # RAG & agent performance evaluations
└── skills/           # Custom agent skills & specifications
    └── rag_eval_skill/   # Evaluation skill definitions
```

---

## 🚀 Getting Started

### 1. Backend Setup

```bash
cd backend
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend dashboard will be available at [http://localhost:3000](http://localhost:3000) and the backend API documentation at [http://localhost:8000/docs](http://localhost:8000/docs).
