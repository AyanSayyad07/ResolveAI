---
name: rag-eval-harness
description: Evaluates RAG-based AI agents using LLM-as-a-judge for politeness, accuracy, and groundedness.
---

# RAG Evaluation Harness Skill

This skill allows you to quickly evaluate an AI customer support agent using Gemini as an LLM-as-judge.

## Prerequisites

- Python 3.9+
- `google-genai` installed (`pip install google-genai`)
- `GEMINI_API_KEY` environment variable set

## Usage

You can use the evaluation script `eval_harness.py` to evaluate any set of predicted outputs against their input context. 
It expects a JSON dataset structured like:
```json
[
  {
    "tweet_id": "123",
    "text": "Where is my package?",
    "ground_truth_response": "We are checking on it."
  }
]
```

To run:
```bash
python eval_harness.py --eval_file path/to/golden_eval_set.json
```

## Internal Logic
The skill uses the following prompt structure for LLM-as-judge:
- **Politeness (1-5)**
- **Accuracy (1-5)** 
- **Groundedness (1-5)** (How well it adheres to provided FAQ context)
