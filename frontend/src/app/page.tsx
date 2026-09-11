"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import ResolveLogo from "@/components/Logo";

interface IntentResult {
  intent: string;
  confidence: number;
  sentiment: string;
}

interface DecisionResult {
  decision: "Auto-handle" | "Escalate" | string;
  reason: string;
}

interface DraftResult {
  drafted_response: string;
  retrieved_context: string;
}

interface AgentResult {
  tweet: string;
  intent: IntentResult;
  decision: DecisionResult;
  draft: DraftResult | null;
}

interface ProcessedTicket {
  tweet_id: string;
  author: string;
  channel?: string;
  original_text: string;
  timestamp?: string;
  isResolved?: boolean;
  editedDraft?: string;
  priority?: "High" | "Normal" | "Urgent";
  agent_result: AgentResult;
}

interface SampleTweet {
  id: string;
  author: string;
  text: string;
}

interface HealthStatus {
  status: string;
  gemini_configured: boolean;
  model: string;
  total_sample_tweets: number;
}

type NavigationTab = "cockpit" | "analytics" | "simulator" | "knowledge";

// Pre-populated initial demonstration tickets so the dashboard is immediately active and rich
const initialDemonstrationTickets: ProcessedTicket[] = [
  {
    tweet_id: "TKT-8942",
    author: "claire_shoppings",
    channel: "Twitter / @AmazonHelp",
    original_text: "@AmazonHelp My package is 3 days late and I need it for a birthday party tomorrow! What is going on???",
    timestamp: "10:42 AM",
    priority: "Normal",
    isResolved: false,
    editedDraft: "We apologize for the delay with your order! Please check your tracking link, and if it has been over 48 hours past the estimated delivery date, DM us your order ID so we can issue a replacement or refund immediately.",
    agent_result: {
      tweet: "@AmazonHelp My package is 3 days late and I need it for a birthday party tomorrow! What is going on???",
      intent: { intent: "Delivery Issue", confidence: 0.94, sentiment: "Negative" },
      decision: { decision: "Auto-handle", reason: "Standard shipping delay inquiry. Tracking details identifiable; policy permits automated assistance." },
      draft: {
        drafted_response: "We apologize for the delay with your order! Please check your tracking link, and if it has been over 48 hours past the estimated delivery date, DM us your order ID so we can issue a replacement or refund immediately.",
        retrieved_context: "We apologize for the delay. Please check your tracking link. If it's been more than 48 hours past the expected date, we will issue a replacement or refund."
      }
    }
  },
  {
    tweet_id: "TKT-8943",
    author: "marcus_vance",
    channel: "Twitter / @AmazonHelp",
    original_text: "@AmazonHelp WORST SERVICE EVER. YOU LOST MY ORDER AND REFUSE TO REFUND ME. Disgusting!",
    timestamp: "10:38 AM",
    priority: "Urgent",
    isResolved: false,
    editedDraft: "",
    agent_result: {
      tweet: "@AmazonHelp WORST SERVICE EVER. YOU LOST MY ORDER AND REFUSE TO REFUND ME. Disgusting!",
      intent: { intent: "Complaint", confidence: 0.98, sentiment: "Angry" },
      decision: { decision: "Escalate", reason: "Critical negative sentiment and dispute keywords detected. Guardrail protocol assigns to Tier-2 human specialist." },
      draft: null
    }
  },
  {
    tweet_id: "TKT-8944",
    author: "sophia_tech",
    channel: "Twitter / @AmazonHelp",
    original_text: "@AmazonHelp How do I return a Kindle Paperwhite that won't turn on out of the box?",
    timestamp: "10:31 AM",
    priority: "Normal",
    isResolved: true,
    editedDraft: "Hi Sophia! We're sorry your device is having issues. Refunds & returns typically process within 3-5 business days. Please DM us your order number so our team can provide a prepaid return label right away.",
    agent_result: {
      tweet: "@AmazonHelp How do I return a Kindle Paperwhite that won't turn on out of the box?",
      intent: { intent: "Refund Request", confidence: 0.91, sentiment: "Neutral" },
      decision: { decision: "Auto-handle", reason: "Device return request conforms to standard return policy. Safe for autonomous drafting." },
      draft: {
        drafted_response: "Hi Sophia! We're sorry your device is having issues. Refunds & returns typically process within 3-5 business days. Please DM us your order number so our team can provide a prepaid return label right away.",
        retrieved_context: "Refunds typically process within 3-5 business days. Please provide your order number via DM so we can process it immediately."
      }
    }
  },
  {
    tweet_id: "TKT-8945",
    author: "liam_wellington",
    channel: "Direct Web",
    original_text: "@AmazonHelp Do you provide international priority courier delivery to New Zealand?",
    timestamp: "10:20 AM",
    priority: "Normal",
    isResolved: false,
    editedDraft: "Hi Liam! You can find detailed shipping and product delivery specifications on our help center page. If you have specific regional requirements, DM us your destination postcode!",
    agent_result: {
      tweet: "@AmazonHelp Do you provide international priority courier delivery to New Zealand?",
      intent: { intent: "Product Inquiry", confidence: 0.88, sentiment: "Neutral" },
      decision: { decision: "Auto-handle", reason: "General product & shipping inquiry matches FAQ grounding database." },
      draft: {
        drafted_response: "Hi Liam! You can find detailed shipping and product delivery specifications on our help center page. If you have specific regional requirements, DM us your destination postcode!",
        retrieved_context: "You can find detailed product specifications on the product page. If you have specific questions, let us know!"
      }
    }
  }
];

export default function Home() {
  const [currentNav, setCurrentNav] = useState<NavigationTab>("cockpit");
  const [activeQueueFilter, setActiveQueueFilter] = useState<"all" | "auto" | "escalate">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [tweets, setTweets] = useState<SampleTweet[]>([]);
  const [results, setResults] = useState<ProcessedTicket[]>(initialDemonstrationTickets);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>("TKT-8942");
  const [health, setHealth] = useState<HealthStatus | null>(null);

  const [processing, setProcessing] = useState(false);
  const [liveStreamActive, setLiveStreamActive] = useState(false);
  const [customAuthor, setCustomAuthor] = useState("support_shopper");
  const [customText, setCustomText] = useState("");
  const [customLoading, setCustomLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusNotification, setStatusNotification] = useState<{ message: string; type: "info" | "success" | "warning" } | null>(null);

  const [hoveredIntent, setHoveredIntent] = useState<string | null>(null);

  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchApi = async (path: string, options?: RequestInit) => {
    try {
      const res = await fetch(path, options);
      if (res.ok) return await res.json();
    } catch {
      const fallbackUrl = `http://127.0.0.1:8000${path}`;
      const res2 = await fetch(fallbackUrl, options);
      return await res2.json();
    }
  };

  useEffect(() => {
    fetchApi("/api/health")
      .then(data => setHealth(data))
      .catch(err => console.warn("Backend health warning:", err));

    fetchApi("/api/tweets")
      .then(data => {
        if (Array.isArray(data)) setTweets(data);
      })
      .catch(err => console.error("Error loading sample tweets:", err));
  }, []);

  const processSingleTweet = async (tweet: { id: string; author: string; text: string }) => {
    const data = await fetchApi("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tweet_id: tweet.id, author: tweet.author, text: tweet.text })
    });

    if (data && data.agent_result) {
      const isUrgent = data.agent_result?.intent?.sentiment?.toLowerCase() === "angry";
      const enriched: ProcessedTicket = {
        ...data,
        channel: "Twitter / @AmazonHelp",
        priority: isUrgent ? "Urgent" : data.agent_result?.decision?.decision === "Escalate" ? "High" : "Normal",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isResolved: false,
        editedDraft: data.agent_result?.draft?.drafted_response || ""
      };

      setResults(prev => [enriched, ...prev]);
      setSelectedTicketId(prev => prev ?? enriched.tweet_id);
      return enriched;
    }
    return null;
  };

  const processStream = async () => {
    if (processing || tweets.length === 0) return;
    setProcessing(true);
    setStatusNotification({ message: `Evaluating benchmark batch of ${tweets.length} customer inquiries...`, type: "info" });
    
    for (const tweet of tweets) {
      try {
        await processSingleTweet(tweet);
        await new Promise(r => setTimeout(r, 450));
      } catch (err) {
        console.error("Error in benchmark stream:", err);
      }
    }
    
    setProcessing(false);
    setStatusNotification({ message: `Successfully triaged ${tweets.length} tickets.`, type: "success" });
    setTimeout(() => setStatusNotification(null), 3500);
  };

  useEffect(() => {
    if (liveStreamActive) {
      const simulatedFeed = [
        { author: "shopper_claire", text: "@AmazonHelp My Prime parcel was marked delivered, but it is nowhere to be found outside!" },
        { author: "alex_gamer", text: "@AmazonHelp The kindle gift card I purchased won't apply to my account. Error code 403." },
        { author: "marcus_v", text: "@AmazonHelp Horrible customer service! Second time you guys cancel my order without reason!" },
        { author: "rachel_b", text: "@AmazonHelp Do you offer courier pickup for returned electronics in Chicago?" },
        { author: "dev_dave", text: "@AmazonHelp Quick shoutout for replacing my defective monitor in 24 hours. Incredible speed!" }
      ];

      streamIntervalRef.current = setInterval(async () => {
        const item = simulatedFeed[Math.floor(Math.random() * simulatedFeed.length)];
        await processSingleTweet({
          id: "TKT-" + Math.floor(1000 + Math.random() * 9000),
          author: item.author,
          text: item.text
        });
      }, 5000);
    } else {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    }

    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, [liveStreamActive]);

  const handleCustomSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customText.trim() || customLoading) return;
    setCustomLoading(true);
    try {
      const ticket = await processSingleTweet({
        id: "TKT-" + Math.floor(1000 + Math.random() * 9000),
        author: customAuthor.trim() || "anonymous",
        text: customText.trim()
      });
      if (ticket) {
        setSelectedTicketId(ticket.tweet_id);
        setCurrentNav("cockpit");
      }
      setCustomText("");
      setStatusNotification({ message: "Inquiry classified & drafted!", type: "success" });
      setTimeout(() => setStatusNotification(null), 3000);
    } catch (err) {
      console.error("Custom submit failed:", err);
      setStatusNotification({ message: "Backend error during processing.", type: "warning" });
    } finally {
      setCustomLoading(false);
    }
  };

  const copyDraft = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleResolved = (id: string) => {
    setResults(prev => prev.map(item => 
      item.tweet_id === id ? { ...item, isResolved: !item.isResolved } : item
    ));
  };

  const updateDraft = (id: string, text: string) => {
    setResults(prev => prev.map(item =>
      item.tweet_id === id ? { ...item, editedDraft: text } : item
    ));
  };

  const applyTone = (id: string, tone: "empathic" | "concise" | "formal") => {
    const current = results.find(r => r.tweet_id === id);
    if (!current) return;
    const base = current.agent_result?.draft?.drafted_response || current.editedDraft || "";
    
    let transformed = base;
    if (tone === "empathic") {
      transformed = `We completely understand your frustration and are truly sorry for the delay! ${base} We're right here to make this right.`;
    } else if (tone === "concise") {
      transformed = base.replace("We apologize for the delay. ", "").replace("Please DM us your order number so we can make this right.", "DM us your order ID for immediate assistance.");
    } else if (tone === "formal") {
      transformed = `Dear Customer, thank you for contacting support. ${base} Sincerely, Customer Care Team.`;
    }

    updateDraft(id, transformed);
  };

  const exportResults = () => {
    if (results.length === 0) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resolveai-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const metrics = useMemo(() => {
    const total = results.length;
    const autoHandled = results.filter(r => r.agent_result?.decision?.decision === "Auto-handle").length;
    const escalated = results.filter(r => r.agent_result?.decision?.decision === "Escalate").length;
    const resolved = results.filter(r => r.isResolved).length;
    const avgConfidence = total > 0
      ? (results.reduce((acc, r) => acc + (r.agent_result?.intent?.confidence || 0), 0) / total) * 100
      : 0;

    const intentCounts: Record<string, number> = {};
    results.forEach(r => {
      const intentName = r.agent_result?.intent?.intent || "Other";
      intentCounts[intentName] = (intentCounts[intentName] || 0) + 1;
    });

    const sentimentCounts: Record<string, number> = {
      Positive: 0,
      Neutral: 0,
      Negative: 0,
      Angry: 0
    };
    results.forEach(r => {
      const s = r.agent_result?.intent?.sentiment || "Neutral";
      sentimentCounts[s] = (sentimentCounts[s] || 0) + 1;
    });

    return {
      total,
      autoHandled,
      escalated,
      resolved,
      autoRate: total > 0 ? Math.round((autoHandled / total) * 100) : 0,
      escalateRate: total > 0 ? Math.round((escalated / total) * 100) : 0,
      avgConfidence: avgConfidence.toFixed(0),
      intentCounts,
      sentimentCounts
    };
  }, [results]);

  const filteredResults = useMemo(() => {
    return results.filter(r => {
      if (activeQueueFilter === "auto" && r.agent_result?.decision?.decision !== "Auto-handle") return false;
      if (activeQueueFilter === "escalate" && r.agent_result?.decision?.decision !== "Escalate") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          r.original_text.toLowerCase().includes(q) ||
          r.author.toLowerCase().includes(q) ||
          r.agent_result?.intent?.intent.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [results, activeQueueFilter, searchQuery]);

  const selectedTicket = useMemo(() => {
    return results.find(r => r.tweet_id === selectedTicketId) || results[0] || null;
  }, [results, selectedTicketId]);

  const donutData = useMemo(() => {
    const colors: Record<string, string> = {
      "Delivery Issue": "#4F46E5",
      "Refund Request": "#0D9488",
      "Complaint": "#E11D48",
      "Product Inquiry": "#0284C7",
      "Other": "#F59E0B"
    };

    const rawEntries: [string, number][] = Object.entries(metrics.intentCounts).length > 0
      ? (Object.entries(metrics.intentCounts) as [string, number][])
      : [
          ["Delivery Issue", 2],
          ["Refund Request", 1],
          ["Complaint", 1],
          ["Product Inquiry", 1]
        ];

    const sum = rawEntries.reduce((acc, [, count]) => acc + count, 0);

    let cumulativePercent = 0;
    return rawEntries.map(([name, count]) => {
      const percent = sum > 0 ? (count / sum) * 100 : 0;
      const startAngle = (cumulativePercent / 100) * 360;
      cumulativePercent += percent;
      const endAngle = (cumulativePercent / 100) * 360;

      return {
        name: String(name),
        count: Number(count),
        percent: Math.round(percent),
        color: colors[name] || "#64748B",
        startAngle,
        endAngle
      };
    });
  }, [metrics.intentCounts]);

  const presetExamples = [
    { label: "📦 Overdue Package", author: "alex_travels", text: "@AmazonHelp My package is 3 days late and I need it for a birthday party tomorrow! What is going on???" },
    { label: "💸 Refund Demand", author: "maria_k", text: "@AmazonHelp WORST SERVICE EVER. YOU LOST MY ORDER AND REFUSE TO REFUND ME." },
    { label: "🔄 Return Kindle", author: "sammy_reads", text: "@AmazonHelp how do I return a kindle that won't turn on?" },
    { label: "🌐 Global Shipping", author: "liam_nz", text: "@AmazonHelp Do you guys ship to New Zealand with expedited delivery?" },
    { label: "📺 Video Glitch", author: "clara_stream", text: "@AmazonHelp My prime video is buffering constantly on my smart TV." }
  ];

  return (
    <div className="app-wrapper">
      {/* 1. Persistent Sidebar (260px fixed width, generous spacing, soft #F1F5F9 hover) */}
      <aside className="app-sidebar">
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          {/* Brand Header with Custom Modern ResolveLogo */}
          <div style={{ padding: "0 2px" }}>
            <ResolveLogo size={38} showWordmark={true} />
          </div>

          {/* Navigation Menu */}
          <nav style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <button
              onClick={() => setCurrentNav("cockpit")}
              className={`nav-item ${currentNav === "cockpit" ? "nav-item-active" : ""}`}
            >
              <svg width="15" height="15" style={{ minWidth: 15, minHeight: 15 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span style={{ flex: 1 }}>Resolution Cockpit</span>
              {results.length > 0 && (
                <span style={{ fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "9999px", backgroundColor: "#E0E7FF", color: "#3730A3" }}>
                  {results.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setCurrentNav("analytics")}
              className={`nav-item ${currentNav === "analytics" ? "nav-item-active" : ""}`}
            >
              <svg width="15" height="15" style={{ minWidth: 15, minHeight: 15 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
              <span>Visual Analytics</span>
            </button>

            <button
              onClick={() => setCurrentNav("simulator")}
              className={`nav-item ${currentNav === "simulator" ? "nav-item-active" : ""}`}
            >
              <svg width="15" height="15" style={{ minWidth: 15, minHeight: 15 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              <span>Simulation Studio</span>
            </button>

            <button
              onClick={() => setCurrentNav("knowledge")}
              className={`nav-item ${currentNav === "knowledge" ? "nav-item-active" : ""}`}
            >
              <svg width="15" height="15" style={{ minWidth: 15, minHeight: 15 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>Knowledge Base</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer Widget */}
        <div style={{
          padding: "16px",
          borderRadius: "14px",
          backgroundColor: "#F8FAFC",
          border: "1px solid #E2E8F0",
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px" }}>
            <span style={{ fontWeight: "700", color: "#0F172A", display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "9999px", backgroundColor: "#0D9488" }}></span>
              <span>Agent Engine</span>
            </span>
            <span style={{ fontSize: "10px", color: "#64748B", fontFamily: "monospace" }}>24ms</span>
          </div>
          <div style={{ fontSize: "11px", color: "#475569" }}>
            Model: <span style={{ fontWeight: "600", color: "#0F172A" }}>{health?.model || "Local Engine"}</span>
          </div>
          <div style={{ width: "100%", height: "4px", backgroundColor: "#E2E8F0", borderRadius: "9999px", overflow: "hidden" }}>
            <div style={{ width: "80%", height: "100%", backgroundColor: "#0D9488", borderRadius: "9999px" }}></div>
          </div>
        </div>
      </aside>

      {/* 2. Main Body Area */}
      <div className="app-main">
        {/* Top Header: Centered pill search bar with inner shadow, spaced out solid buttons */}
        <header className="app-header">
          <div style={{ fontSize: "13px", fontWeight: "700", color: "#0F172A", width: "160px" }}>
            {currentNav === "cockpit" && "Live Operations"}
            {currentNav === "analytics" && "Metrics & Trends"}
            {currentNav === "simulator" && "Scenario Playground"}
            {currentNav === "knowledge" && "Grounded Policies"}
          </div>

          {/* Centered Pill Search Bar */}
          <div className="search-pill-container">
            <span style={{ position: "absolute", left: "14px", top: "12px", color: "#94A3B8" }}>
              <svg width="15" height="15" style={{ minWidth: 15, minHeight: 15 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search inquiries, handles, or intents... (⌘K)"
              className="search-pill-input"
            />
          </div>

          {/* Spaced Out Solid Action Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              onClick={() => setLiveStreamActive(!liveStreamActive)}
              className="btn-solid-teal"
            >
              <span style={{ width: "6px", height: "6px", borderRadius: "9999px", backgroundColor: "#FFFFFF" }}></span>
              <span>{liveStreamActive ? "Live Stream Active" : "Simulate Live Stream"}</span>
            </button>

            <button
              id="start-stream-btn"
              onClick={processStream}
              disabled={processing || tweets.length === 0}
              className="btn-solid-indigo"
            >
              <svg width="14" height="14" style={{ minWidth: 14, minHeight: 14 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
              <span>Benchmark Batch ({tweets.length})</span>
            </button>

            {results.length > 0 && (
              <button
                onClick={exportResults}
                style={{
                  padding: "7px 16px",
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "#475569",
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #E2E8F0",
                  borderRadius: "9999px",
                  cursor: "pointer",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)"
                }}
              >
                Export
              </button>
            )}

            {results.length > 0 && (
              <button
                onClick={() => {
                  setResults([]);
                  setSelectedTicketId(null);
                }}
                style={{
                  padding: "7px 14px",
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "#94A3B8",
                  backgroundColor: "transparent",
                  border: "none",
                  borderRadius: "9999px",
                  cursor: "pointer"
                }}
              >
                Clear
              </button>
            )}
          </div>
        </header>

        {/* Content Container */}
        <main style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "24px", maxWidth: "1280px", width: "100%", margin: "0 auto" }}>
          {statusNotification && (
            <div style={{
              padding: "14px 20px",
              borderRadius: "12px",
              border: "1px solid #E2E8F0",
              backgroundColor: statusNotification.type === "success" ? "#ECFDF5" : "#EEF2FF",
              color: statusNotification.type === "success" ? "#065F46" : "#3730A3",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "13px",
              fontWeight: "600"
            }}>
              <span>{statusNotification.message}</span>
              <button onClick={() => setStatusNotification(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: "bold" }}>✕</button>
            </div>
          )}

          {/* VIEW 1: RESOLUTION COCKPIT */}
          {currentNav === "cockpit" && (
            <>
              {/* Dynamic 4-KPI Strip */}
              <section className="kpi-grid">
                <div className="modern-card modern-card-hover" style={{ padding: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#64748B", marginBottom: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Evaluated</span>
                    <span style={{ fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "9999px", backgroundColor: "#F1F5F9", color: "#0F172A" }}>Active</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                    <span style={{ fontSize: "28px", fontWeight: "800", color: "#0F172A", letterSpacing: "-0.02em" }}>{metrics.total}</span>
                    <span style={{ fontSize: "12px", color: "#64748B", fontWeight: "500" }}>tickets</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748B", marginTop: "4px" }}>
                    {metrics.resolved} resolved ({metrics.total > 0 ? Math.round((metrics.resolved / metrics.total) * 100) : 0}%)
                  </div>
                </div>

                <div className="modern-card modern-card-hover" style={{ padding: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#0D9488", marginBottom: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em" }}>Auto-Resolution</span>
                    <span style={{ fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "9999px", backgroundColor: "#CCFBF1", color: "#0F766E" }}>
                      {metrics.autoRate}%
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "28px", fontWeight: "800", color: "#0D9488", letterSpacing: "-0.02em" }}>{metrics.autoHandled}</span>
                    <span style={{ fontSize: "12px", color: "#64748B" }}>autonomous</span>
                  </div>
                  <div style={{ width: "100%", height: "6px", backgroundColor: "#E2E8F0", borderRadius: "9999px", overflow: "hidden", marginTop: "8px" }}>
                    <div style={{ width: `${metrics.autoRate}%`, height: "100%", backgroundColor: "#0D9488", borderRadius: "9999px", transition: "width 0.5s ease" }}></div>
                  </div>
                </div>

                <div className="modern-card modern-card-hover" style={{ padding: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#E11D48", marginBottom: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em" }}>Specialist Escalations</span>
                    <span style={{ fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "9999px", backgroundColor: "#FFE4E6", color: "#BE123C" }}>
                      {metrics.escalateRate}%
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "28px", fontWeight: "800", color: "#E11D48", letterSpacing: "-0.02em" }}>{metrics.escalated}</span>
                    <span style={{ fontSize: "12px", color: "#64748B" }}>escalated</span>
                  </div>
                  <div style={{ width: "100%", height: "6px", backgroundColor: "#E2E8F0", borderRadius: "9999px", overflow: "hidden", marginTop: "8px" }}>
                    <div style={{ width: `${metrics.escalateRate}%`, height: "100%", backgroundColor: "#E11D48", borderRadius: "9999px", transition: "width 0.5s ease" }}></div>
                  </div>
                </div>

                <div className="modern-card modern-card-hover" style={{ padding: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#4F46E5", marginBottom: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em" }}>Confidence Mean</span>
                    <span style={{ fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "9999px", backgroundColor: "#EEF2FF", color: "#3730A3" }}>
                      &gt;70% Gate
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "28px", fontWeight: "800", color: "#4F46E5", letterSpacing: "-0.02em" }}>{metrics.avgConfidence}%</span>
                    <span style={{ fontSize: "12px", color: "#64748B" }}>precision</span>
                  </div>
                  <div style={{ width: "100%", height: "6px", backgroundColor: "#E2E8F0", borderRadius: "9999px", overflow: "hidden", marginTop: "8px" }}>
                    <div style={{ width: `${metrics.avgConfidence}%`, height: "100%", backgroundColor: "#4F46E5", borderRadius: "9999px", transition: "width 0.5s ease" }}></div>
                  </div>
                </div>
              </section>

              {/* Dual-Pane Layout */}
              <section className="cockpit-layout">
                {/* Left Feed */}
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {/* Feed Header */}
                  <div className="modern-card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: "700", color: "#0F172A" }}>
                      <span>Inbound Feed</span>
                      <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "9999px", backgroundColor: "#F1F5F9", color: "#475569" }}>
                        {filteredResults.length}
                      </span>
                    </div>

                    <div style={{ display: "flex", padding: "4px", backgroundColor: "#F1F5F9", borderRadius: "10px", gap: "2px" }}>
                      <button
                        onClick={() => setActiveQueueFilter("all")}
                        style={{
                          padding: "4px 10px",
                          fontSize: "12px",
                          fontWeight: "700",
                          borderRadius: "8px",
                          border: "none",
                          cursor: "pointer",
                          backgroundColor: activeQueueFilter === "all" ? "#FFFFFF" : "transparent",
                          color: activeQueueFilter === "all" ? "#0F172A" : "#64748B",
                          boxShadow: activeQueueFilter === "all" ? "0 1px 2px rgba(0,0,0,0.05)" : "none"
                        }}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setActiveQueueFilter("auto")}
                        style={{
                          padding: "4px 10px",
                          fontSize: "12px",
                          fontWeight: "700",
                          borderRadius: "8px",
                          border: "none",
                          cursor: "pointer",
                          backgroundColor: activeQueueFilter === "auto" ? "#FFFFFF" : "transparent",
                          color: activeQueueFilter === "auto" ? "#0D9488" : "#64748B",
                          boxShadow: activeQueueFilter === "auto" ? "0 1px 2px rgba(0,0,0,0.05)" : "none"
                        }}
                      >
                        Auto
                      </button>
                      <button
                        onClick={() => setActiveQueueFilter("escalate")}
                        style={{
                          padding: "4px 10px",
                          fontSize: "12px",
                          fontWeight: "700",
                          borderRadius: "8px",
                          border: "none",
                          cursor: "pointer",
                          backgroundColor: activeQueueFilter === "escalate" ? "#FFFFFF" : "transparent",
                          color: activeQueueFilter === "escalate" ? "#E11D48" : "#64748B",
                          boxShadow: activeQueueFilter === "escalate" ? "0 1px 2px rgba(0,0,0,0.05)" : "none"
                        }}
                      >
                        Escalate
                      </button>
                    </div>
                  </div>

                  {/* Shimmer Skeleton Loaders during Processing */}
                  {processing && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {[1, 2].map(i => (
                        <div key={i} className="modern-card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div className="skeleton-shimmer" style={{ width: "32px", height: "32px", borderRadius: "10px" }}></div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
                              <div className="skeleton-shimmer" style={{ height: "12px", width: "120px", borderRadius: "6px" }}></div>
                              <div className="skeleton-shimmer" style={{ height: "10px", width: "60px", borderRadius: "6px" }}></div>
                            </div>
                          </div>
                          <div className="skeleton-shimmer" style={{ height: "14px", width: "100%", borderRadius: "6px" }}></div>
                          <div className="skeleton-shimmer" style={{ height: "14px", width: "80%", borderRadius: "6px" }}></div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ticket List */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "640px", overflowY: "auto", paddingRight: "4px" }}>
                    {filteredResults.map(ticket => {
                      const isSelected = selectedTicket?.tweet_id === ticket.tweet_id;
                      const isEscalate = ticket.agent_result?.decision?.decision === "Escalate";
                      const sentiment = ticket.agent_result?.intent?.sentiment?.toLowerCase() || "neutral";

                      const sentimentStyles = {
                        angry: { bg: "#FFE4E6", text: "#BE123C", label: "Angry" },
                        negative: { bg: "#FEF3C7", text: "#B45309", label: "Negative" },
                        positive: { bg: "#ECFDF5", text: "#065F46", label: "Positive" },
                        neutral: { bg: "#F1F5F9", text: "#475569", label: "Neutral" }
                      }[sentiment] || { bg: "#F1F5F9", text: "#475569", label: "Neutral" };

                      return (
                        <div
                          key={ticket.tweet_id}
                          onClick={() => setSelectedTicketId(ticket.tweet_id)}
                          className={isSelected ? "modern-card-active" : "modern-card modern-card-hover"}
                          style={{ padding: "18px", cursor: "pointer" }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <div style={{
                                width: "28px",
                                height: "28px",
                                minWidth: "28px",
                                minHeight: "28px",
                                borderRadius: "8px",
                                backgroundColor: "#F1F5F9",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "11px",
                                fontWeight: "800",
                                color: "#0F172A"
                              }}>
                                {ticket.author.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <span style={{ fontSize: "13px", fontWeight: "700", color: "#0F172A" }}>@{ticket.author}</span>
                                <span style={{ fontSize: "11px", color: "#64748B", display: "block" }}>{ticket.timestamp}</span>
                              </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              {ticket.isResolved && (
                                <span style={{ fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "9999px", backgroundColor: "#D1FAE5", color: "#065F46" }}>
                                  ✓ Resolved
                                </span>
                              )}
                              <span style={{ fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "9999px", backgroundColor: sentimentStyles.bg, color: sentimentStyles.text }}>
                                {sentimentStyles.label}
                              </span>
                            </div>
                          </div>

                          <p style={{ fontSize: "12px", color: "#475569", margin: "0 0 12px 0", lineHeight: "1.5" }}>
                            &ldquo;{ticket.original_text}&rdquo;
                          </p>

                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "10px", borderTop: "1px solid #F1F5F9", fontSize: "11px" }}>
                            <span style={{ fontWeight: "600", color: "#0F172A", backgroundColor: "#F8FAFC", padding: "3px 8px", borderRadius: "6px", border: "1px solid #E2E8F0" }}>
                              {ticket.agent_result?.intent?.intent}
                            </span>
                            <span style={{
                              fontWeight: "700",
                              padding: "3px 10px",
                              borderRadius: "9999px",
                              backgroundColor: isEscalate ? "#FFE4E6" : "#CCFBF1",
                              color: isEscalate ? "#BE123C" : "#0F766E"
                            }}>
                              {isEscalate ? "🚨 Escalate" : "⚡ Auto-Handled"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right Inspector */}
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  {selectedTicket && (
                    <>
                      {/* Ticket Detail Card */}
                      <div className="modern-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "14px", borderBottom: "1px solid #F1F5F9" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div style={{
                              width: "40px",
                              height: "40px",
                              minWidth: "40px",
                              minHeight: "40px",
                              borderRadius: "12px",
                              background: "linear-gradient(135deg, #4F46E5 0%, #0D9488 100%)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: "800",
                              color: "#FFFFFF",
                              fontSize: "14px"
                            }}>
                              {selectedTicket.author.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ fontSize: "15px", fontWeight: "800", color: "#0F172A" }}>@{selectedTicket.author}</span>
                                <span style={{ fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "9999px", backgroundColor: "#F1F5F9", color: "#475569" }}>
                                  {selectedTicket.channel}
                                </span>
                              </div>
                              <span style={{ fontSize: "11px", color: "#94A3B8" }}>ID: {selectedTicket.tweet_id} • {selectedTicket.timestamp}</span>
                            </div>
                          </div>

                          <button
                            onClick={() => toggleResolved(selectedTicket.tweet_id)}
                            style={{
                              padding: "6px 14px",
                              fontSize: "12px",
                              fontWeight: "700",
                              borderRadius: "9999px",
                              border: selectedTicket.isResolved ? "1px solid #A7F3D0" : "1px solid #E2E8F0",
                              backgroundColor: selectedTicket.isResolved ? "#ECFDF5" : "#FFFFFF",
                              color: selectedTicket.isResolved ? "#065F46" : "#0F172A",
                              cursor: "pointer"
                            }}
                          >
                            {selectedTicket.isResolved ? "✓ Resolved" : "Mark Resolved"}
                          </button>
                        </div>

                        <div>
                          <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748B", display: "block", marginBottom: "6px" }}>
                            Customer Inquiry
                          </span>
                          <div style={{ padding: "16px", borderRadius: "12px", backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0", fontSize: "13px", fontWeight: "500", color: "#0F172A", lineHeight: "1.6" }}>
                            &ldquo;{selectedTicket.original_text}&rdquo;
                          </div>
                        </div>
                      </div>

                      {/* Decisioning Pipeline Card */}
                      <div className="modern-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid #F1F5F9" }}>
                          <span style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "#0F172A" }}>
                            AI Agent Decisioning Engine
                          </span>
                          <span style={{ fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "6px", backgroundColor: "#EEF2FF", color: "#4F46E5", border: "1px solid #E0E7FF" }}>
                            Deterministic Guardrails
                          </span>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                          <div style={{ padding: "14px", borderRadius: "12px", backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px", color: "#64748B", fontWeight: "700", textTransform: "uppercase" }}>
                              <span>1. Intent</span>
                              <span style={{ color: "#4F46E5", fontWeight: "800" }}>{Math.round((selectedTicket.agent_result?.intent?.confidence || 0) * 100)}%</span>
                            </div>
                            <div style={{ fontSize: "13px", fontWeight: "700", color: "#0F172A", marginTop: "4px" }}>
                              {selectedTicket.agent_result?.intent?.intent}
                            </div>
                            <div style={{ width: "100%", height: "4px", backgroundColor: "#E2E8F0", borderRadius: "9999px", overflow: "hidden", marginTop: "8px" }}>
                              <div style={{ width: `${(selectedTicket.agent_result?.intent?.confidence || 0) * 100}%`, height: "100%", backgroundColor: "#4F46E5" }}></div>
                            </div>
                          </div>

                          <div style={{ padding: "14px", borderRadius: "12px", backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px", color: "#64748B", fontWeight: "700", textTransform: "uppercase" }}>
                              <span>2. Sentiment</span>
                              <span style={{ color: "#0F172A", fontWeight: "800" }}>{selectedTicket.agent_result?.intent?.sentiment}</span>
                            </div>
                            <div style={{ fontSize: "12px", color: "#475569", marginTop: "4px", lineHeight: "1.4" }}>
                              {selectedTicket.agent_result?.intent?.sentiment?.toLowerCase() === "angry"
                                ? "Critical negative tone (Policy: Human Escalation)"
                                : "Manageable tone (Policy: Autonomous Handling)"}
                            </div>
                          </div>
                        </div>

                        {/* Decision Banner */}
                        <div style={{
                          padding: "16px",
                          borderRadius: "12px",
                          border: selectedTicket.agent_result?.decision?.decision === "Escalate" ? "1px solid #FECDD3" : "1px solid #A7F3D0",
                          backgroundColor: selectedTicket.agent_result?.decision?.decision === "Escalate" ? "#FFF1F2" : "#F0FDF4",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "12px",
                          fontSize: "13px"
                        }}>
                          <span style={{ fontSize: "16px" }}>
                            {selectedTicket.agent_result?.decision?.decision === "Escalate" ? "🚨" : "⚡"}
                          </span>
                          <div>
                            <div style={{ fontWeight: "700", color: "#0F172A" }}>
                              {selectedTicket.agent_result?.decision?.decision === "Escalate"
                                ? "Escalated to Human Specialist Tier-2"
                                : "Autonomous Resolution Authorized"}
                            </div>
                            <div style={{ fontSize: "12px", color: "#475569", marginTop: "2px" }}>
                              {selectedTicket.agent_result?.decision?.reason}
                            </div>
                          </div>
                        </div>

                        {/* Grounded FAQ context */}
                        {selectedTicket.agent_result?.draft?.retrieved_context && (
                          <div style={{ padding: "16px", borderRadius: "12px", backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0", fontSize: "12px" }}>
                            <div style={{ fontWeight: "700", color: "#3730A3", display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                              <span>📚</span>
                              <span>Grounded Knowledge Base (FAQ):</span>
                            </div>
                            <p style={{ margin: 0, fontStyle: "italic", color: "#475569", lineHeight: "1.5" }}>
                              &ldquo;{selectedTicket.agent_result.draft.retrieved_context}&rdquo;
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Response Studio */}
                      <div className="modern-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid #F1F5F9" }}>
                          <span style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "#0F172A" }}>
                            AI Response Studio
                          </span>

                          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                            <span style={{ color: "#64748B" }}>Tone:</span>
                            <button
                              onClick={() => applyTone(selectedTicket.tweet_id, "empathic")}
                              style={{ padding: "4px 10px", borderRadius: "9999px", backgroundColor: "#F1F5F9", color: "#475569", border: "none", fontSize: "11px", fontWeight: "600", cursor: "pointer" }}
                            >
                              ✨ Empathetic
                            </button>
                            <button
                              onClick={() => applyTone(selectedTicket.tweet_id, "concise")}
                              style={{ padding: "4px 10px", borderRadius: "9999px", backgroundColor: "#F1F5F9", color: "#475569", border: "none", fontSize: "11px", fontWeight: "600", cursor: "pointer" }}
                            >
                              ⚡ Concise
                            </button>
                            <button
                              onClick={() => applyTone(selectedTicket.tweet_id, "formal")}
                              style={{ padding: "4px 10px", borderRadius: "9999px", backgroundColor: "#F1F5F9", color: "#475569", border: "none", fontSize: "11px", fontWeight: "600", cursor: "pointer" }}
                            >
                              👔 Formal
                            </button>
                          </div>
                        </div>

                        <textarea
                          rows={4}
                          value={selectedTicket.editedDraft}
                          onChange={e => updateDraft(selectedTicket.tweet_id, e.target.value)}
                          placeholder="No automated draft generated for this escalated ticket."
                          style={{
                            width: "100%",
                            padding: "16px",
                            fontSize: "13px",
                            lineHeight: "1.6",
                            borderRadius: "12px",
                            backgroundColor: "#F8FAFC",
                            border: "1px solid #E2E8F0",
                            color: "#0F172A",
                            outline: "none",
                            resize: "none",
                            fontFamily: "inherit"
                          }}
                        />

                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "12px", color: "#64748B" }}>
                            {selectedTicket.editedDraft?.length || 0}/280 characters
                          </span>

                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <button
                              onClick={() => copyDraft(selectedTicket.tweet_id, selectedTicket.editedDraft || "")}
                              disabled={!selectedTicket.editedDraft}
                              style={{
                                padding: "8px 16px",
                                fontSize: "12px",
                                fontWeight: "600",
                                color: "#0F172A",
                                backgroundColor: "#FFFFFF",
                                border: "1px solid #E2E8F0",
                                borderRadius: "9999px",
                                cursor: "pointer",
                                opacity: !selectedTicket.editedDraft ? 0.4 : 1
                              }}
                            >
                              {copiedId === selectedTicket.tweet_id ? "✓ Copied" : "Copy Reply"}
                            </button>

                            <button
                              onClick={() => toggleResolved(selectedTicket.tweet_id)}
                              className="btn-solid-indigo"
                            >
                              {selectedTicket.isResolved ? "Reopen Ticket" : "Approve & Send Reply"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </section>
            </>
          )}

          {/* VIEW 2: VISUAL ANALYTICS */}
          {currentNav === "analytics" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#0F172A", margin: 0, letterSpacing: "-0.02em" }}>Interactive Analytics & Intent Distribution</h2>
                  <p style={{ fontSize: "12px", color: "#64748B", margin: "4px 0 0 0" }}>Unwatermarked dynamic vector charts reflecting real-time triaged support tickets.</p>
                </div>
                <span style={{ fontSize: "12px", fontWeight: "700", padding: "4px 12px", borderRadius: "9999px", backgroundColor: "#EEF2FF", color: "#4F46E5", border: "1px solid #E0E7FF" }}>
                  {metrics.total} Processed Samples
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "7fr 5fr", gap: "24px" }}>
                {/* Donut Chart */}
                <div className="modern-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid #F1F5F9" }}>
                    <span style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "#0F172A" }}>
                      Intent Categorization (Donut Chart)
                    </span>
                    <span style={{ fontSize: "12px", color: "#64748B" }}>Hover slices to inspect</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", gap: "24px", paddingTop: "8px" }}>
                    <div style={{ position: "relative", width: "200px", height: "200px", flexShrink: 0 }}>
                      <svg viewBox="0 0 100 100" width="200" height="200" style={{ transform: "rotate(-90deg)" }}>
                        {donutData.map((slice, idx) => {
                          const strokeDasharray = `${slice.percent} ${100 - slice.percent}`;
                          const strokeDashoffset = donutData
                            .slice(0, idx)
                            .reduce((acc, curr) => acc - curr.percent, 0);

                          const isHovered = hoveredIntent === slice.name;

                          return (
                            <circle
                              key={slice.name}
                              cx="50"
                              cy="50"
                              r="38"
                              fill="transparent"
                              stroke={slice.color}
                              strokeWidth={isHovered ? "14" : "12"}
                              strokeDasharray={strokeDasharray}
                              strokeDashoffset={strokeDashoffset}
                              onMouseEnter={() => setHoveredIntent(slice.name)}
                              onMouseLeave={() => setHoveredIntent(null)}
                              style={{ transition: "all 0.2s ease", cursor: "pointer" }}
                            />
                          );
                        })}
                      </svg>

                      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                        <span style={{ fontSize: "24px", fontWeight: "800", color: "#0F172A", letterSpacing: "-0.02em" }}>
                          {hoveredIntent
                            ? donutData.find(d => d.name === hoveredIntent)?.percent + "%"
                            : metrics.total}
                        </span>
                        <span style={{ fontSize: "10px", fontWeight: "700", color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {hoveredIntent || "Total Tickets"}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
                      {donutData.map(item => (
                        <div
                          key={item.name}
                          onMouseEnter={() => setHoveredIntent(item.name)}
                          onMouseLeave={() => setHoveredIntent(null)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 12px",
                            borderRadius: "10px",
                            backgroundColor: hoveredIntent === item.name ? "#F1F5F9" : "transparent",
                            cursor: "pointer"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ width: "10px", height: "10px", borderRadius: "3px", backgroundColor: item.color }}></span>
                            <span style={{ fontSize: "12px", color: "#0F172A", fontWeight: "600" }}>{item.name}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                            <span style={{ fontWeight: "700", color: "#0F172A" }}>{item.count}</span>
                            <span style={{ color: "#64748B" }}>({item.percent}%)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bar Chart */}
                <div className="modern-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid #F1F5F9" }}>
                    <span style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "#0F172A" }}>
                      Triage Decision Rate
                    </span>
                    <span style={{ fontSize: "12px", fontWeight: "700", color: "#0D9488" }}>{metrics.autoRate}% Autonomous</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "16px", paddingTop: "8px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px" }}>
                        <span style={{ fontWeight: "700", color: "#0F172A" }}>⚡ Auto-Handled</span>
                        <span style={{ fontWeight: "800", color: "#0D9488" }}>{metrics.autoHandled} ({metrics.autoRate}%)</span>
                      </div>
                      <div style={{ width: "100%", backgroundColor: "#E2E8F0", borderRadius: "9999px", height: "12px", overflow: "hidden" }}>
                        <div style={{ width: `${Math.max(metrics.autoRate, 5)}%`, height: "100%", backgroundColor: "#0D9488", borderRadius: "9999px", transition: "width 0.5s ease" }}></div>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px" }}>
                        <span style={{ fontWeight: "700", color: "#0F172A" }}>🚨 Escalated to Specialist</span>
                        <span style={{ fontWeight: "800", color: "#E11D48" }}>{metrics.escalated} ({metrics.escalateRate}%)</span>
                      </div>
                      <div style={{ width: "100%", backgroundColor: "#E2E8F0", borderRadius: "9999px", height: "12px", overflow: "hidden" }}>
                        <div style={{ width: `${Math.max(metrics.escalateRate, 5)}%`, height: "100%", backgroundColor: "#E11D48", borderRadius: "9999px", transition: "width 0.5s ease" }}></div>
                      </div>
                    </div>

                    <div style={{ paddingTop: "14px", borderTop: "1px solid #F1F5F9", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748B", textTransform: "uppercase" }}>Sentiment Spectrum</span>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", textAlign: "center" }}>
                        <div style={{ padding: "8px", borderRadius: "8px", backgroundColor: "#ECFDF5", border: "1px solid #A7F3D0" }}>
                          <span style={{ fontSize: "10px", fontWeight: "700", color: "#065F46", display: "block" }}>Positive</span>
                          <span style={{ fontSize: "14px", fontWeight: "800", color: "#065F46" }}>{metrics.sentimentCounts.Positive || 0}</span>
                        </div>
                        <div style={{ padding: "8px", borderRadius: "8px", backgroundColor: "#F1F5F9", border: "1px solid #E2E8F0" }}>
                          <span style={{ fontSize: "10px", fontWeight: "700", color: "#475569", display: "block" }}>Neutral</span>
                          <span style={{ fontSize: "14px", fontWeight: "800", color: "#0F172A" }}>{metrics.sentimentCounts.Neutral || 0}</span>
                        </div>
                        <div style={{ padding: "8px", borderRadius: "8px", backgroundColor: "#FEF3C7", border: "1px solid #FDE68A" }}>
                          <span style={{ fontSize: "10px", fontWeight: "700", color: "#B45309", display: "block" }}>Negative</span>
                          <span style={{ fontSize: "14px", fontWeight: "800", color: "#92400E" }}>{metrics.sentimentCounts.Negative || 0}</span>
                        </div>
                        <div style={{ padding: "8px", borderRadius: "8px", backgroundColor: "#FFE4E6", border: "1px solid #FECDD3" }}>
                          <span style={{ fontSize: "10px", fontWeight: "700", color: "#BE123C", display: "block" }}>Angry</span>
                          <span style={{ fontSize: "14px", fontWeight: "800", color: "#9F1239" }}>{metrics.sentimentCounts.Angry || 0}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 3: SIMULATION STUDIO */}
          {currentNav === "simulator" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "800px", margin: "0 auto", width: "100%" }}>
              <div className="modern-card" style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#0F172A", margin: 0, letterSpacing: "-0.02em" }}>Interactive Simulation Studio</h2>
                  <p style={{ fontSize: "12px", color: "#64748B", margin: "4px 0 0 0" }}>Test the autonomous agent against custom customer inquiries, edge cases, and policy limits.</p>
                </div>

                <div>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748B", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>
                    Scenario Presets
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {presetExamples.map((preset, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setCustomAuthor(preset.author);
                          setCustomText(preset.text);
                        }}
                        style={{
                          padding: "6px 14px",
                          borderRadius: "9999px",
                          backgroundColor: "#F1F5F9",
                          color: "#475569",
                          border: "1px solid #E2E8F0",
                          fontSize: "12px",
                          fontWeight: "600",
                          cursor: "pointer"
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleCustomSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 3fr", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#0F172A", marginBottom: "6px" }}>Customer Handle</label>
                      <input
                        type="text"
                        value={customAuthor}
                        onChange={e => setCustomAuthor(e.target.value)}
                        placeholder="handle"
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          fontSize: "12px",
                          borderRadius: "10px",
                          backgroundColor: "#F8FAFC",
                          border: "1px solid #E2E8F0",
                          outline: "none"
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                        <label style={{ fontSize: "12px", fontWeight: "700", color: "#0F172A" }}>Support Inquiry</label>
                        <span style={{ fontSize: "11px", color: "#94A3B8" }}>{customText.length}/280</span>
                      </div>
                      <textarea
                        rows={3}
                        maxLength={280}
                        value={customText}
                        onChange={e => setCustomText(e.target.value)}
                        placeholder="Type customer message or select a preset..."
                        style={{
                          width: "100%",
                          padding: "12px 14px",
                          fontSize: "13px",
                          borderRadius: "10px",
                          backgroundColor: "#F8FAFC",
                          border: "1px solid #E2E8F0",
                          outline: "none",
                          resize: "none",
                          fontFamily: "inherit"
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="submit"
                      disabled={!customText.trim() || customLoading}
                      className="btn-solid-indigo"
                    >
                      {customLoading ? (
                        <span>Simulating...</span>
                      ) : (
                        <>
                          <span>Run Agent Triage</span>
                          <span>→</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* VIEW 4: RAG KNOWLEDGE BASE */}
          {currentNav === "knowledge" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "800px", margin: "0 auto", width: "100%" }}>
              <div className="modern-card" style={{ overflow: "hidden", border: "1px solid #E2E8F0" }}>
                <div style={{ padding: "24px", borderBottom: "1px solid #E2E8F0" }}>
                  <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#0F172A", margin: 0, letterSpacing: "-0.02em" }}>RAG Knowledge Base & Grounding Context</h2>
                  <p style={{ fontSize: "12px", color: "#64748B", margin: "4px 0 0 0" }}>Verified policy guidelines utilized by the autonomous reasoning agent to ground responses and avoid hallucinations.</p>
                </div>

                <div>
                  <div style={{ padding: "24px", borderBottom: "1px solid #E2E8F0" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: "700", color: "#0F172A", display: "flex", alignItems: "center", gap: "8px", margin: "0 0 8px 0" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "9999px", backgroundColor: "#4F46E5" }}></span>
                      <span>Delivery Issue Policy</span>
                    </h3>
                    <p style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6", margin: 0 }}>
                      &ldquo;We apologize for the delay. Please check your tracking link. If it&apos;s been more than 48 hours past the expected date, we will issue a replacement or refund.&rdquo;
                    </p>
                  </div>

                  <div style={{ padding: "24px", borderBottom: "1px solid #E2E8F0" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: "700", color: "#0F172A", display: "flex", alignItems: "center", gap: "8px", margin: "0 0 8px 0" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "9999px", backgroundColor: "#0D9488" }}></span>
                      <span>Refund Request Policy</span>
                    </h3>
                    <p style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6", margin: 0 }}>
                      &ldquo;Refunds typically process within 3-5 business days. Please provide your order number via DM so we can process it immediately.&rdquo;
                    </p>
                  </div>

                  <div style={{ padding: "24px", borderBottom: "1px solid #E2E8F0" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: "700", color: "#0F172A", display: "flex", alignItems: "center", gap: "8px", margin: "0 0 8px 0" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "9999px", backgroundColor: "#0284C7" }}></span>
                      <span>Product Inquiry Guidelines</span>
                    </h3>
                    <p style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6", margin: 0 }}>
                      &ldquo;You can find detailed product specifications on the product page. If you have specific questions, let us know!&rdquo;
                    </p>
                  </div>

                  <div style={{ padding: "24px" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: "700", color: "#0F172A", display: "flex", alignItems: "center", gap: "8px", margin: "0 0 8px 0" }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "9999px", backgroundColor: "#E11D48" }}></span>
                      <span>Escalation Protocol for Complaints</span>
                    </h3>
                    <p style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6", margin: 0 }}>
                      &ldquo;We&apos;re sorry to hear about your experience. Please DM us your account details and order number so we can make this right.&rdquo;
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
