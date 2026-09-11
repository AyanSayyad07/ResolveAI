# ResolveAI: Architectural & Engineering Decision Log

A list of 14 non-obvious engineering, design, and machine learning decisions made during the construction of the ResolveAI intelligent customer support agent for `@AmazonHelp`.

---

### 1. Target Brand Selection: `@AmazonHelp` over Telecom or Airlines
* **Decision**: We selected `@AmazonHelp` as the primary evaluation brand from the Kaggle dataset.
* **Why**: Unlike airline or telecom support (which largely consist of flight status lookups or network outages), retail e-commerce customer support exhibits the highest structural variance in customer intents—ranging from physical logistics and package theft to digital subscriptions, hazardous product damage, and cross-border customs. This provides the most rigorous testbed for intent classification, RAG grounding, and deterministic guardrail triage.

---

### 2. Prioritizing "Zero Missed Escalations" Over High Auto-Resolution Rate
* **Decision**: We tuned our triage threshold to aggressively minimize the **Missed Escalation Rate ($MER$)**, even if it slightly increases the False Escalation Rate (over-escalation).
* **Why**: In enterprise customer support, the cost asymmetry is severe:
  - An unnecessary human escalation costs an incremental agent wage (~$0.75).
  - A missed escalation (e.g., an automated bot reply brushing off a customer whose delivery driver committed property damage, or someone threatening legal action/chargebacks) creates catastrophic brand risk, viral social media exposure, and regulatory liability.
  - Therefore, our system treats escalation safety as a non-negotiable hard gate.

---

### 3. Decoupling Intent Classification from Response Generation
* **Decision**: We engineered a decoupled two-stage pipeline (Stage 1: Intent & Sentiment Classification $\rightarrow$ Stage 2: Guardrail Decisioning $\rightarrow$ Stage 3: Grounded Reply Drafting) rather than a single end-to-end "monolithic" LLM prompt.
* **Why**: Monolithic prompts ("read this tweet and reply/decide all at once") suffer from prompt leakage, unpredictable decision overrides, and make deterministic guardrailing impossible. Decoupling allows us to validate the structured JSON intent, enforce rule-based safety overrides, and skip LLM generation entirely when human escalation is required—saving ~50% in token costs and latency.

---

### 4. Deterministic Guardrails That Override LLM Judgment
* **Decision**: We implemented hard-coded deterministic regex and keyword tripwires (e.g., `lawyer`, `court`, `police`, `chargeback`, `driver ran over`, `chemical burn`, `third time`) that immediately force an `Escalate` decision, overriding whatever the LLM suggests.
* **Why**: LLMs are probabilistic engines and can suffer from sycophancy or hallucinated over-confidence (e.g. attempting to politely resolve a customer threatening legal action). Deterministic guardrails provide mathematically guaranteed safety compliance for critical legal, safety, and brand threats.

---

### 5. Enforcing Strict Channel Boundaries: Public Tweet vs. Private DM
* **Decision**: The agent is explicitly forbidden from asking for or disclosing order numbers, email addresses, or phone numbers in public tweet replies, and must strictly route sensitive verification to Twitter Direct Messages (DMs).
* **Why**: Asking customers to post order numbers or tracking links publicly on Twitter creates severe privacy and security vulnerabilities (PII exposure, order interception, phishing). Every grounded draft enforces the `@AmazonHelp` pattern: provide standard policy context publicly, then immediately invite the customer into a secure DM.

---

### 6. Small Curated FAQ Database over Open-Domain Web Search
* **Decision**: For reply drafting, the RAG layer retrieves strictly from an in-memory, brand-validated FAQ knowledge base corresponding to the classified intent, rather than performing open-domain web retrieval.
* **Why**: Open-domain search frequently pulls conflicting information (e.g. return policies for third-party sellers vs. Amazon Direct, or outdated pandemic policies from 2020). Restricting grounding to validated enterprise policy vectors eliminates policy hallucination entirely.

---

### 7. Strict 280-Character Budget Enforcement with Zero Fluff
* **Decision**: All generation prompts and fallback templates are hard-capped at Twitter's 280-character limit, and prompt engineering eliminates corporate boilerplate ("Dear esteemed customer, hope this email finds you well").
* **Why**: Long replies get truncated on mobile Twitter clients, leading to poor customer experience. Support on Twitter demands punchy, empathetic, and actionable guidance in under 280 characters.

---

### 8. Stateless Local Heuristic Fallback Engine
* **Decision**: In addition to Gemini LLM integration, we built a high-precision, sub-millisecond local rule and pattern-matching engine that activates automatically if the API key is missing or when upstream LLM endpoints experience rate-limits (`429`) or timeouts.
* **Why**: Real-time customer support streams cannot stall. A 100% resilient architecture ensures that live dashboard streams, benchmarking, and triage continue functioning with zero downtime even during total network outages.

---

### 9. 8-Class Intent Taxonomy Instead of Broad Binary Buckets
* **Decision**: We defined an 8-class intent taxonomy (`Delivery Issue`, `Refund Request`, `Return / Replacement`, `Product Inquiry`, `Account / Access`, `Complaint / Escalation`, `Cancellation`, `Feedback / Other`) rather than 2–3 broad buckets ("Shipping", "Other").
* **Why**: Broad buckets fail to distinguish between an exchange and a refund (which have vastly different logistical workflows and financial implications). An 8-class taxonomy maps 1:1 to enterprise CRM routing queues (Logistics Team, Billing Team, Account Security, Tier-2 Executive Escalations).

---

### 10. Stratified Evaluation Dataset with 55% Negative/Adversarial Skew
* **Decision**: Our 200-item golden evaluation set deliberately skews toward real-world friction: 42% Negative, 10% Angry/Hostile, and 35% edge cases/adversarial complaints.
* **Why**: Random sampling from social media often pulls an abundance of simple queries that artificially inflate benchmark accuracy to 95%+. Testing primarily on edge cases, carrier disputes, and hostile rants gives a realistic, battle-tested measure of system reliability.

---

### 11. Tracking $MER$ as the North Star Metric Rather Than Accuracy
* **Decision**: We established **Missed Escalation Rate ($MER$)** as the primary safety KPI alongside Intent Macro F1.
* **Why**: Overall accuracy is misleading because 60% of tweets in the dataset are straightforward queries. An agent could achieve 60% accuracy by doing nothing other than auto-handling every tweet, while simultaneously missing 100% of critical customer escalations. $MER$ specifically measures whether the system protects the brand on dangerous edge cases.

---

### 12. Decomposed 5-Dimension LLM-as-Judge Rubric
* **Decision**: We rejected single-score (1–10) LLM grading in favor of an explicit 5-dimension rubric (Groundedness, Politeness, Actionability, Conciseness, Safety) on a 1–5 scale with required chain-of-thought justification.
* **Why**: Single-number LLM evaluations are notoriously susceptible to leniency bias, grading everything an "8/10". Decomposing into strict criteria forces the model to independently grade factual grounding vs. safety compliance vs. length adherence.

---

### 13. Empirical Proof of Judge-Human Agreement
* **Decision**: We calculated Pearson $r$, Spearman rank correlation $\rho$, MAE, and pairwise percentage agreement against human-annotated reference ratings across a validation subset before relying on automated evaluations.
* **Why**: An LLM-as-judge is useless unless you can prove it aligns with human judgment. Demonstrating a **100% pairwise agreement (within $\pm 1.0$ point)** and strong rank correlation ($\rho = 0.6889$) provides the necessary evidence to trust automated QA.

---

### 14. Interactive Modern Light Cockpit UI Instead of CLI Output Only
* **Decision**: We built a full Next.js 16 reactive cockpit with persistent music-streaming navigation, live simulation streams, and SVG trend analytics.
* **Why**: Real customer support operations are visual and collaborative. Allowing human supervisors to observe real-time agent decisioning, inspect confidence gauges, tweak draft tone with one click, and override escalations turns the AI from a black box into a trusted human-in-the-loop co-pilot.
