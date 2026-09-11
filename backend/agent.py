import os
import json
from google import genai
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

GEMINI_MODELS = [
    os.environ.get("GEMINI_MODEL", "gemini-2.0-flash"),
    "gemini-1.5-flash"
]

def is_gemini_configured() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY"))

def get_genai_client():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None
    try:
        return genai.Client(api_key=api_key)
    except Exception as e:
        print(f"Warning: Could not initialize Gemini client: {e}")
        return None

class IntentClassificationResult(BaseModel):
    intent: str = Field(description="The classified intent of the customer tweet. Examples: 'Delivery Issue', 'Refund Request', 'Product Inquiry', 'Complaint', 'Other'")
    confidence: float = Field(description="Confidence score from 0.0 to 1.0")
    sentiment: str = Field(description="Sentiment of the tweet: 'Positive', 'Neutral', 'Negative', 'Angry'")

class AgentDecisionResult(BaseModel):
    decision: str = Field(description="Either 'Auto-handle' or 'Escalate'")
    reason: str = Field(description="Reason for the decision")

class RAGDraftResult(BaseModel):
    drafted_response: str = Field(description="The suggested response to the customer")
    retrieved_context: str = Field(description="The context used to ground the response (if any)")

class CustomerSupportAgent:
    def __init__(self):
        # A simple in-memory FAQ for RAG grounding (can be replaced with ChromaDB)
        self.faq_database = {
            "Delivery Issue": "We apologize for the delay. Please check your tracking link. If it's been more than 48 hours past the expected date, we will issue a replacement or refund.",
            "Refund Request": "Refunds typically process within 3-5 business days. Please provide your order number via DM so we can process it immediately.",
            "Product Inquiry": "You can find detailed product specifications on the product page. If you have specific questions, let us know!",
            "Complaint": "We're sorry to hear about your experience. Please DM us your account details and order number so we can make this right."
        }
        
    def classify_intent(self, text: str) -> IntentClassificationResult:
        client = get_genai_client()
        if client:
            for model_name in GEMINI_MODELS:
                try:
                    prompt = f"""Analyze the following customer support tweet and classify its intent and sentiment.
Tweet: "{text}"
"""
                    response = client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config={
                            'response_mime_type': 'application/json',
                            'response_schema': IntentClassificationResult,
                        },
                    )
                    return IntentClassificationResult.model_validate_json(response.text)
                except Exception as e:
                    print(f"Gemini API ({model_name}) error during classification: {e}")

        # Heuristic fallback when GEMINI_API_KEY is not provided
        lower = text.lower()
        if any(w in lower for w in ["worst", "refuse to refund", "angry", "terrible", "lost my order"]):
            return IntentClassificationResult(intent="Complaint", confidence=0.95, sentiment="Angry")
        elif any(w in lower for w in ["refund", "return"]):
            return IntentClassificationResult(intent="Refund Request", confidence=0.88, sentiment="Neutral")
        elif any(w in lower for w in ["late", "package", "delay", "wrong item"]):
            return IntentClassificationResult(intent="Delivery Issue", confidence=0.90, sentiment="Negative")
        elif any(w in lower for w in ["thanks", "appreciate", "great", "quickly"]):
            return IntentClassificationResult(intent="Other", confidence=0.92, sentiment="Positive")
        elif any(w in lower for w in ["ship to", "kindle", "buffering", "video", "how do i"]):
            return IntentClassificationResult(intent="Product Inquiry", confidence=0.85, sentiment="Neutral")
        else:
            return IntentClassificationResult(intent="Other", confidence=0.60, sentiment="Neutral")

    def determine_action(self, intent_result: IntentClassificationResult) -> AgentDecisionResult:
        # Rule-based decision logic
        if intent_result.sentiment in ['Angry'] or intent_result.confidence < 0.7:
            return AgentDecisionResult(
                decision="Escalate", 
                reason="High negative sentiment or low confidence in intent classification requires human intervention."
            )
        if intent_result.intent == 'Other':
            return AgentDecisionResult(
                decision="Escalate",
                reason="Unrecognized intent requires human intervention."
            )
        
        return AgentDecisionResult(
            decision="Auto-handle",
            reason="Clear intent and manageable sentiment."
        )

    def draft_response(self, text: str, intent: str) -> RAGDraftResult:
        # Simple RAG retrieval
        context = self.faq_database.get(intent, "General support guidelines: Be polite, empathetic, and offer to help via DM.")
        client = get_genai_client()
        if client:
            for model_name in GEMINI_MODELS:
                try:
                    prompt = f"""You are a helpful customer support agent for AmazonHelp. 
Draft a reply to the customer's tweet using ONLY the provided FAQ context. Keep it under 280 characters.
Tweet: "{text}"
FAQ Context: "{context}"
"""
                    response = client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                    )
                    return RAGDraftResult(
                        drafted_response=response.text.strip(),
                        retrieved_context=context
                    )
                except Exception as e:
                    print(f"Gemini API ({model_name}) error during draft: {e}")

        # Fallback response grounded in the FAQ context
        fallback_replies = {
            "Delivery Issue": "We apologize for the delay with your order! Please check your tracking link, and if it has been over 48 hours, DM us your order ID so we can issue a replacement or refund.",
            "Refund Request": "Hello! Refunds typically take 3-5 business days to process. Please send us your order number via DM so our team can expedite this for you.",
            "Product Inquiry": "Hi there! For product specifications and troubleshooting steps, please check our help center or DM us your details so we can assist directly.",
            "Complaint": "We are very sorry for the frustration. Please send us a DM with your account details and order number so our team can resolve this immediately."
        }
        reply = fallback_replies.get(intent, f"Thank you for contacting support. {context} Please reach out via DM so we can assist.")
        return RAGDraftResult(
            drafted_response=reply,
            retrieved_context=context
        )

    def process_tweet(self, text: str):
        intent_result = self.classify_intent(text)
        decision_result = self.determine_action(intent_result)
        
        draft_result = None
        if decision_result.decision == "Auto-handle":
            draft_result = self.draft_response(text, intent_result.intent)
            
        return {
            "tweet": text,
            "intent": intent_result.model_dump(),
            "decision": decision_result.model_dump(),
            "draft": draft_result.model_dump() if draft_result else None
        }

if __name__ == "__main__":
    # Test the agent
    agent = CustomerSupportAgent()
    test_tweet = "@AmazonHelp My package is 3 days late and I need it for a birthday party tomorrow! What is going on???"
    print(json.dumps(agent.process_tweet(test_tweet), indent=2))
