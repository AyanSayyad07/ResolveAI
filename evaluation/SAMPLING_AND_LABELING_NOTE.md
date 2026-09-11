# Golden Evaluation Set: Sampling & Labeling Methodology Note

**Dataset Size**: 200 hand-labelled customer-support interactions  
**Target Brand**: `@AmazonHelp` (Amazon Customer Support on Twitter)  
**Primary Source**: Subsample derived from Kaggle `thoughtvector/customer-support-on-twitter` (~3M multi-turn tweets)  
**Artifact**: [`evaluation/golden_eval_set.json`](./golden_eval_set.json)

---

## 1. Sampling Strategy

To reflect the messy, high-variance nature of real-world Twitter customer support, the 200 evaluation items were sampled using a **stratified domain-balanced distribution** reflecting actual enterprise e-commerce support volume:

| Intent Category | Sample Count | Percentage | Primary Challenges & Edge Cases Represented |
|---|---|---|---|
| **Delivery Issue** | 60 | 30.0% | Marked delivered but missing, carrier tracking delays, damaged outer boxes, driver access failures, weather exceptions |
| **Refund Request** | 35 | 17.5% | Bank processing timelines (3-5 days), duplicate charges, unauthorized renewal disputes, closed bank accounts |
| **Return / Replacement** | 35 | 17.5% | Defective electronics, wrong sizes, UPS QR code failures, hazardous broken glass waivers, replacement order stalls |
| **Product Inquiry** | 25 | 12.5% | Kindle/Fire TV compatibility, international shipping limits, warranty coverage, packaging sustainability, restock dates |
| **Account / Access** | 15 | 7.5% | 2FA SMS code delays, suspected account takeover/fraud, Prime auto-renewal cancellation, linking Amazon Household |
| **Complaint / Escalation** | 20 | 10.0% | Repeat failures (3rd call), driver verbal abuse/property damage, high-value disputes ($1,800 laptop), legal threats |
| **Cancellation** | 5 | 2.5% | Immediate order cancellation vs dispatched in-transit refusal |
| **Feedback / Other** | 5 | 2.5% | Driver appreciation shoutouts, AWS channel redirection, hours of operation |
| **Total** | **200** | **100%** | |

### Noise & Realism Factors Included
- **Emotional Polarity**: Neutral inquiries (45%), Frustrated/Negative (42%), Angry/Hostile (10%), Positive/Gratitude (3%).
- **Linguistic Noise**: Typos, missing punctuation, ALL CAPS rants, colloquialisms, emoji reactions, and order ID references.
- **Complexity Stratification**:
  - `straightforward` (65%): Clean, single-intent inquiries directly resolvable via standard documentation.
  - `edge-case` (25%): Real-world friction points (e.g. hazardous materials, expired QR codes, carrier mis-scans, bank delays).
  - `adversarial` / `compound` (10%): Legal/chargeback threats, driver misconduct, high-value fraud claims, and multi-part questions.

---

## 2. Labeling Rubric & Decision Boundaries

Each example was independently annotated with strict ground-truth fields:
1. `ground_truth_intent`: Exact classified intent from the 8-class taxonomy.
2. `ground_truth_sentiment`: Customer emotional state (`Neutral`, `Negative`, `Angry`, `Positive`).
3. `ground_truth_decision`: Actionable triage decision (`Auto-handle` vs `Escalate`).
4. `ground_truth_reason`: Deterministic rationale explaining the policy boundary.
5. `ground_truth_reference_reply`: Ideal human gold-standard response adhering to `@AmazonHelp` brand voice (<280 characters, empathetic, safe direction).

### Triage Decision Boundaries: Auto-handle vs. Escalate

| Criterion | Policy Action | Rationale |
|---|---|---|
| **Standard tracking, returns, specs, or FAQ queries** | **Auto-handle** | Fully grounded in published brand policies; safe for immediate autonomous guidance without financial or legal risk. |
| **Severe Anger / Dispute Keywords** *(court, lawyer, police, fraud, dispute, sue, chargeback)* | **Escalate** | Immediate de-escalation required. High churn and brand risk. |
| **High Financial Exposure** *(items > $500, duplicate unauthorized debits)* | **Escalate** | AI must never autonomously grant high-value refunds or bind the company to financial commitments. |
| **Physical Property Damage / Driver Misconduct** | **Escalate** | Legal/liability sensitivity. Driver operations and risk management must review. |
| **Repeat Unresolved Contacts** *(e.g. "3rd time calling", "waiting 2 weeks")* | **Escalate** | Broken promise recovery protocol; assigned to Tier-2 human specialist. |
| **Account Lockout / Sensitive PII Verification** | **Escalate** | Security boundaries. Account recovery requires authenticated human verification. |

### The "Zero Missed Escalation" Principle
In enterprise customer support, **a false auto-handle on an angry or legally sensitive tweet is catastrophic**, whereas an unnecessary human escalation is merely an efficiency cost. Therefore, the ground truth labels strictly enforce that any query containing dispute language, safety hazards, or repeated service failures MUST be marked `Escalate`.
