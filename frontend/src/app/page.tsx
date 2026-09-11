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

export default function Home() {
  const [tweets, setTweets] = useState<SampleTweet[]>([]);
  const [results, setResults] = useState<ProcessedTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [liveStreamActive, setLiveStreamActive] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "auto" | "escalate">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [customAuthor, setCustomAuthor] = useState("support_seeker");
  const [customText, setCustomText] = useState("");
  const [customLoading, setCustomLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [statusNotification, setStatusNotification] = useState<{ message: string; type: "info" | "success" | "warning" } | null>(null);

  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to fetch API with proxy fallback
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
      const isUrgent = data.agent_result?.intent?.sentiment?.toLowerCase() === "angry";
      const enriched: ProcessedTicket = {
        ...data,
        channel: "Twitter / @AmazonHelp",
        priority: isUrgent ? "Urgent" : data.agent_result?.decision?.decision === "Escalate" ? "High" : "Normal",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        isResolved: false,
        editedDraft: data.agent_result?.draft?.drafted_response || ""
      };

      setResults(prev => {
        const next = [enriched, ...prev];
        return next;
      });

      setSelectedTicketId(prev => prev ?? enriched.tweet_id);
      return enriched;
    }
    return null;
  };

  // Run full benchmark batch
  const processStream = async () => {
    if (processing || tweets.length === 0) return;
    setProcessing(true);
    setStatusNotification({ message: `Triaging benchmark batch of ${tweets.length} inbound tickets...`, type: "info" });
    
    for (const tweet of tweets) {
      try {
        await processSingleTweet(tweet);
        await new Promise(r => setTimeout(r, 450));
      } catch (err) {
        console.error("Error processing tweet:", err);
      }
    }
    
    setProcessing(false);
    setStatusNotification({ message: `Successfully triaged ${tweets.length} benchmark tickets.`, type: "success" });
    setTimeout(() => setStatusNotification(null), 3500);
  };

  // Live stream simulator toggle
  useEffect(() => {
    if (liveStreamActive) {
      const simulatedScenarios = [
        { author: "shopper_claire", text: "@AmazonHelp My Prime parcel was marked delivered, but it is nowhere to be found outside!" },
        { author: "alex_gamer", text: "@AmazonHelp The kindle gift card I purchased won't apply to my account. Error code 403." },
        { author: "marcus_v", text: "@AmazonHelp Horrible customer service! Second time you guys cancel my order without reason!" },
        { author: "rachel_b", text: "@AmazonHelp Do you offer courier pickup for returned electronics in Chicago?" },
        { author: "dev_dave", text: "@AmazonHelp Quick shoutout for replacing my defective monitor in 24 hours. Incredible speed!" }
      ];

      streamIntervalRef.current = setInterval(async () => {
        const scenario = simulatedScenarios[Math.floor(Math.random() * simulatedScenarios.length)];
        await processSingleTweet({
          id: "stream-" + Date.now().toString().slice(-4),
          author: scenario.author,
          text: scenario.text
        });
      }, 5500);
    } else {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    }

    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, [liveStreamActive]);

  // Process custom tweet
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
      if (ticket) setSelectedTicketId(ticket.tweet_id);
      setCustomText("");
      setStatusNotification({ message: "Inbound ticket classified and resolved!", type: "success" });
      setTimeout(() => setStatusNotification(null), 3000);
    } catch (err) {
      console.error("Failed to process custom ticket:", err);
      setStatusNotification({ message: "Error contacting backend.", type: "warning" });
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
      transformed = `We completely understand your frustration and are truly sorry for the inconvenience caused! ${base} We're right here to make this right for you.`;
    } else if (tone === "concise") {
      transformed = base.replace("We apologize for the delay. ", "").replace("Please DM us your order number so we can make this right.", "DM us your order ID for immediate resolution.");
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

  // Metrics
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

  // Filtered tickets
  const filteredResults = useMemo(() => {
    return results.filter(r => {
      if (activeTab === "auto" && r.agent_result?.decision?.decision !== "Auto-handle") return false;
      if (activeTab === "escalate" && r.agent_result?.decision?.decision !== "Escalate") return false;

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
  }, [results, activeTab, searchQuery]);

  // Selected ticket
  const selectedTicket = useMemo(() => {
    return results.find(r => r.tweet_id === selectedTicketId) || results[0] || null;
  }, [results, selectedTicketId]);

  const presetExamples = [
    { label: "📦 Overdue Package", author: "alex_travels", text: "@AmazonHelp My package is 3 days late and I need it for a birthday party tomorrow! What is going on???" },
    { label: "💸 Refund Demand", author: "maria_k", text: "@AmazonHelp WORST SERVICE EVER. YOU LOST MY ORDER AND REFUSE TO REFUND ME." },
    { label: "🔄 Return Kindle", author: "sammy_reads", text: "@AmazonHelp how do I return a kindle that won't turn on?" },
    { label: "🌐 Global Shipping", author: "liam_nz", text: "@AmazonHelp Do you guys ship to New Zealand with expedited delivery?" },
    { label: "📺 Video Glitch", author: "clara_stream", text: "@AmazonHelp My prime video is buffering constantly on my smart TV." }
  ];

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 font-sans pb-16 selection:bg-indigo-500 selection:text-white">
      {/* Top Cockpit Navigation Bar */}
      <nav className="border-b border-zinc-200/80 bg-white/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            {/* Logo Mark */}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-500 flex items-center justify-center font-black text-white shadow-sm shadow-indigo-500/30 ring-1 ring-indigo-500/20">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-base font-extrabold tracking-tight text-zinc-950">
                  ResolveAI
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-md bg-zinc-100 text-zinc-600 border border-zinc-200/80">
                  Cockpit v2.4
                </span>
              </div>
              <div className="flex items-center space-x-2 text-[11px] text-zinc-500">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 ring-2 ring-emerald-100"></span>
                <span>All systems operational</span>
                <span>•</span>
                <span className="font-mono text-[10px] text-zinc-400">latency: 24ms</span>
              </div>
            </div>
          </div>

          {/* Right Nav Actions */}
          <div className="flex items-center space-x-2.5">
            {/* Live Stream Simulator Switch */}
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-zinc-50 border border-zinc-200">
              <button
                type="button"
                onClick={() => setLiveStreamActive(!liveStreamActive)}
                className={`w-7 h-4 rounded-full transition-colors relative cursor-pointer ${
                  liveStreamActive ? "bg-emerald-500" : "bg-zinc-300"
                }`}
              >
                <span
                  className={`block w-3 h-3 rounded-full bg-white transition-transform transform shadow-xs ${
                    liveStreamActive ? "translate-x-3.5" : "translate-x-0.5"
                  }`}
                />
              </button>
              <span className="text-xs font-semibold text-zinc-700 select-none">
                {liveStreamActive ? (
                  <span className="flex items-center space-x-1.5 text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>Live Stream Active</span>
                  </span>
                ) : (
                  "Live Stream Mode"
                )}
              </span>
            </div>

            {/* Run Benchmark Batch Button */}
            <button
              id="start-stream-btn"
              onClick={processStream}
              disabled={processing || tweets.length === 0}
              className="inline-flex items-center px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed"
            >
              {processing ? (
                <>
                  <svg className="animate-spin -ml-0.5 mr-1.5 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Triaging Batch...</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  </svg>
                  <span>Benchmark Queue ({tweets.length})</span>
                </>
              )}
            </button>

            {/* Export Report */}
            {results.length > 0 && (
              <button
                onClick={exportResults}
                className="px-3 py-1.5 text-xs font-medium text-zinc-700 hover:text-zinc-950 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors shadow-2xs"
                title="Export JSON Audit Log"
              >
                Export JSON
              </button>
            )}

            {/* Clear Button */}
            {results.length > 0 && (
              <button
                onClick={() => {
                  setResults([]);
                  setSelectedTicketId(null);
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                title="Clear Tickets"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Floating Notification */}
        {statusNotification && (
          <div className="p-3.5 rounded-xl border border-zinc-200 bg-white shadow-md flex items-center justify-between">
            <div className="flex items-center space-x-2.5 text-xs font-medium text-zinc-800">
              <span className={`w-2 h-2 rounded-full ${
                statusNotification.type === "success" ? "bg-emerald-500" :
                statusNotification.type === "warning" ? "bg-amber-500" :
                "bg-indigo-500"
              }`}></span>
              <span>{statusNotification.message}</span>
            </div>
            <button onClick={() => setStatusNotification(null)} className="text-zinc-400 hover:text-zinc-700 text-xs font-bold">✕</button>
          </div>
        )}

        {/* Dynamic KPI Ribbon */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Total Ingested */}
          <div className="p-4 rounded-2xl bg-white border border-zinc-200/90 shadow-2xs">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-[11px] font-bold uppercase tracking-wider">Inbound Volume</span>
              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200/60">
                +100% live
              </span>
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className="text-2xl font-black text-zinc-950 tracking-tight">{metrics.total}</span>
              <span className="text-xs text-zinc-400">tickets</span>
            </div>
            <div className="mt-2 text-[11px] text-zinc-500">
              {metrics.resolved} resolved ({metrics.total > 0 ? Math.round((metrics.resolved / metrics.total) * 100) : 0}%)
            </div>
          </div>

          {/* Autonomous Rate */}
          <div className="p-4 rounded-2xl bg-white border border-zinc-200/90 shadow-2xs">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Auto-Resolution</span>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200">
                Target &gt;70%
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-emerald-600 tracking-tight">{metrics.autoRate}%</span>
              <span className="text-xs text-zinc-500">{metrics.autoHandled} handled</span>
            </div>
            <div className="mt-2.5 w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${metrics.autoRate}%` }}></div>
            </div>
          </div>

          {/* Human Escalations */}
          <div className="p-4 rounded-2xl bg-white border border-zinc-200/90 shadow-2xs">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Escalated to Agent</span>
              <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded-md border border-rose-200">
                Safety Guard
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-rose-600 tracking-tight">{metrics.escalateRate}%</span>
              <span className="text-xs text-zinc-500">{metrics.escalated} tickets</span>
            </div>
            <div className="mt-2.5 w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-rose-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${metrics.escalateRate}%` }}></div>
            </div>
          </div>

          {/* Mean Intent Confidence */}
          <div className="p-4 rounded-2xl bg-white border border-zinc-200/90 shadow-2xs">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Intent Precision</span>
              <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-200">
                RAG Grounded
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-indigo-600 tracking-tight">{metrics.avgConfidence}%</span>
              <span className="text-xs text-zinc-500">avg accuracy</span>
            </div>
            <div className="mt-2.5 w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${metrics.avgConfidence}%` }}></div>
            </div>
          </div>
        </section>

        {/* Dual-Pane Command Center Layout */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Ticket Ingestion & Queue (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            {/* Live Queue Filter & Controls Card */}
            <div className="p-4 rounded-2xl bg-white border border-zinc-200/90 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-700">Inbound Queue</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-zinc-100 text-zinc-600 text-[11px] font-bold">
                    {filteredResults.length}
                  </span>
                </div>

                {/* Segmented Filter Pills */}
                <div className="flex p-0.5 bg-zinc-100 rounded-lg text-xs font-semibold">
                  <button
                    onClick={() => setActiveTab("all")}
                    className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                      activeTab === "all" ? "bg-white text-zinc-950 shadow-2xs" : "text-zinc-500 hover:text-zinc-900"
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setActiveTab("auto")}
                    className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                      activeTab === "auto" ? "bg-white text-emerald-700 shadow-2xs" : "text-zinc-500 hover:text-zinc-900"
                    }`}
                  >
                    Auto
                  </button>
                  <button
                    onClick={() => setActiveTab("escalate")}
                    className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                      activeTab === "escalate" ? "bg-white text-rose-700 shadow-2xs" : "text-zinc-500 hover:text-zinc-900"
                    }`}
                  >
                    Escalate
                  </button>
                </div>
              </div>

              {/* Search input */}
              <div className="relative">
                <span className="absolute inset-y-0 left-2.5 flex items-center text-zinc-400">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Filter by customer or intent..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Inbound Ticket Stream List */}
            <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-1">
              {filteredResults.length === 0 ? (
                <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-zinc-200 bg-white">
                  <div className="w-10 h-10 mx-auto rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-bold text-zinc-800">Queue is empty</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Start the benchmark queue or simulate an inbound ticket below.</p>
                </div>
              ) : (
                filteredResults.map(ticket => {
                  const isSelected = (selectedTicket?.tweet_id === ticket.tweet_id);
                  const isEscalate = ticket.agent_result?.decision?.decision === "Escalate";
                  const sentiment = ticket.agent_result?.intent?.sentiment?.toLowerCase() || "neutral";

                  const sentimentDot = {
                    angry: "bg-rose-500 ring-rose-200",
                    negative: "bg-amber-500 ring-amber-200",
                    positive: "bg-emerald-500 ring-emerald-200",
                    neutral: "bg-zinc-400 ring-zinc-200"
                  }[sentiment] || "bg-zinc-400 ring-zinc-200";

                  return (
                    <div
                      key={ticket.tweet_id}
                      onClick={() => setSelectedTicketId(ticket.tweet_id)}
                      className={`p-3.5 rounded-2xl cursor-pointer transition-all duration-150 relative ${
                        isSelected
                          ? "bg-white border-2 border-indigo-600 shadow-sm"
                          : "bg-white border border-zinc-200/90 hover:border-zinc-300 shadow-2xs hover:shadow-xs"
                      }`}
                    >
                      {/* Priority indicator bar */}
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center space-x-2">
                          <span className={`w-2 h-2 rounded-full ring-2 ${sentimentDot}`}></span>
                          <span className="text-xs font-bold text-zinc-900">@{ticket.author}</span>
                          <span className="text-[10px] text-zinc-400 font-mono">#{ticket.tweet_id}</span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-[10px] text-zinc-400">{ticket.timestamp}</span>
                          {ticket.isResolved && (
                            <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px] font-bold" title="Resolved">
                              ✓
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Snippet */}
                      <p className="text-xs text-zinc-700 line-clamp-2 mb-2 font-normal">
                        {ticket.original_text}
                      </p>

                      {/* Badges footer */}
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 font-semibold border border-zinc-200/60">
                          {ticket.agent_result?.intent?.intent || "General"}
                        </span>

                        <span className={`font-bold px-2 py-0.5 rounded-md ${
                          isEscalate
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        }`}>
                          {isEscalate ? "🚨 Escalate" : "⚡ Auto"}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Quick Inbound Composer Drawer */}
            <div className="p-4 rounded-2xl bg-white border border-zinc-200/90 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-700">Simulate Inbound Message</span>
                <span className="text-[10px] font-mono text-zinc-400">{customText.length}/280</span>
              </div>

              {/* Preset chips */}
              <div className="flex flex-wrap gap-1.5">
                {presetExamples.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setCustomText(preset.text);
                      setCustomAuthor(preset.author);
                    }}
                    className="px-2 py-0.5 text-[10px] font-medium rounded-lg bg-zinc-50 hover:bg-indigo-50 hover:text-indigo-700 text-zinc-700 border border-zinc-200 transition-colors cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleCustomSubmit} className="space-y-2">
                <div className="flex gap-2">
                  <div className="w-1/3">
                    <input
                      type="text"
                      value={customAuthor}
                      onChange={e => setCustomAuthor(e.target.value)}
                      placeholder="handle"
                      className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex-1">
                    <input
                      type="text"
                      maxLength={280}
                      value={customText}
                      onChange={e => setCustomText(e.target.value)}
                      placeholder="Type customer message..."
                      className="w-full px-3 py-1.5 text-xs rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!customText.trim() || customLoading}
                  className="w-full py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center space-x-1.5"
                >
                  {customLoading ? (
                    <span>Triaging...</span>
                  ) : (
                    <>
                      <span>Send Inbound & Triage</span>
                      <span>→</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: AI Resolution Cockpit & Inspector (7 Cols) */}
          <div className="lg:col-span-7">
            {selectedTicket ? (
              <div className="space-y-4">
                {/* Cockpit Top Bar */}
                <div className="p-5 rounded-2xl bg-white border border-zinc-200/90 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-3.5 border-b border-zinc-100">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-sky-500 flex items-center justify-center font-bold text-white shadow-xs">
                        {selectedTicket.author.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-bold text-zinc-950">@{selectedTicket.author}</span>
                          <span className="text-[11px] font-semibold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                            {selectedTicket.channel || "Twitter Support"}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 text-[11px] text-zinc-400 mt-0.5">
                          <span>ID: {selectedTicket.tweet_id}</span>
                          <span>•</span>
                          <span>{selectedTicket.timestamp || "Just now"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status & Resolve Toggle */}
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => toggleResolved(selectedTicket.tweet_id)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all border cursor-pointer ${
                          selectedTicket.isResolved
                            ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                            : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
                        }`}
                      >
                        {selectedTicket.isResolved ? "✓ Resolved" : "Mark Resolved"}
                      </button>
                    </div>
                  </div>

                  {/* Customer Tweet Content */}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                      Customer Inquiry
                    </span>
                    <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/80 text-xs sm:text-sm text-zinc-900 font-medium leading-relaxed">
                      &ldquo;{selectedTicket.original_text}&rdquo;
                    </div>
                  </div>
                </div>

                {/* Visual Agent Reasoning Pipeline (Linear Stepper) */}
                <div className="p-5 rounded-2xl bg-white border border-zinc-200/90 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                      AI Agent Decisioning Engine
                    </span>
                    <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                      Deterministic Pipeline
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Step 1: Intent */}
                    <div className="p-3.5 rounded-xl bg-zinc-50/70 border border-zinc-200 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">1. Intent Classification</span>
                        <span className="text-xs font-bold text-indigo-700">
                          {Math.round((selectedTicket.agent_result?.intent?.confidence || 0) * 100)}%
                        </span>
                      </div>
                      <div className="text-xs font-bold text-zinc-900">
                        {selectedTicket.agent_result?.intent?.intent || "Unclassified"}
                      </div>
                      <div className="w-full bg-zinc-200 rounded-full h-1 overflow-hidden">
                        <div
                          className="bg-indigo-600 h-1 rounded-full"
                          style={{ width: `${(selectedTicket.agent_result?.intent?.confidence || 0) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Step 2: Sentiment */}
                    <div className="p-3.5 rounded-xl bg-zinc-50/70 border border-zinc-200 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">2. Sentiment & Policy</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white border border-zinc-200">
                          {selectedTicket.agent_result?.intent?.sentiment || "Neutral"}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-700">
                        {selectedTicket.agent_result?.intent?.sentiment?.toLowerCase() === "angry"
                          ? "High risk detected (requires human care)"
                          : "Manageable sentiment (authorized for autonomous handling)"}
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Decision Banner */}
                  <div className={`p-3.5 rounded-xl border flex items-start space-x-3 text-xs ${
                    selectedTicket.agent_result?.decision?.decision === "Escalate"
                      ? "bg-rose-50 border-rose-200 text-rose-900"
                      : "bg-emerald-50 border-emerald-200 text-emerald-900"
                  }`}>
                    <span className="text-base">
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

                  {/* Step 4: Grounded Knowledge Retrieval */}
                  {selectedTicket.agent_result?.draft?.retrieved_context && (
                    <div className="p-3 rounded-xl bg-indigo-50/40 border border-indigo-100 text-[11px] text-zinc-700 space-y-1">
                      <div className="flex items-center space-x-1.5 font-bold text-indigo-900">
                        <span>📚</span>
                        <span>Grounded Knowledge Base (FAQ):</span>
                      </div>
                      <p className="italic text-zinc-600 font-sans">
                        &ldquo;{selectedTicket.agent_result.draft.retrieved_context}&rdquo;
                      </p>
                    </div>
                  )}
                </div>

                {/* Card 3: Interactive Draft Response Studio */}
                <div className="p-5 rounded-2xl bg-white border border-zinc-200/90 shadow-2xs space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                        Drafted AI Response Studio
                      </span>
                    </div>

                    {/* Tone Rewrite Pills */}
                    <div className="flex items-center space-x-1 text-[11px]">
                      <span className="text-zinc-400 mr-1">Tone:</span>
                      <button
                        onClick={() => applyTone(selectedTicket.tweet_id, "empathic")}
                        className="px-2 py-0.5 rounded-lg bg-zinc-100 hover:bg-indigo-50 hover:text-indigo-700 text-zinc-700 font-medium transition-colors cursor-pointer"
                      >
                        ✨ Empathetic
                      </button>
                      <button
                        onClick={() => applyTone(selectedTicket.tweet_id, "concise")}
                        className="px-2 py-0.5 rounded-lg bg-zinc-100 hover:bg-indigo-50 hover:text-indigo-700 text-zinc-700 font-medium transition-colors cursor-pointer"
                      >
                        ⚡ Concise
                      </button>
                      <button
                        onClick={() => applyTone(selectedTicket.tweet_id, "formal")}
                        className="px-2 py-0.5 rounded-lg bg-zinc-100 hover:bg-indigo-50 hover:text-indigo-700 text-zinc-700 font-medium transition-colors cursor-pointer"
                      >
                        👔 Formal
                      </button>
                    </div>
                  </div>

                  {/* Editable textarea for response */}
                  <textarea
                    rows={4}
                    value={selectedTicket.editedDraft}
                    onChange={e => updateDraft(selectedTicket.tweet_id, e.target.value)}
                    placeholder="No automated draft generated for this escalated ticket."
                    className="w-full p-3.5 text-xs sm:text-sm rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 leading-relaxed resize-none"
                  />

                  {/* Actions footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-[10px] text-zinc-400">
                      {selectedTicket.editedDraft?.length || 0}/280 characters
                    </span>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => copyDraft(selectedTicket.tweet_id, selectedTicket.editedDraft || "")}
                        disabled={!selectedTicket.editedDraft}
                        className="px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:text-zinc-950 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors shadow-2xs disabled:opacity-40 cursor-pointer"
                      >
                        {copiedId === selectedTicket.tweet_id ? "✓ Copied" : "Copy Reply"}
                      </button>

                      <button
                        onClick={() => toggleResolved(selectedTicket.tweet_id)}
                        className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] rounded-xl transition-all shadow-xs cursor-pointer"
                      >
                        {selectedTicket.isResolved ? "Reopen Ticket" : "Approve & Send"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-24 px-6 rounded-2xl border border-dashed border-zinc-200 bg-white shadow-2xs">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                </div>
                <h3 className="text-sm font-bold text-zinc-900">Select a Ticket from the Queue</h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1 mb-5">
                  Click any ticket in the inbound stream on the left, or trigger the benchmark batch to explore the live AI reasoning pipeline.
                </p>
                <button
                  onClick={processStream}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs cursor-pointer"
                >
                  Start Benchmark Batch
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
