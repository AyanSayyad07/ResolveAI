import os
import json
import pandas as pd

def fetch_and_prepare_data():
    print("Generating mock dataset because thoughtvector/customer-support-on-twitter is unavailable on HF Hub...")
    
    mock_data = [
        {"tweet_id": "1", "author_id": "user123", "text": "@AmazonHelp My package is 3 days late and I need it for a birthday party tomorrow! What is going on???", "inbound": True},
        {"tweet_id": "2", "author_id": "user456", "text": "@AmazonHelp how do I return a kindle that won't turn on?", "inbound": True},
        {"tweet_id": "3", "author_id": "user789", "text": "@AmazonHelp WORST SERVICE EVER. YOU LOST MY ORDER AND REFUSE TO REFUND ME.", "inbound": True},
        {"tweet_id": "4", "author_id": "user001", "text": "@AmazonHelp Do you guys ship to New Zealand?", "inbound": True},
        {"tweet_id": "5", "author_id": "user002", "text": "@AmazonHelp Thanks for resolving my issue so quickly! Appreciate it.", "inbound": True},
        {"tweet_id": "6", "author_id": "user003", "text": "@AmazonHelp My prime video is buffering constantly on my smart TV.", "inbound": True},
        {"tweet_id": "7", "author_id": "user004", "text": "@AmazonHelp I received the wrong item. Ordered a book, got a toaster.", "inbound": True},
    ]
    
    df = pd.DataFrame(mock_data)
    
    # We want a sample of 250 for the golden eval set (we will mock just a few for demonstration)
    golden_set = df.copy()
    
    eval_list = golden_set.to_dict(orient='records')
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    eval_dir = os.path.join(base_dir, "evaluation")
    os.makedirs(eval_dir, exist_ok=True)
    golden_eval_path = os.path.join(eval_dir, "golden_eval_set.json")
    
    labeled_data = []
    for row in eval_list:
        labeled_data.append({
            "tweet_id": str(row['tweet_id']),
            "author_id": str(row['author_id']),
            "text": row['text'],
            "created_at": "2023-01-01T12:00:00Z",
            "ground_truth_intent": None, 
            "ground_truth_decision": None, 
            "ground_truth_response": None
        })
    
    with open(golden_eval_path, "w", encoding="utf-8") as f:
        json.dump(labeled_data, f, indent=4)
        
    print(f"Generated {len(labeled_data)} samples for evaluation at {golden_eval_path}")
    
    test_data = [{"id": str(r['tweet_id']), "author": str(r['author_id']), "text": r['text']} for r in eval_list]
    
    with open("test_tweets.json", "w", encoding="utf-8") as f:
        json.dump(test_data, f, indent=4)
    print("Generated test_tweets.json for frontend simulation.")

if __name__ == "__main__":
    fetch_and_prepare_data()
