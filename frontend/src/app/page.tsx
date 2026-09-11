"use client";

import { useEffect, useState, useMemo } from "react";

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
  original_text: string;
  timestamp?: string;
  isResolved?: boolean;
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

export default function Home() {
  const [tweets, setTweets] = useState<SampleTweet[]>([]);
  const [results, setResults] = useState<ProcessedTicket[]>([]);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "auto" | "escalate">("all");
  const [intentFilter, setIntentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [customAuthor, setCustomAuthor] = useState("support_seeker");
  const [customText, setCustomText] = useState("");
  const [customLoading, setCustomLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedContextId, setExpandedContextId] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [statusNotification, setStatusNotification] = useState<{ message: string; type: "info" | "success" | "warning" } | null>(null);

  // Helper to fetch API with fallback support
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

  // Load initial health and sample tweets
  useEffect(() => {
    fetchApi("/api/health")
      .then(data => setHealth(data))
      .catch(err => console.warn("Could not load backend health:", err));

    fetchApi("/api/tweets")
      .then(data => {
        if (Array.isArray(data)) setTweets(data);
      })
      .catch(err => console.error("Could not load tweets:", err));
  }, []);

  // Process a single tweet
  const processSingleTweet = async (tweet: { id: string; author: string; text: string }) => {
    const data = await fetchApi("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tweet_id: tweet.id, author: tweet.author, text: tweet.text })
    });

    if (data && data.agent_result) {
      const enriched: ProcessedTicket = {
        ...data,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        isResolved: false
      };
      setResults(prev => [enriched, ...prev]);
      return enriched;
    }
    return null;
  };

  // Process entire stream sequentially
  const processStream = async () => {
    if (processing || tweets.length === 0) return;
    setProcessing(true);
    setStatusNotification({ message: `Streaming & evaluating ${tweets.length} inbound tickets...`, type: "info" });
    
    for (const tweet of tweets) {
      try {
        await processSingleTweet(tweet);
        await new Promise(r => setTimeout(r, 600));
      } catch (err) {
        console.error("Error processing tweet ID:", tweet.id, err);
      }
    }
    
    setProcessing(false);
    setStatusNotification({ message: `Processed ${tweets.length} benchmark tickets successfully.`, type: "success" });
    setTimeout(() => setStatusNotification(null), 4000);
  };

  // Process single custom tweet
  const handleCustomSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customText.trim() || customLoading) return;
    setCustomLoading(true);
    try {
      await processSingleTweet({
        id: "cust-" + Date.now().toString().slice(-4),
        author: customAuthor.trim() || "anonymous",
        text: customText.trim()
      });
      setCustomText("");
      setStatusNotification({ message: "Inbound ticket classified & triaged!", type: "success" });
      setTimeout(() => setStatusNotification(null), 3500);
    } catch (err) {
      console.error("Failed to process custom tweet:", err);
      setStatusNotification({ message: "Failed to process ticket. Check backend connection.", type: "warning" });
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
    return {
      total,
      autoHandled,
      escalated,
      resolved,
      autoRate: total > 0 ? Math.round((autoHandled / total) * 100) : 0,
      escalateRate: total > 0 ? Math.round((escalated / total) * 100) : 0,
      avgConfidence: avgConfidence.toFixed(0)
    };
  }, [results]);

  // Unique intents present in processed results
  const availableIntents = useMemo(() => {
    const intents = new Set<string>();
    results.forEach(r => {
      if (r.agent_result?.intent?.intent) intents.add(r.agent_result.intent.intent);
    });
    return Array.from(intents);
  }, [results]);

  // Filtered tickets
  const filteredResults = useMemo(() => {
    return results.filter(r => {
      // Tab filter
      if (activeTab === "auto" && r.agent_result?.decision?.decision !== "Auto-handle") return false;
      if (activeTab === "escalate" && r.agent_result?.decision?.decision !== "Escalate") return false;
      
      // Intent filter
      if (intentFilter !== "all" && r.agent_result?.intent?.intent !== intentFilter) return false;

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesText = r.original_text.toLowerCase().includes(query);
        const matchesAuthor = r.author.toLowerCase().includes(query);
        const matchesIntent = r.agent_result?.intent?.intent.toLowerCase().includes(query);
        return matchesText || matchesAuthor || matchesIntent;
      }

      return true;
    });
  }, [results, activeTab, intentFilter, searchQuery]);

  const presetExamples = [
    { label: "📦 Overdue Package", author: "alex_travels", text: "@AmazonHelp My package is 3 days late and I need it for a birthday party tomorrow! What is going on???" },
    { label: "💸 Refund Demand", author: "maria_k", text: "@AmazonHelp WORST SERVICE EVER. YOU LOST MY ORDER AND REFUSE TO REFUND ME." },
    { label: "🔄 Return Request", author: "sammy_reads", text: "@AmazonHelp how do I return a kindle that won't turn on?" },
    { label: "🌐 Global Shipping", author: "liam_nz", text: "@AmazonHelp Do you guys ship to New Zealand with expedited delivery?" },
    { label: "📺 Streaming Glitch", author: "clara_stream", text: "@AmazonHelp My prime video is buffering constantly on my smart TV." },
    { label: "📦 Wrong Item", author: "jordan_b", text: "@AmazonHelp I received the wrong item. Ordered a book, got a toaster." },
    { label: "⭐ Positive Feedback", author: "emma_w", text: "@AmazonHelp Thanks for resolving my issue so quickly! Appreciate it." }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24 selection:bg-indigo-500 selection:text-white bg-grid-pattern">
      {/* Top Navigation Bar */}
      <nav className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-500/20 ring-4 ring-indigo-50">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-indigo-950 to-indigo-800 bg-clip-text text-transparent">
                  ResolveAI
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Agentic RAG Hub
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">Autonomous Customer Support Triaging & Resolution</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Engine Status Pill */}
            <div className="hidden lg:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs">
              <span className={`w-2 h-2 rounded-full ${health?.gemini_configured ? "bg-emerald-500 animate-pulse ring-2 ring-emerald-200" : "bg-emerald-500"}`}></span>
              <span className="text-slate-500 font-medium">Engine:</span>
              <span className="font-semibold text-slate-800">{health?.model || "Connecting..."}</span>
            </div>

            {/* Run Batch Stream Button */}
            <button
              id="start-stream-btn"
              onClick={processStream}
              disabled={processing || tweets.length === 0}
              className="inline-flex items-center px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 transition-all duration-200 shadow-sm shadow-indigo-600/30 cursor-pointer disabled:cursor-not-allowed"
            >
              {processing ? (
                <>
                  <svg className="animate-spin -ml-0.5 mr-2 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  Processing Batch ({results.length}/{tweets.length})...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Run Benchmark ({tweets.length})
                </>
              )}
            </button>

            {/* Export Logs */}
            {results.length > 0 && (
              <button
                id="export-results-btn"
                onClick={exportResults}
                className="px-3 py-2 text-xs font-semibold text-slate-700 hover:text-indigo-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors shadow-xs"
                title="Export Processed Audit Report"
              >
                Export JSON
              </button>
            )}

            {/* Clear Button */}
            {results.length > 0 && (
              <button
                id="clear-results-btn"
                onClick={() => setResults([])}
                className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-xl transition-colors shadow-xs"
                title="Clear Ticket Feed"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {/* Floating Notification Toast */}
        {statusNotification && (
          <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-md animate-slide-down ${
            statusNotification.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-900" :
            statusNotification.type === "warning" ? "bg-amber-50 border-amber-200 text-amber-900" :
            "bg-indigo-50 border-indigo-200 text-indigo-900"
          }`}>
            <div className="flex items-center space-x-2.5">
              <span className={`w-2.5 h-2.5 rounded-full ${
                statusNotification.type === "success" ? "bg-emerald-500" :
                statusNotification.type === "warning" ? "bg-amber-500" :
                "bg-indigo-500"
              }`}></span>
              <span className="text-xs font-medium">{statusNotification.message}</span>
            </div>
            <button
              onClick={() => setStatusNotification(null)}
              className="text-slate-400 hover:text-slate-700 text-sm font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Dynamic Analytics KPI Strip */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Tickets */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Processed Tickets</span>
              <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </span>
            </div>
            <div className="mt-3 flex items-baseline space-x-2">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{metrics.total}</span>
              <span className="text-xs text-slate-500">inbound</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              {metrics.resolved > 0 ? `${metrics.resolved} marked resolved` : "Live stream monitor"}
            </div>
          </div>

          {/* Autonomous Resolution Rate */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Auto-Handled</span>
              <span className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-emerald-600 tracking-tight">{metrics.autoHandled}</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {metrics.autoRate}%
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-3 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${metrics.autoRate}%` }}></div>
            </div>
          </div>

          {/* Human Escalations */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Specialist Escalations</span>
              <span className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-rose-600 tracking-tight">{metrics.escalated}</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                {metrics.escalateRate}%
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-3 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-rose-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${metrics.escalateRate}%` }}></div>
            </div>
          </div>

          {/* Average Confidence */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">Mean Confidence</span>
              <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-indigo-600 tracking-tight">{metrics.avgConfidence}%</span>
              <span className="text-xs text-slate-500 font-medium">Grounding threshold &gt;70%</span>
            </div>
            {/* Progress bar */}
            <div className="mt-3 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${metrics.avgConfidence}%` }}></div>
            </div>
          </div>
        </section>

        {/* Live Simulation & Composer Studio */}
        <section className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-5 gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  Simulate & Triage Inbound Customer Inquiries
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Type any message or pick a pre-configured scenario to evaluate classification, intent, sentiment, decisioning, and grounded responses.
              </p>
            </div>

            {/* Quick Scenario Preset Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-400 mr-1">Presets:</span>
              {presetExamples.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setCustomText(preset.text);
                    setCustomAuthor(preset.author);
                  }}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-200/80 hover:border-indigo-200 transition-all cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleCustomSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* Handle input */}
              <div className="md:col-span-1">
                <label htmlFor="custom-author-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Customer Handle
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 font-semibold text-xs">@</span>
                  <input
                    id="custom-author-input"
                    type="text"
                    value={customAuthor}
                    onChange={e => setCustomAuthor(e.target.value)}
                    placeholder="username"
                    className="w-full pl-7 pr-3 py-2.5 text-xs font-medium rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              {/* Tweet message input */}
              <div className="md:col-span-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="custom-tweet-input" className="block text-xs font-semibold text-slate-700">
                    Inbound Tweet or Support Message
                  </label>
                  <span className={`text-[11px] font-medium ${customText.length > 250 ? "text-amber-600" : "text-slate-400"}`}>
                    {customText.length}/280
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    id="custom-tweet-input"
                    type="text"
                    maxLength={280}
                    value={customText}
                    onChange={e => setCustomText(e.target.value)}
                    placeholder="e.g. @AmazonHelp My package is 4 days late and nobody is updating tracking!"
                    className="flex-1 px-3.5 py-2.5 text-xs font-medium rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                  <button
                    id="analyze-custom-btn"
                    type="submit"
                    disabled={!customText.trim() || customLoading}
                    className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-40 rounded-xl transition-all shadow-sm shadow-indigo-600/30 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap flex items-center space-x-1.5"
                  >
                    {customLoading ? (
                      <>
                        <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                        </svg>
                        <span>Triaging...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span>Triage & Resolve</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </section>

        {/* Inbound Benchmark Queue Drawer (When benchmark tweets available) */}
        {tweets.length > 0 && results.length < tweets.length && (
          <section className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                <h3 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                  Raw Test Queue ({tweets.length - results.filter(r => tweets.some(t => t.id === r.tweet_id)).length} unanalyzed)
                </h3>
              </div>
              <span className="text-[11px] text-indigo-700 font-medium">Click any card to analyze individually:</span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {tweets
                .filter(t => !results.some(r => r.tweet_id === t.id))
                .slice(0, 6)
                .map(tweet => (
                  <div
                    key={tweet.id}
                    onClick={() => processSingleTweet(tweet)}
                    className="p-3 rounded-xl bg-white border border-indigo-100/80 hover:border-indigo-300 hover:shadow-xs cursor-pointer transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold text-slate-800">@{tweet.author}</span>
                        <span className="text-[10px] text-indigo-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                          Analyze →
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2">{tweet.text}</p>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Live Stream & Feed View */}
        <section className="space-y-4">
          {/* Filter Bar & Controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            {/* Tab Filters */}
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0">
              <button
                id="tab-all"
                onClick={() => setActiveTab("all")}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  activeTab === "all"
                    ? "bg-indigo-600 text-white shadow-xs shadow-indigo-600/30"
                    : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200"
                }`}
              >
                All Feed ({results.length})
              </button>
              <button
                id="tab-auto"
                onClick={() => setActiveTab("auto")}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  activeTab === "auto"
                    ? "bg-emerald-600 text-white shadow-xs shadow-emerald-600/30"
                    : "bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200"
                }`}
              >
                ⚡ Auto-Handled ({metrics.autoHandled})
              </button>
              <button
                id="tab-escalate"
                onClick={() => setActiveTab("escalate")}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  activeTab === "escalate"
                    ? "bg-rose-600 text-white shadow-xs shadow-rose-600/30"
                    : "bg-white text-rose-700 hover:bg-rose-50 border border-rose-200"
                }`}
              >
                🚨 Escalations ({metrics.escalated})
              </button>
            </div>

            {/* Search & Intent Dropdown */}
            <div className="flex items-center space-x-2">
              {availableIntents.length > 0 && (
                <select
                  value={intentFilter}
                  onChange={e => setIntentFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-xl bg-white border border-slate-200 text-slate-700 focus:outline-none focus:border-indigo-500 shadow-xs"
                >
                  <option value="all">All Intents</option>
                  {availableIntents.map(intent => (
                    <option key={intent} value={intent}>{intent}</option>
                  ))}
                </select>
              )}

              <div className="relative">
                <span className="absolute inset-y-0 left-2.5 flex items-center text-slate-400">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search tickets..."
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-900 focus:outline-none focus:border-indigo-500 shadow-xs w-44 sm:w-56"
                />
              </div>
            </div>
          </div>

          {/* Empty State */}
          {results.length === 0 && !processing && (
            <div className="text-center py-16 px-4 rounded-3xl border border-dashed border-slate-200 bg-white shadow-xs">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 ring-8 ring-indigo-50/50">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-900">No Tickets Triaged Yet</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5 mb-6">
                Trigger the pre-loaded benchmark batch to stream real customer tweets, or craft your own scenario in the composer above.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  id="empty-state-run-btn"
                  onClick={processStream}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-sm shadow-indigo-600/30 cursor-pointer"
                >
                  Run Benchmark Batch ({tweets.length} Tickets)
                </button>
              </div>
            </div>
          )}

          {/* Tickets Stream Cards */}
          <div className="space-y-3.5">
            {filteredResults.map((ticket, idx) => {
              const intent = ticket?.agent_result?.intent;
              const decision = ticket?.agent_result?.decision;
              const draft = ticket?.agent_result?.draft;
              const isEscalated = decision?.decision === "Escalate";
              const isContextExpanded = expandedContextId === ticket.tweet_id;

              // Sentiment tag styling (light colors)
              const sentiment = intent?.sentiment?.toLowerCase() || "neutral";
              const sentimentConfig = {
                angry: { bg: "bg-rose-50 text-rose-700 border-rose-200", icon: "😡" },
                negative: { bg: "bg-amber-50 text-amber-700 border-amber-200", icon: "⚠️" },
                positive: { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "✨" },
                neutral: { bg: "bg-slate-100 text-slate-700 border-slate-200", icon: "💬" }
              }[sentiment] || { bg: "bg-slate-100 text-slate-700 border-slate-200", icon: "💬" };

              return (
                <div
                  key={ticket.tweet_id || idx}
                  className={`rounded-2xl bg-white border transition-all duration-200 shadow-xs hover:shadow-md ${
                    ticket.isResolved
                      ? "border-emerald-200 bg-emerald-50/10"
                      : isEscalated
                      ? "border-rose-200/90"
                      : "border-slate-200/90"
                  }`}
                >
                  {/* Card Header Bar */}
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
                      {/* Customer Author Info */}
                      <div className="flex items-center space-x-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shadow-xs ${
                          isEscalated 
                            ? "bg-gradient-to-br from-rose-500 to-amber-500 text-white" 
                            : "bg-gradient-to-br from-indigo-600 to-sky-500 text-white"
                        }`}>
                          {ticket.author.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-slate-900">@{ticket.author}</span>
                            <span className="text-[10px] text-slate-400">•</span>
                            <span className="text-[11px] text-slate-400">{ticket.timestamp || "Just now"}</span>
                            {ticket.isResolved && (
                              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                ✓ Resolved
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-1.5 mt-0.5">
                            <span className="text-[10px] font-medium text-slate-400">ID:</span>
                            <span className="text-[10px] font-mono text-slate-500">{ticket.tweet_id}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right Tag Badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Sentiment badge */}
                        <span className={`px-2.5 py-1 text-[11px] font-semibold rounded-full border flex items-center space-x-1 ${sentimentConfig.bg}`}>
                          <span>{sentimentConfig.icon}</span>
                          <span className="capitalize">{intent?.sentiment || "Neutral"}</span>
                        </span>

                        {/* Intent Classification badge */}
                        <div className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-1 text-[11px] font-semibold text-indigo-900 space-x-1.5">
                          <span>{intent?.intent || "Unclassified"}</span>
                          <span className="px-1.5 py-0.2 rounded-full bg-indigo-200/60 text-indigo-950 font-bold text-[10px]">
                            {Math.round((intent?.confidence || 0) * 100)}%
                          </span>
                        </div>

                        {/* Triage Decision Badge */}
                        <span className={`px-3 py-1 text-[11px] font-bold rounded-full border ${
                          isEscalated
                            ? "bg-rose-50 text-rose-700 border-rose-200 shadow-xs"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200 shadow-xs"
                        }`}>
                          {isEscalated ? "🚨 Escalate" : "⚡ Auto-handle"}
                        </span>
                      </div>
                    </div>

                    {/* Inbound Customer Tweet Message */}
                    <div className="py-3.5">
                      <p className="text-xs sm:text-sm text-slate-800 font-medium leading-relaxed">
                        &ldquo;{ticket.original_text}&rdquo;
                      </p>
                    </div>

                    {/* Agent Triage Banner */}
                    <div className={`p-3 rounded-xl mb-3 flex items-start space-x-2.5 text-xs ${
                      isEscalated
                        ? "bg-rose-50/70 border border-rose-100 text-rose-900"
                        : "bg-emerald-50/70 border border-emerald-100 text-emerald-900"
                    }`}>
                      <span className="text-sm mt-0.5">
                        {isEscalated ? "⚠️" : "🤖"}
                      </span>
                      <div className="flex-1">
                        <span className="font-bold">
                          {isEscalated ? "Escalation Flagged: " : "Autonomous Handling Approved: "}
                        </span>
                        <span className="opacity-90">{decision?.reason}</span>
                      </div>
                    </div>

                    {/* Grounded Draft Response (If Auto-handled) */}
                    {draft && (
                      <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-4 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                            <span className="text-[11px] font-bold text-indigo-950 uppercase tracking-wider">
                              Grounded AI Reply (FAQ Grounded)
                            </span>
                          </div>

                          <div className="flex items-center space-x-2">
                            {/* Toggle FAQ Context Accordion */}
                            {draft.retrieved_context && (
                              <button
                                onClick={() => setExpandedContextId(isContextExpanded ? null : ticket.tweet_id)}
                                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                              >
                                {isContextExpanded ? "Hide Context ▲" : "View FAQ Source ▼"}
                              </button>
                            )}

                            {/* Copy Draft Button */}
                            <button
                              onClick={() => copyDraft(ticket.tweet_id, draft.drafted_response)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-indigo-700 bg-white hover:bg-indigo-100/50 border border-indigo-200 transition-all shadow-2xs flex items-center space-x-1"
                            >
                              {copiedId === ticket.tweet_id ? (
                                <>
                                  <span>✓</span>
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                  <span>Copy Reply</span>
                                </>
                              )}
                            </button>

                            {/* Mark as Sent/Resolved */}
                            <button
                              onClick={() => toggleResolved(ticket.tweet_id)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border shadow-2xs ${
                                ticket.isResolved
                                  ? "bg-slate-100 text-slate-600 border-slate-200"
                                  : "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent"
                              }`}
                            >
                              {ticket.isResolved ? "Mark Open" : "Send & Resolve"}
                            </button>
                          </div>
                        </div>

                        {/* Quoted AI message */}
                        <div className="p-3 rounded-lg bg-white border border-indigo-100 text-xs text-slate-800 font-medium leading-relaxed shadow-2xs">
                          {draft.drafted_response}
                        </div>

                        {/* Collapsible Grounded FAQ Source Context */}
                        {isContextExpanded && draft.retrieved_context && (
                          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 animate-slide-down">
                            <span className="font-bold text-slate-700 block mb-1">Retrieved Knowledge Base Grounding:</span>
                            <span className="italic">{draft.retrieved_context}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Escalate Actions (If Escalated) */}
                    {isEscalated && (
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-rose-700 font-medium">
                          ⚡ Ticket assigned to Tier-2 Support Queue with sentiment priority.
                        </span>
                        <button
                          onClick={() => toggleResolved(ticket.tweet_id)}
                          className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all border shadow-2xs ${
                            ticket.isResolved
                              ? "bg-slate-100 text-slate-600 border-slate-200"
                              : "bg-rose-600 hover:bg-rose-700 text-white border-transparent"
                          }`}
                        >
                          {ticket.isResolved ? "Reopen Escalation" : "Acknowledge Escalation"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
