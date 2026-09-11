"use client";

import { useEffect, useState, useMemo, useRef } from "react";

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

export default function Home() {
  // Navigation & View State
  const [currentNav, setCurrentNav] = useState<NavigationTab>("cockpit");
  const [activeQueueFilter, setActiveQueueFilter] = useState<"all" | "auto" | "escalate">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Data States
  const [tweets, setTweets] = useState<SampleTweet[]>([]);
  const [results, setResults] = useState<ProcessedTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);

  // Processing & Simulation States
  const [processing, setProcessing] = useState(false);
  const [liveStreamActive, setLiveStreamActive] = useState(false);
  const [customAuthor, setCustomAuthor] = useState("traveler_sam");
  const [customText, setCustomText] = useState("");
  const [customLoading, setCustomLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusNotification, setStatusNotification] = useState<{ message: string; type: "info" | "success" | "warning" } | null>(null);

  // Donut chart hover state
  const [hoveredIntent, setHoveredIntent] = useState<string | null>(null);

  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // API Helper
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

  // Initial Load
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

  // Process a single ticket
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
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        isResolved: false,
        editedDraft: data.agent_result?.draft?.drafted_response || ""
      };

      setResults(prev => [enriched, ...prev]);
      setSelectedTicketId(prev => prev ?? enriched.tweet_id);
      return enriched;
    }
    return null;
  };

  // Run full benchmark batch
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

  // Live Stream Simulation
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
          id: "stream-" + Date.now().toString().slice(-4),
          author: item.author,
          text: item.text
        });
      }, 5500);
    } else {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    }

    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, [liveStreamActive]);

  // Submit custom inquiry
  const handleCustomSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customText.trim() || customLoading) return;
    setCustomLoading(true);
    try {
      const ticket = await processSingleTweet({
        id: "c-" + Date.now().toString().slice(-4),
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
      transformed = `We completely understand your frustration and are truly sorry for the inconvenience! ${base} We're right here to make this right.`;
    } else if (tone === "concise") {
      transformed = base.replace("We apologize for the delay. ", "").replace("Please DM us your order number so we can make this right.", "DM us your order ID for immediate resolution.");
    } else if (tone === "formal") {
      transformed = `Dear Customer, thank you for reaching out. ${base} Sincerely, Customer Support Team.`;
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

  // Metrics computation
  const metrics = useMemo(() => {
    const total = results.length;
    const autoHandled = results.filter(r => r.agent_result?.decision?.decision === "Auto-handle").length;
    const escalated = results.filter(r => r.agent_result?.decision?.decision === "Escalate").length;
    const resolved = results.filter(r => r.isResolved).length;
    const avgConfidence = total > 0
      ? (results.reduce((acc, r) => acc + (r.agent_result?.intent?.confidence || 0), 0) / total) * 100
      : 0;

    // Intent counts
    const intentCounts: Record<string, number> = {};
    results.forEach(r => {
      const intentName = r.agent_result?.intent?.intent || "Other";
      intentCounts[intentName] = (intentCounts[intentName] || 0) + 1;
    });

    // Sentiment counts
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

  // Filtered queue items
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

  // Selected ticket
  const selectedTicket = useMemo(() => {
    return results.find(r => r.tweet_id === selectedTicketId) || results[0] || null;
  }, [results, selectedTicketId]);

  // Donut chart calculation helper
  const donutData = useMemo(() => {
    const total = metrics.total || 1;
    const colors: Record<string, string> = {
      "Delivery Issue": "#4F46E5",  // Indigo
      "Refund Request": "#0D9488",  // Teal
      "Complaint": "#E11D48",       // Rose
      "Product Inquiry": "#0284C7", // Sky
      "Other": "#F59E0B"            // Amber
    };

    const entries = Object.entries(metrics.intentCounts).length > 0
      ? Object.entries(metrics.intentCounts)
      : [
          ["Delivery Issue", 3],
          ["Refund Request", 2],
          ["Complaint", 1],
          ["Product Inquiry", 1]
        ];

    const sum = entries.reduce((acc, [, count]) => acc + count, 0);

    let cumulativePercent = 0;
    return entries.map(([name, count]) => {
      const percent = (count / sum) * 100;
      const startAngle = (cumulativePercent / 100) * 360;
      cumulativePercent += percent;
      const endAngle = (cumulativePercent / 100) * 360;

      return {
        name,
        count,
        percent: Math.round(percent),
        color: colors[name] || "#64748B",
        startAngle,
        endAngle
      };
    });
  }, [metrics.intentCounts, metrics.total]);

  const presetExamples = [
    { label: "📦 Overdue Package", author: "alex_travels", text: "@AmazonHelp My package is 3 days late and I need it for a birthday party tomorrow! What is going on???" },
    { label: "💸 Refund Demand", author: "maria_k", text: "@AmazonHelp WORST SERVICE EVER. YOU LOST MY ORDER AND REFUSE TO REFUND ME." },
    { label: "🔄 Return Kindle", author: "sammy_reads", text: "@AmazonHelp how do I return a kindle that won't turn on?" },
    { label: "🌐 Global Shipping", author: "liam_nz", text: "@AmazonHelp Do you guys ship to New Zealand with expedited delivery?" },
    { label: "📺 Video Glitch", author: "clara_stream", text: "@AmazonHelp My prime video is buffering constantly on my smart TV." }
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* 1. Persistent Sidebar (Music-Streaming Interface Inspired) */}
      <aside className="w-64 border-r border-slate-200/80 bg-white flex flex-col justify-between p-5 sticky top-0 h-screen z-40 shrink-0">
        <div className="space-y-6">
          {/* Brand Header */}
          <div className="flex items-center space-x-3 px-1">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-teal-400 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 ring-4 ring-indigo-50">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-base font-extrabold tracking-tight text-slate-900">ResolveAI</span>
                <span className="px-1.5 py-0.2 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-100">
                  v2.5
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Support Intelligence Hub</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <button
              onClick={() => setCurrentNav("cockpit")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentNav === "cockpit"
                  ? "bg-indigo-50 text-indigo-700 shadow-2xs font-bold"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center space-x-3">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Resolution Cockpit</span>
              </div>
              {results.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                  {results.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setCurrentNav("analytics")}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentNav === "analytics"
                  ? "bg-indigo-50 text-indigo-700 shadow-2xs font-bold"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
              <span>Visual Analytics</span>
            </button>

            <button
              onClick={() => setCurrentNav("simulator")}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentNav === "simulator"
                  ? "bg-indigo-50 text-indigo-700 shadow-2xs font-bold"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              <span>Simulation Studio</span>
            </button>

            <button
              onClick={() => setCurrentNav("knowledge")}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentNav === "knowledge"
                  ? "bg-indigo-50 text-indigo-700 shadow-2xs font-bold"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>Knowledge Base</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer: Engine Status Widget */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></span>
              <span>FastAPI Engine</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">24ms</span>
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            Model: <span className="font-semibold text-slate-700">{health?.model || "Local Engine"}</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-1 overflow-hidden">
            <div className="bg-teal-500 h-1 rounded-full w-4/5"></div>
          </div>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Persistent Top Header */}
        <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between shadow-2xs">
          {/* Search bar */}
          <div className="relative w-80">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by text, handle, or intent... (⌘K)"
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
            />
          </div>

          {/* Quick Global Actions */}
          <div className="flex items-center space-x-3">
            {/* Live Stream Switch */}
            <button
              onClick={() => setLiveStreamActive(!liveStreamActive)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center space-x-2 cursor-pointer ${
                liveStreamActive
                  ? "bg-teal-50 text-teal-800 border-teal-200 shadow-2xs"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${liveStreamActive ? "bg-teal-500 animate-ping" : "bg-slate-300"}`}></span>
              <span>{liveStreamActive ? "Live Ticker Active" : "Simulate Live Stream"}</span>
            </button>

            {/* Run Benchmark Batch */}
            <button
              id="start-stream-btn"
              onClick={processStream}
              disabled={processing || tweets.length === 0}
              className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm shadow-indigo-600/20 cursor-pointer disabled:cursor-not-allowed flex items-center space-x-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
              <span>Benchmark Batch ({tweets.length})</span>
            </button>

            {/* Export JSON */}
            {results.length > 0 && (
              <button
                onClick={exportResults}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-2xs"
                title="Export Data"
              >
                Export JSON
              </button>
            )}

            {/* Clear */}
            {results.length > 0 && (
              <button
                onClick={() => {
                  setResults([]);
                  setSelectedTicketId(null);
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                title="Clear feed"
              >
                Clear
              </button>
            )}

            {/* Support Agent Avatar */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-700 to-slate-900 flex items-center justify-center text-white text-xs font-bold ring-2 ring-slate-200 shadow-2xs">
              AI
            </div>
          </div>
        </header>

        {/* Main Canvas */}
        <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
          {/* Floating Status Notification */}
          {statusNotification && (
            <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm animate-fade-in ${
              statusNotification.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-900" :
              statusNotification.type === "warning" ? "bg-amber-50 border-amber-200 text-amber-900" :
              "bg-indigo-50 border-indigo-200 text-indigo-900"
            }`}>
              <div className="flex items-center space-x-2 text-xs font-semibold">
                <span className={`w-2 h-2 rounded-full ${
                  statusNotification.type === "success" ? "bg-emerald-500" :
                  statusNotification.type === "warning" ? "bg-amber-500" :
                  "bg-indigo-500"
                }`}></span>
                <span>{statusNotification.message}</span>
              </div>
              <button onClick={() => setStatusNotification(null)} className="text-slate-400 hover:text-slate-700 text-xs font-bold">✕</button>
            </div>
          )}

          {/* VIEW 1: RESOLUTION COCKPIT (DUAL-PANE WORKSPACE) */}
          {currentNav === "cockpit" && (
            <>
              {/* Dynamic KPI Strip (Floating Cards) */}
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Metric 1 */}
                <div className="floating-card floating-card-hover p-4.5 space-y-2">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Total Evaluated</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">Live</span>
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{metrics.total}</span>
                    <span className="text-xs text-slate-400 font-medium">tickets</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {metrics.resolved} marked resolved ({metrics.total > 0 ? Math.round((metrics.resolved / metrics.total) * 100) : 0}%)
                  </div>
                </div>

                {/* Metric 2 */}
                <div className="floating-card floating-card-hover p-4.5 space-y-2">
                  <div className="flex items-center justify-between text-teal-700">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Auto-Resolution</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200">
                      {metrics.autoRate}%
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-extrabold text-teal-600 tracking-tight">{metrics.autoHandled}</span>
                    <span className="text-xs text-slate-400 font-medium">autonomous</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-teal-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${metrics.autoRate}%` }}></div>
                  </div>
                </div>

                {/* Metric 3 */}
                <div className="floating-card floating-card-hover p-4.5 space-y-2">
                  <div className="flex items-center justify-between text-rose-700">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Human Escalations</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                      {metrics.escalateRate}%
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-extrabold text-rose-600 tracking-tight">{metrics.escalated}</span>
                    <span className="text-xs text-slate-400 font-medium">escalated</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-rose-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${metrics.escalateRate}%` }}></div>
                  </div>
                </div>

                {/* Metric 4 */}
                <div className="floating-card floating-card-hover p-4.5 space-y-2">
                  <div className="flex items-center justify-between text-indigo-700">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Confidence Mean</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                      &gt;70% Gate
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-extrabold text-indigo-600 tracking-tight">{metrics.avgConfidence}%</span>
                    <span className="text-xs text-slate-400 font-medium">precision</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${metrics.avgConfidence}%` }}></div>
                  </div>
                </div>
              </section>

              {/* Dual-Pane Layout: Left Feed + Right Inspector */}
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left: Inbound Feed & Filters (5 Cols) */}
                <div className="lg:col-span-5 space-y-3.5">
                  {/* Filter tabs */}
                  <div className="floating-card p-3.5 flex items-center justify-between">
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700">
                      <span>Feed Queue</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 text-[10px]">
                        {filteredResults.length}
                      </span>
                    </div>

                    <div className="flex p-0.5 bg-slate-100 rounded-xl text-xs font-bold">
                      <button
                        onClick={() => setActiveQueueFilter("all")}
                        className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                          activeQueueFilter === "all" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setActiveQueueFilter("auto")}
                        className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                          activeQueueFilter === "auto" ? "bg-white text-teal-700 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        Auto
                      </button>
                      <button
                        onClick={() => setActiveQueueFilter("escalate")}
                        className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                          activeQueueFilter === "escalate" ? "bg-white text-rose-700 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        Escalated
                      </button>
                    </div>
                  </div>

                  {/* Shimmer Skeleton Loaders during Processing */}
                  {processing && (
                    <div className="space-y-3">
                      {[1, 2].map(i => (
                        <div key={i} className="floating-card p-4 space-y-3">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-xl skeleton-shimmer shrink-0"></div>
                            <div className="space-y-1.5 flex-1">
                              <div className="h-3 w-28 rounded-md skeleton-shimmer"></div>
                              <div className="h-2.5 w-16 rounded-md skeleton-shimmer"></div>
                            </div>
                          </div>
                          <div className="h-3.5 w-full rounded-md skeleton-shimmer"></div>
                          <div className="h-3.5 w-4/5 rounded-md skeleton-shimmer"></div>
                          <div className="flex justify-between pt-1">
                            <div className="h-4 w-20 rounded-md skeleton-shimmer"></div>
                            <div className="h-4 w-16 rounded-md skeleton-shimmer"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ticket List */}
                  <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
                    {filteredResults.length === 0 && !processing ? (
                      <div className="floating-card p-12 text-center">
                        <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                          </svg>
                        </div>
                        <h4 className="text-sm font-bold text-slate-800">No Inbound Tickets</h4>
                        <p className="text-xs text-slate-400 mt-1 mb-4">Click below to start benchmark batch or use the simulator.</p>
                        <button
                          onClick={processStream}
                          className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-sm cursor-pointer"
                        >
                          Run Benchmark ({tweets.length})
                        </button>
                      </div>
                    ) : (
                      filteredResults.map(ticket => {
                        const isSelected = selectedTicket?.tweet_id === ticket.tweet_id;
                        const isEscalate = ticket.agent_result?.decision?.decision === "Escalate";
                        const sentiment = ticket.agent_result?.intent?.sentiment?.toLowerCase() || "neutral";

                        const sentimentTag = {
                          angry: { bg: "bg-rose-50 text-rose-700 border-rose-200", label: "Angry" },
                          negative: { bg: "bg-amber-50 text-amber-700 border-amber-200", label: "Negative" },
                          positive: { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Positive" },
                          neutral: { bg: "bg-slate-100 text-slate-600 border-slate-200", label: "Neutral" }
                        }[sentiment] || { bg: "bg-slate-100 text-slate-600 border-slate-200", label: "Neutral" };

                        return (
                          <div
                            key={ticket.tweet_id}
                            onClick={() => setSelectedTicketId(ticket.tweet_id)}
                            className={`p-4 cursor-pointer transition-all duration-200 ${
                              isSelected
                                ? "floating-card-selected"
                                : "floating-card floating-card-hover"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center space-x-2.5">
                                <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center text-xs font-extrabold text-slate-700">
                                  {ticket.author.slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <span className="text-xs font-bold text-slate-900">@{ticket.author}</span>
                                  <span className="text-[10px] text-slate-400 block">{ticket.timestamp}</span>
                                </div>
                              </div>
                              <div className="flex items-center space-x-1.5">
                                {ticket.isResolved && (
                                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                    ✓ Resolved
                                  </span>
                                )}
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${sentimentTag.bg}`}>
                                  {sentimentTag.label}
                                </span>
                              </div>
                            </div>

                            <p className="text-xs text-slate-700 line-clamp-2 mb-3 font-normal leading-relaxed">
                              &ldquo;{ticket.original_text}&rdquo;
                            </p>

                            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                              <span className="font-semibold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/60">
                                {ticket.agent_result?.intent?.intent}
                              </span>
                              <span className={`font-bold px-2 py-0.5 rounded-full ${
                                isEscalate
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : "bg-teal-50 text-teal-700 border border-teal-200"
                              }`}>
                                {isEscalate ? "🚨 Escalate" : "⚡ Auto-Handled"}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right: AI Resolution Inspector & Response Studio (7 Cols) */}
                <div className="lg:col-span-7">
                  {selectedTicket ? (
                    <div className="space-y-4">
                      {/* Ticket Header Card */}
                      <div className="floating-card p-5 space-y-3.5">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-teal-400 flex items-center justify-center font-bold text-white shadow-sm">
                              {selectedTicket.author.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-bold text-slate-900">@{selectedTicket.author}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                  {selectedTicket.channel}
                                </span>
                              </div>
                              <span className="text-[11px] text-slate-400 font-mono">ID: {selectedTicket.tweet_id} • {selectedTicket.timestamp}</span>
                            </div>
                          </div>

                          <button
                            onClick={() => toggleResolved(selectedTicket.tweet_id)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all border cursor-pointer ${
                              selectedTicket.isResolved
                                ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            {selectedTicket.isResolved ? "✓ Ticket Resolved" : "Mark as Resolved"}
                          </button>
                        </div>

                        {/* Message quotation */}
                        <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 text-xs sm:text-sm font-medium text-slate-800 leading-relaxed">
                          &ldquo;{selectedTicket.original_text}&rdquo;
                        </div>
                      </div>

                      {/* Visual Reasoning Pipeline Card */}
                      <div className="floating-card p-5 space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                            <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                            <span>Agent Decisioning Pipeline</span>
                          </span>
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                            Deterministic Guardrails
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* 1. Intent */}
                          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-slate-500 uppercase tracking-wider">1. Intent</span>
                              <span className="font-extrabold text-indigo-600">
                                {Math.round((selectedTicket.agent_result?.intent?.confidence || 0) * 100)}%
                              </span>
                            </div>
                            <div className="text-xs font-bold text-slate-900">
                              {selectedTicket.agent_result?.intent?.intent}
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-1 overflow-hidden mt-1">
                              <div className="bg-indigo-600 h-1 rounded-full" style={{ width: `${(selectedTicket.agent_result?.intent?.confidence || 0) * 100}%` }}></div>
                            </div>
                          </div>

                          {/* 2. Sentiment */}
                          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-slate-500 uppercase tracking-wider">2. Sentiment</span>
                              <span className="font-bold text-slate-800">{selectedTicket.agent_result?.intent?.sentiment}</span>
                            </div>
                            <div className="text-xs text-slate-600">
                              {selectedTicket.agent_result?.intent?.sentiment?.toLowerCase() === "angry"
                                ? "Critical negative tone (Policy: Human Escalation)"
                                : "Manageable tone (Policy: Autonomous Handling)"}
                            </div>
                          </div>
                        </div>

                        {/* 3. Decision Banner */}
                        <div className={`p-3.5 rounded-xl border flex items-start space-x-3 text-xs ${
                          selectedTicket.agent_result?.decision?.decision === "Escalate"
                            ? "bg-rose-50 border-rose-200 text-rose-900"
                            : "bg-teal-50 border-teal-200 text-teal-900"
                        }`}>
                          <span className="text-base mt-0.5">
                            {selectedTicket.agent_result?.decision?.decision === "Escalate" ? "🚨" : "⚡"}
                          </span>
                          <div>
                            <div className="font-bold">
                              {selectedTicket.agent_result?.decision?.decision === "Escalate"
                                ? "Escalated to Human Specialist Tier-2"
                                : "Autonomous Resolution Authorized"}
                            </div>
                            <div className="text-[11px] opacity-90 mt-0.5">
                              {selectedTicket.agent_result?.decision?.reason}
                            </div>
                          </div>
                        </div>

                        {/* 4. Grounded Context Citation */}
                        {selectedTicket.agent_result?.draft?.retrieved_context && (
                          <div className="p-3.5 rounded-xl bg-indigo-50/40 border border-indigo-100 text-[11px] text-slate-700 space-y-1">
                            <div className="font-bold text-indigo-950 flex items-center space-x-1.5">
                              <span>📚</span>
                              <span>Grounded Knowledge Base (FAQ):</span>
                            </div>
                            <p className="italic text-slate-600">
                              &ldquo;{selectedTicket.agent_result.draft.retrieved_context}&rdquo;
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Interactive Response Studio Card */}
                      <div className="floating-card p-5 space-y-3.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                            AI Response Studio
                          </span>

                          {/* Tone rewrite chips */}
                          <div className="flex items-center space-x-1 text-[11px]">
                            <span className="text-slate-400 mr-1">Tone:</span>
                            <button
                              onClick={() => applyTone(selectedTicket.tweet_id, "empathic")}
                              className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-semibold transition-all cursor-pointer"
                            >
                              ✨ Empathetic
                            </button>
                            <button
                              onClick={() => applyTone(selectedTicket.tweet_id, "concise")}
                              className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-semibold transition-all cursor-pointer"
                            >
                              ⚡ Concise
                            </button>
                            <button
                              onClick={() => applyTone(selectedTicket.tweet_id, "formal")}
                              className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-semibold transition-all cursor-pointer"
                            >
                              👔 Formal
                            </button>
                          </div>
                        </div>

                        <textarea
                          rows={4}
                          value={selectedTicket.editedDraft}
                          onChange={e => updateDraft(selectedTicket.tweet_id, e.target.value)}
                          placeholder="No automated response generated for this escalated ticket."
                          className="w-full p-3.5 text-xs sm:text-sm rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 leading-relaxed resize-none"
                        />

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <span className="text-[10px] font-mono text-slate-400">
                            {selectedTicket.editedDraft?.length || 0}/280 characters
                          </span>

                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => copyDraft(selectedTicket.tweet_id, selectedTicket.editedDraft || "")}
                              disabled={!selectedTicket.editedDraft}
                              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-2xs disabled:opacity-40 cursor-pointer"
                            >
                              {copiedId === selectedTicket.tweet_id ? "✓ Copied" : "Copy Reply"}
                            </button>

                            <button
                              onClick={() => toggleResolved(selectedTicket.tweet_id)}
                              className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] rounded-xl transition-all shadow-sm shadow-indigo-600/20 cursor-pointer"
                            >
                              {selectedTicket.isResolved ? "Reopen Ticket" : "Approve & Send Reply"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="floating-card p-16 text-center">
                      <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                        </svg>
                      </div>
                      <h3 className="text-sm font-bold text-slate-800">Select a Ticket from the Feed</h3>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">
                        Click any item in the left queue to view the full AI agent pipeline and response studio.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

          {/* VIEW 2: DYNAMIC DATA VISUALIZATION (CHARTS & ANALYTICS) */}
          {currentNav === "analytics" && (
            <div className="space-y-6 animate-fade-in">
              {/* Header Title */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Interactive Analytics & Intent Distribution</h2>
                  <p className="text-xs text-slate-500">Unwatermarked dynamic vector charts reflecting real-time triaged support tickets.</p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {metrics.total} Processed Samples
                </span>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Chart 1: Interactive SVG Donut Chart (7 Cols) */}
                <div className="lg:col-span-7 floating-card p-6 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Intent Categorization (Donut Chart)
                    </span>
                    <span className="text-[11px] text-slate-400">Hover slices to inspect</span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-around gap-6 pt-2">
                    {/* SVG Donut */}
                    <div className="relative w-52 h-52 shrink-0">
                      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                        {donutData.map((slice, idx) => {
                          // SVG circle strokeDasharray implementation
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
                              className="transition-all duration-200 cursor-pointer"
                            />
                          );
                        })}
                      </svg>

                      {/* Donut Center Info */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-2xl font-black text-slate-900 tracking-tight">
                          {hoveredIntent
                            ? donutData.find(d => d.name === hoveredIntent)?.percent + "%"
                            : metrics.total}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {hoveredIntent || "Total Tickets"}
                        </span>
                      </div>
                    </div>

                    {/* Interactive Legend */}
                    <div className="space-y-2.5 flex-1">
                      {donutData.map(item => (
                        <div
                          key={item.name}
                          onMouseEnter={() => setHoveredIntent(item.name)}
                          onMouseLeave={() => setHoveredIntent(null)}
                          className={`flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer ${
                            hoveredIntent === item.name ? "bg-slate-100/90 font-bold" : "hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <span className="w-3 h-3 rounded-md" style={{ backgroundColor: item.color }}></span>
                            <span className="text-xs text-slate-700">{item.name}</span>
                          </div>
                          <div className="flex items-center space-x-2 text-xs">
                            <span className="font-bold text-slate-900">{item.count}</span>
                            <span className="text-slate-400 text-[11px]">({item.percent}%)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Chart 2: Comparative Bar Chart (5 Cols) */}
                <div className="lg:col-span-5 floating-card p-6 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Triage Decision Rate
                    </span>
                    <span className="text-[11px] font-bold text-teal-700">{metrics.autoRate}% Autonomous</span>
                  </div>

                  <div className="space-y-5 pt-2">
                    {/* Auto-handled bar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700">⚡ Auto-Handled</span>
                        <span className="font-extrabold text-teal-600">{metrics.autoHandled} ({metrics.autoRate}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-xl h-4 overflow-hidden p-0.5">
                        <div
                          className="bg-gradient-to-r from-teal-500 to-emerald-400 h-full rounded-lg transition-all duration-700"
                          style={{ width: `${Math.max(metrics.autoRate, 5)}%` }}
                        ></div>
                      </div>
                      <span className="text-[10px] text-slate-400 block">Directly resolved via RAG context</span>
                    </div>

                    {/* Escalated bar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700">🚨 Escalated to Specialist</span>
                        <span className="font-extrabold text-rose-600">{metrics.escalated} ({metrics.escalateRate}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-xl h-4 overflow-hidden p-0.5">
                        <div
                          className="bg-gradient-to-r from-rose-500 to-amber-500 h-full rounded-lg transition-all duration-700"
                          style={{ width: `${Math.max(metrics.escalateRate, 5)}%` }}
                        ></div>
                      </div>
                      <span className="text-[10px] text-slate-400 block">Requires human intervention or low confidence</span>
                    </div>

                    {/* Sentiment Spectrum */}
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        Customer Sentiment Spectrum
                      </span>
                      <div className="grid grid-cols-4 gap-2 text-center text-xs">
                        <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100">
                          <span className="text-[10px] font-bold text-emerald-700 block">Positive</span>
                          <span className="font-extrabold text-emerald-900">{metrics.sentimentCounts.Positive || 0}</span>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-100 border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-600 block">Neutral</span>
                          <span className="font-extrabold text-slate-900">{metrics.sentimentCounts.Neutral || 0}</span>
                        </div>
                        <div className="p-2 rounded-xl bg-amber-50 border border-amber-100">
                          <span className="text-[10px] font-bold text-amber-700 block">Negative</span>
                          <span className="font-extrabold text-amber-900">{metrics.sentimentCounts.Negative || 0}</span>
                        </div>
                        <div className="p-2 rounded-xl bg-rose-50 border border-rose-100">
                          <span className="text-[10px] font-bold text-rose-700 block">Angry</span>
                          <span className="font-extrabold text-rose-900">{metrics.sentimentCounts.Angry || 0}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 3: SIMULATION STUDIO (COMPOSER & SANDBOX) */}
          {currentNav === "simulator" && (
            <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
              <div className="floating-card p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Interactive Simulation Studio</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Test the autonomous agent against custom customer scenarios, edge cases, and policy limits.
                  </p>
                </div>

                {/* Scenario Presets */}
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                    Quick Scenario Presets
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {presetExamples.map((preset, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setCustomAuthor(preset.author);
                          setCustomText(preset.text);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 text-xs font-semibold text-slate-700 border border-slate-200 transition-all cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Input Form */}
                <form onSubmit={handleCustomSubmit} className="space-y-4 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-xs font-bold text-slate-700 mb-1">Customer Handle</label>
                      <input
                        type="text"
                        value={customAuthor}
                        onChange={e => setCustomAuthor(e.target.value)}
                        placeholder="handle"
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700">Support Inquiry</label>
                        <span className="text-[11px] font-mono text-slate-400">{customText.length}/280</span>
                      </div>
                      <textarea
                        rows={3}
                        maxLength={280}
                        value={customText}
                        onChange={e => setCustomText(e.target.value)}
                        placeholder="Type customer message or select a preset..."
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium resize-none leading-relaxed"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={!customText.trim() || customLoading}
                      className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm shadow-indigo-600/30 cursor-pointer disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {customLoading ? (
                        <span>Simulating & Classifying...</span>
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

          {/* VIEW 4: KNOWLEDGE BASE (FAQ GROUNDING) */}
          {currentNav === "knowledge" && (
            <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
              <div className="floating-card p-6 space-y-4">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">RAG Knowledge Base & Grounding Context</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Verified grounding guidelines used by the autonomous agent to prevent hallucinations.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                    <span className="text-xs font-bold text-indigo-700">📦 Delivery Issue Policy</span>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      &ldquo;We apologize for the delay. Please check your tracking link. If it&apos;s been more than 48 hours past the expected date, we will issue a replacement or refund.&rdquo;
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                    <span className="text-xs font-bold text-teal-700">💸 Refund Request Policy</span>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      &ldquo;Refunds typically process within 3-5 business days. Please provide your order number via DM so we can process it immediately.&rdquo;
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                    <span className="text-xs font-bold text-sky-700">❓ Product Inquiry Guidelines</span>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      &ldquo;You can find detailed product specifications on the product page. If you have specific questions, let us know!&rdquo;
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                    <span className="text-xs font-bold text-rose-700">⚠️ Escalation Protocol for Complaints</span>
                    <p className="text-xs text-slate-600 leading-relaxed">
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
