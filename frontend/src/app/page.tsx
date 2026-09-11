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
  const [customAuthor, setCustomAuthor] = useState("traveler_sam");
  const [customText, setCustomText] = useState("");
  const [customLoading, setCustomLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Helper to fetch API with fallback support
  const fetchApi = async (path: string, options?: RequestInit) => {
    try {
      const res = await fetch(path, options);
      if (res.ok) return await res.json();
    } catch {
      // Fallback directly to port 8000 if proxy isn't caught
      const fallbackUrl = `http://127.0.0.1:8000${path}`;
      const res2 = await fetch(fallbackUrl, options);
      return await res2.json();
    }
  };

  // Load sample tweets and server health
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
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
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
    setStatusMessage("Processing queue sequentially...");
    
    for (const tweet of tweets) {
      try {
        await processSingleTweet(tweet);
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error("Error processing tweet ID:", tweet.id, err);
      }
    }
    
    setProcessing(false);
    setStatusMessage("Batch processing complete.");
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Process single custom tweet
  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customText.trim() || customLoading) return;
    setCustomLoading(true);
    try {
      await processSingleTweet({
        id: "custom-" + Date.now(),
        author: customAuthor.trim() || "anonymous",
        text: customText.trim()
      });
      setCustomText("");
    } catch (err) {
      console.error("Failed to process custom tweet:", err);
    } finally {
      setCustomLoading(false);
    }
  };

  const copyDraft = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Metrics
  const metrics = useMemo(() => {
    const total = results.length;
    const autoHandled = results.filter(r => r.agent_result?.decision?.decision === "Auto-handle").length;
    const escalated = results.filter(r => r.agent_result?.decision?.decision === "Escalate").length;
    const avgConfidence = total > 0
      ? (results.reduce((acc, r) => acc + (r.agent_result?.intent?.confidence || 0), 0) / total) * 100
      : 0;
    return { total, autoHandled, escalated, avgConfidence: avgConfidence.toFixed(0) };
  }, [results]);

  // Filtered tickets
  const filteredResults = useMemo(() => {
    if (activeTab === "auto") {
      return results.filter(r => r.agent_result?.decision?.decision === "Auto-handle");
    }
    if (activeTab === "escalate") {
      return results.filter(r => r.agent_result?.decision?.decision === "Escalate");
    }
    return results;
  }, [results, activeTab]);

  const presetExamples = [
    { label: "Delayed Package", text: "@AmazonHelp My order #8291 is 4 days overdue and missing tracking updates!" },
    { label: "Return Query", text: "@AmazonHelp How do I return a damaged pair of headphones purchased last week?" },
    { label: "Angry Escalation", text: "@AmazonHelp This is unacceptable. Your rep disconnected my call and I want a refund now." },
    { label: "Global Shipping", text: "@AmazonHelp Do you provide international priority shipping to Japan?" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16 selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation */}
      <nav className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-500 to-teal-400 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/25">
              H
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Hiver Support Intelligence
              </span>
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Agentic RAG
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
              <span className={`w-2 h-2 rounded-full ${health?.gemini_configured ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`}></span>
              <span className="text-slate-400">Engine:</span>
              <span className="font-medium text-slate-200">{health?.model || "Checking..."}</span>
            </div>

            <button
              id="start-stream-btn"
              onClick={processStream}
              disabled={processing || tweets.length === 0}
              className="inline-flex items-center px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-40 transition-all duration-200 shadow-md shadow-indigo-500/20 cursor-pointer disabled:cursor-not-allowed"
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Run Sample Batch ({tweets.length})
                </>
              )}
            </button>

            {results.length > 0 && (
              <button
                id="clear-results-btn"
                onClick={() => setResults([])}
                className="px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors"
                title="Clear Processed Feed"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {/* Status notification toast */}
        {statusMessage && (
          <div className="p-3 text-xs rounded-xl bg-indigo-950/70 border border-indigo-800/60 text-indigo-300 flex items-center justify-between animate-fade-in">
            <span>{statusMessage}</span>
            <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white ml-4">✕</button>
          </div>
        )}

        {/* Hero & Metrics Header */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Analyzed</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold tracking-tight text-white">{metrics.total}</span>
              <span className="text-xs text-slate-500">tickets</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur">
            <span className="text-xs font-medium uppercase tracking-wider text-emerald-400">Auto-Handled</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold tracking-tight text-emerald-400">{metrics.autoHandled}</span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {metrics.total > 0 ? Math.round((metrics.autoHandled / metrics.total) * 100) : 0}%
              </span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur">
            <span className="text-xs font-medium uppercase tracking-wider text-rose-400">Human Escalations</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold tracking-tight text-rose-400">{metrics.escalated}</span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                {metrics.total > 0 ? Math.round((metrics.escalated / metrics.total) * 100) : 0}%
              </span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur">
            <span className="text-xs font-medium uppercase tracking-wider text-indigo-400">Avg Confidence</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-3xl font-bold tracking-tight text-indigo-400">{metrics.avgConfidence}%</span>
              <span className="text-xs text-slate-500">intent score</span>
            </div>
          </div>
        </section>

        {/* Live Tweet Simulation Card */}
        <section className="p-6 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/50 border border-slate-800 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-2">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                Test Custom Customer Tweet
              </h2>
              <p className="text-xs text-slate-400">Type any customer message to test real-time classification, sentiment, decisioning, and grounding.</p>
            </div>
            
            <div className="flex flex-wrap gap-1.5">
              {presetExamples.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCustomText(preset.text)}
                  className="px-2.5 py-1 text-[11px] rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleCustomSubmit} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-1">
                <label htmlFor="custom-author-input" className="block text-[11px] font-medium text-slate-400 mb-1">
                  Customer Handle
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-slate-500 text-sm">@</span>
                  <input
                    id="custom-author-input"
                    type="text"
                    value={customAuthor}
                    onChange={e => setCustomAuthor(e.target.value)}
                    placeholder="username"
                    className="w-full pl-7 pr-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <label htmlFor="custom-tweet-input" className="block text-[11px] font-medium text-slate-400 mb-1">
                  Tweet Message
                </label>
                <div className="flex gap-2">
                  <input
                    id="custom-tweet-input"
                    type="text"
                    value={customText}
                    onChange={e => setCustomText(e.target.value)}
                    placeholder="e.g. @AmazonHelp Where is my delivery? It was promised yesterday."
                    className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    id="analyze-custom-btn"
                    type="submit"
                    disabled={!customText.trim() || customLoading}
                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl transition-all shadow-md shadow-indigo-600/20 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {customLoading ? "Analyzing..." : "Analyze"}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </section>

        {/* Stream & Feed View */}
        <section className="space-y-4">
          {/* Filter Tabs */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center space-x-2">
              <button
                id="tab-all"
                onClick={() => setActiveTab("all")}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  activeTab === "all" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                All Results ({results.length})
              </button>
              <button
                id="tab-auto"
                onClick={() => setActiveTab("auto")}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  activeTab === "auto" ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800/60" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Auto-Handled ({metrics.autoHandled})
              </button>
              <button
                id="tab-escalate"
                onClick={() => setActiveTab("escalate")}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  activeTab === "escalate" ? "bg-rose-950/80 text-rose-300 border border-rose-800/60" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Escalated ({metrics.escalated})
              </button>
            </div>

            <span className="text-xs text-slate-500 hidden sm:inline">
              Showing {filteredResults.length} of {results.length} processed
            </span>
          </div>

          {/* Empty State */}
          {results.length === 0 && !processing && (
            <div className="text-center py-20 rounded-2xl border border-dashed border-slate-800/80 bg-slate-900/20">
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400 mb-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-200">No Tickets Analyzed Yet</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-5">
                Click &quot;Run Sample Batch&quot; to stream customer support tweets through the classification and RAG pipeline, or type a custom tweet above.
              </p>
              <button
                id="empty-state-run-btn"
                onClick={processStream}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all shadow-md shadow-indigo-600/20"
              >
                Start Sample Stream ({tweets.length} Tweets)
              </button>
            </div>
          )}

          {/* Cards Stream */}
          <div className="space-y-4">
            {filteredResults.map((ticket, idx) => {
              const intent = ticket?.agent_result?.intent;
              const decision = ticket?.agent_result?.decision;
              const draft = ticket?.agent_result?.draft;
              const isEscalated = decision?.decision === "Escalate";

              // Sentiment color styling
              const sentiment = intent?.sentiment?.toLowerCase() || "neutral";
              const sentimentStyles = {
                angry: "bg-rose-500/10 text-rose-400 border-rose-500/30",
                negative: "bg-amber-500/10 text-amber-400 border-amber-500/30",
                positive: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                neutral: "bg-slate-500/10 text-slate-400 border-slate-500/30"
              }[sentiment] || "bg-slate-500/10 text-slate-400 border-slate-500/30";

              return (
                <div
                  key={ticket.tweet_id || idx}
                  className="rounded-2xl bg-slate-900/70 border border-slate-800/90 p-5 shadow-lg transition-all hover:border-slate-700"
                >
                  {/* Top Bar: Author, Badges */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/60">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shadow">
                        {ticket.author ? ticket.author.charAt(0).toUpperCase() : "U"}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-sm text-slate-100">@{ticket.author}</span>
                          {ticket.timestamp && (
                            <span className="text-[11px] text-slate-500">{ticket.timestamp}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Intent badge */}
                      <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        {intent?.intent || "Unclassified"} ({Math.round((intent?.confidence || 0) * 100)}%)
                      </span>

                      {/* Sentiment badge */}
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-medium border ${sentimentStyles}`}>
                        {intent?.sentiment || "Neutral"}
                      </span>

                      {/* Decision badge */}
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border ${
                          isEscalated
                            ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                            : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isEscalated ? "bg-rose-400" : "bg-emerald-400"}`}></span>
                        {decision?.decision || "Auto-handle"}
                      </span>
                    </div>
                  </div>

                  {/* Customer Tweet Content */}
                  <div className="my-4 pl-3 border-l-2 border-slate-700">
                    <p className="text-sm text-slate-200 leading-relaxed">&ldquo;{ticket.original_text}&rdquo;</p>
                  </div>

                  {/* Agent Reasoning */}
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs mb-4">
                    <span className="font-semibold text-slate-400 block mb-1 uppercase text-[10px] tracking-wider">
                      Decision Rationale
                    </span>
                    <p className="text-slate-300">{decision?.reason || "Reasoning processed."}</p>
                  </div>

                  {/* Grounded Draft Response (if Auto-handle) */}
                  {draft ? (
                    <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-slate-900 border border-blue-900/40">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold text-blue-300 flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          AI Grounded Reply Draft
                        </span>
                        <button
                          onClick={() => copyDraft(ticket.tweet_id, draft.drafted_response)}
                          className="text-[11px] px-2 py-0.5 rounded bg-blue-900/40 hover:bg-blue-800/60 text-blue-200 transition-colors cursor-pointer"
                        >
                          {copiedId === ticket.tweet_id ? "Copied!" : "Copy Text"}
                        </button>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed">{draft.drafted_response}</p>
                      
                      {draft.retrieved_context && (
                        <div className="mt-2.5 pt-2 border-t border-blue-900/30 text-[11px] text-slate-400 flex items-start gap-1">
                          <span className="font-medium text-blue-400 shrink-0">FAQ Citation:</span>
                          <span className="italic">{draft.retrieved_context}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-900/30 flex items-center justify-between text-xs text-rose-300">
                      <div className="flex items-center space-x-2">
                        <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>Escalated to human support queue (Tier 2). Direct AI auto-reply suppressed.</span>
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-900/40 text-rose-200">
                        Human Required
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
