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

// Pre-populated initial demonstration tickets for immediate, lively dashboard experience
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
      decision: { decision: "Auto-handle", reason: "Standard shipping inquiry with identifiable tracking context. Policy permits autonomous assistance." },
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
      decision: { decision: "Escalate", reason: "Critical negative sentiment and escalation keywords detected. Guardrail protocol requires Tier-2 human specialist." },
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

    const entries = Object.entries(metrics.intentCounts).length > 0
      ? Object.entries(metrics.intentCounts)
      : [
          ["Delivery Issue", 2],
          ["Refund Request", 1],
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
  }, [metrics.intentCounts]);

  const presetExamples = [
    { label: "📦 Overdue Package", author: "alex_travels", text: "@AmazonHelp My package is 3 days late and I need it for a birthday party tomorrow! What is going on???" },
    { label: "💸 Refund Demand", author: "maria_k", text: "@AmazonHelp WORST SERVICE EVER. YOU LOST MY ORDER AND REFUSE TO REFUND ME." },
    { label: "🔄 Return Kindle", author: "sammy_reads", text: "@AmazonHelp how do I return a kindle that won't turn on?" },
    { label: "🌐 Global Shipping", author: "liam_nz", text: "@AmazonHelp Do you guys ship to New Zealand with expedited delivery?" },
    { label: "📺 Video Glitch", author: "clara_stream", text: "@AmazonHelp My prime video is buffering constantly on my smart TV." }
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* 1. Persistent Modern Sidebar */}
      <aside className="w-64 border-r border-[#E2E8F0] bg-white flex flex-col justify-between p-6 sticky top-0 h-screen z-40 shrink-0">
        <div className="space-y-8">
          {/* Brand Header */}
          <div className="flex items-center space-x-3 px-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-teal-400 flex items-center justify-center text-white shadow-xs">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-base font-bold tracking-tight text-[#0F172A]">ResolveAI</span>
                <span className="px-1.5 py-0.2 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-100">
                  v2.5
                </span>
              </div>
              <p className="text-xs text-[#475569]">Support Intelligence</p>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-2">
            <button
              onClick={() => setCurrentNav("cockpit")}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                currentNav === "cockpit"
                  ? "bg-[#F1F5F9] text-[#0F172A] font-bold shadow-2xs"
                  : "text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] font-medium"
              }`}
            >
              <div className="flex items-center gap-3">
                <svg className="w-3.5 h-3.5 shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                currentNav === "analytics"
                  ? "bg-[#F1F5F9] text-[#0F172A] font-bold shadow-2xs"
                  : "text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] font-medium"
              }`}
            >
              <svg className="w-3.5 h-3.5 shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
              <span>Visual Analytics</span>
            </button>

            <button
              onClick={() => setCurrentNav("simulator")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                currentNav === "simulator"
                  ? "bg-[#F1F5F9] text-[#0F172A] font-bold shadow-2xs"
                  : "text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] font-medium"
              }`}
            >
              <svg className="w-3.5 h-3.5 shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              <span>Simulation Studio</span>
            </button>

            <button
              onClick={() => setCurrentNav("knowledge")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                currentNav === "knowledge"
                  ? "bg-[#F1F5F9] text-[#0F172A] font-bold shadow-2xs"
                  : "text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] font-medium"
              }`}
            >
              <svg className="w-3.5 h-3.5 shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>Knowledge Base</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Engine Card */}
        <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#0F172A] flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></span>
              <span>FastAPI Engine</span>
            </span>
            <span className="text-[10px] font-mono text-[#475569]">24ms</span>
          </div>
          <div className="text-[11px] text-[#475569] truncate">
            Model: <span className="font-semibold text-[#0F172A]">{health?.model || "Local Engine"}</span>
          </div>
          <div className="w-full bg-[#E2E8F0] rounded-full h-1 overflow-hidden">
            <div className="bg-teal-500 h-1 rounded-full w-4/5"></div>
          </div>
        </div>
      </aside>

      {/* 2. Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Top Header: Centered search bar pill with inner shadow, spaced out solid buttons */}
        <header className="border-b border-[#E2E8F0] bg-white sticky top-0 z-30 px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="hidden lg:block w-48 text-xs font-bold text-[#0F172A]">
            {currentNav === "cockpit" && "Live Operations"}
            {currentNav === "analytics" && "Metrics & Trends"}
            {currentNav === "simulator" && "Scenario Playground"}
            {currentNav === "knowledge" && "Grounded Policies"}
          </div>

          {/* Centered Pill Search Bar with subtle inner shadow */}
          <div className="flex-1 max-w-md mx-auto relative">
            <span className="absolute inset-y-0 left-3.5 flex items-center text-slate-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search inquiries, handles, or intents... (⌘K)"
              className="w-full pl-9 pr-4 py-2 text-xs rounded-full bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] placeholder-[#475569] focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 search-pill-shadow transition-all font-medium"
            />
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={() => setLiveStreamActive(!liveStreamActive)}
              className={`px-4 py-2 rounded-full text-xs font-semibold text-white transition-all shadow-xs flex items-center space-x-2 cursor-pointer border-0 ${
                liveStreamActive
                  ? "bg-[#0F766E] hover:bg-[#115E59]"
                  : "bg-[#0D9488] hover:bg-[#0F766E]"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${liveStreamActive ? "bg-white animate-ping" : "bg-teal-200"}`}></span>
              <span>{liveStreamActive ? "Streaming Active" : "Simulate Live Stream"}</span>
            </button>

            <button
              id="start-stream-btn"
              onClick={processStream}
              disabled={processing || tweets.length === 0}
              className="px-4 py-2 rounded-full text-xs font-semibold text-white bg-[#4F46E5] hover:bg-[#4338CA] active:scale-[0.98] disabled:opacity-50 transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed flex items-center space-x-1.5 border-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
              <span>Benchmark Batch ({tweets.length})</span>
            </button>

            {results.length > 0 && (
              <button
                onClick={exportResults}
                className="px-3 py-2 text-xs font-medium text-[#475569] hover:text-[#0F172A] bg-white border border-[#E2E8F0] rounded-full hover:bg-[#F1F5F9] transition-all shadow-2xs"
                title="Export Data"
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
                className="px-3 py-2 text-xs font-medium text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-all"
                title="Clear feed"
              >
                Clear
              </button>
            )}
          </div>
        </header>

        {/* Content Canvas */}
        <main className="p-8 space-y-6 max-w-7xl w-full mx-auto">
          {statusNotification && (
            <div className={`p-4 rounded-xl border flex items-center justify-between shadow-xs ${
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

          {/* VIEW 1: RESOLUTION COCKPIT */}
          {currentNav === "cockpit" && (
            <>
              {/* Floating KPI Cards */}
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="modern-card modern-card-hover p-5 space-y-2">
                  <div className="flex items-center justify-between text-[#475569]">
                    <span className="text-xs font-bold uppercase tracking-wider">Total Evaluated</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#0F172A]">Active</span>
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-3xl font-extrabold text-[#0F172A] tracking-tight">{metrics.total}</span>
                    <span className="text-xs text-[#475569]">tickets</span>
                  </div>
                  <div className="text-xs text-[#475569]">
                    {metrics.resolved} resolved ({metrics.total > 0 ? Math.round((metrics.resolved / metrics.total) * 100) : 0}%)
                  </div>
                </div>

                <div className="modern-card modern-card-hover p-5 space-y-2">
                  <div className="flex items-center justify-between text-teal-700">
                    <span className="text-xs font-bold uppercase tracking-wider">Auto-Resolution</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                      {metrics.autoRate}%
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-extrabold text-teal-600 tracking-tight">{metrics.autoHandled}</span>
                    <span className="text-xs text-[#475569]">autonomous</span>
                  </div>
                  <div className="w-full bg-[#E2E8F0] rounded-full h-1.5 overflow-hidden">
                    <div className="bg-teal-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${metrics.autoRate}%` }}></div>
                  </div>
                </div>

                <div className="modern-card modern-card-hover p-5 space-y-2">
                  <div className="flex items-center justify-between text-rose-700">
                    <span className="text-xs font-bold uppercase tracking-wider">Human Escalations</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                      {metrics.escalateRate}%
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-extrabold text-rose-600 tracking-tight">{metrics.escalated}</span>
                    <span className="text-xs text-[#475569]">specialist</span>
                  </div>
                  <div className="w-full bg-[#E2E8F0] rounded-full h-1.5 overflow-hidden">
                    <div className="bg-rose-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${metrics.escalateRate}%` }}></div>
                  </div>
                </div>

                <div className="modern-card modern-card-hover p-5 space-y-2">
                  <div className="flex items-center justify-between text-indigo-700">
                    <span className="text-xs font-bold uppercase tracking-wider">Confidence Mean</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                      &gt;70% Gate
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-extrabold text-indigo-600 tracking-tight">{metrics.avgConfidence}%</span>
                    <span className="text-xs text-[#475569]">precision</span>
                  </div>
                  <div className="w-full bg-[#E2E8F0] rounded-full h-1.5 overflow-hidden">
                    <div className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${metrics.avgConfidence}%` }}></div>
                  </div>
                </div>
              </section>

              {/* Dual-Pane Layout: Feed (Left) + Inspector (Right) */}
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Feed */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="modern-card p-4 flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-xs font-bold text-[#0F172A]">
                      <span>Inbound Feed</span>
                      <span className="px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#475569] text-[10px]">
                        {filteredResults.length}
                      </span>
                    </div>

                    <div className="flex p-1 bg-[#F1F5F9] rounded-xl text-xs font-semibold">
                      <button
                        onClick={() => setActiveQueueFilter("all")}
                        className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                          activeQueueFilter === "all" ? "bg-white text-[#0F172A] shadow-2xs font-bold" : "text-[#475569] hover:text-[#0F172A]"
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setActiveQueueFilter("auto")}
                        className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                          activeQueueFilter === "auto" ? "bg-white text-teal-700 shadow-2xs font-bold" : "text-[#475569] hover:text-[#0F172A]"
                        }`}
                      >
                        Auto
                      </button>
                      <button
                        onClick={() => setActiveQueueFilter("escalate")}
                        className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                          activeQueueFilter === "escalate" ? "bg-white text-rose-700 shadow-2xs font-bold" : "text-[#475569] hover:text-[#0F172A]"
                        }`}
                      >
                        Escalate
                      </button>
                    </div>
                  </div>

                  {processing && (
                    <div className="space-y-3">
                      {[1, 2].map(i => (
                        <div key={i} className="modern-card p-5 space-y-3">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-xl skeleton-shimmer shrink-0"></div>
                            <div className="space-y-1.5 flex-1">
                              <div className="h-3 w-28 rounded-md skeleton-shimmer"></div>
                              <div className="h-2.5 w-16 rounded-md skeleton-shimmer"></div>
                            </div>
                          </div>
                          <div className="h-3.5 w-full rounded-md skeleton-shimmer"></div>
                          <div className="h-3.5 w-4/5 rounded-md skeleton-shimmer"></div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
                    {filteredResults.map(ticket => {
                      const isSelected = selectedTicket?.tweet_id === ticket.tweet_id;
                      const isEscalate = ticket.agent_result?.decision?.decision === "Escalate";
                      const sentiment = ticket.agent_result?.intent?.sentiment?.toLowerCase() || "neutral";

                      const sentimentTag = {
                        angry: { bg: "bg-rose-50 text-rose-700 border-rose-200", label: "Angry" },
                        negative: { bg: "bg-amber-50 text-amber-700 border-amber-200", label: "Negative" },
                        positive: { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Positive" },
                        neutral: { bg: "bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]", label: "Neutral" }
                      }[sentiment] || { bg: "bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]", label: "Neutral" };

                      return (
                        <div
                          key={ticket.tweet_id}
                          onClick={() => setSelectedTicketId(ticket.tweet_id)}
                          className={`p-4 cursor-pointer transition-all duration-200 ${
                            isSelected
                              ? "modern-card-active"
                              : "modern-card modern-card-hover"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2.5">
                              <div className="w-7 h-7 rounded-xl bg-[#F1F5F9] flex items-center justify-center text-xs font-bold text-[#0F172A]">
                                {ticket.author.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <span className="text-xs font-bold text-[#0F172A]">@{ticket.author}</span>
                                <span className="text-[10px] text-[#475569] block">{ticket.timestamp}</span>
                              </div>
                            </div>
                            <div className="flex items-center space-x-1.5">
                              {ticket.isResolved && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                  ✓ Resolved
                                </span>
                              )}
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${sentimentTag.bg}`}>
                                {sentimentTag.label}
                              </span>
                            </div>
                          </div>

                          <p className="text-xs text-[#475569] line-clamp-2 mb-3 font-normal leading-relaxed">
                            &ldquo;{ticket.original_text}&rdquo;
                          </p>

                          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-[#E2E8F0]">
                            <span className="font-semibold text-[#0F172A] bg-[#F8FAFC] px-2 py-0.5 rounded-md border border-[#E2E8F0]">
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
                    })}
                  </div>
                </div>

                {/* Right Inspector */}
                <div className="lg:col-span-7">
                  {selectedTicket && (
                    <div className="space-y-4">
                      {/* Customer Inquiry Card */}
                      <div className="modern-card p-6 space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-teal-500 flex items-center justify-center font-bold text-white shadow-xs">
                              {selectedTicket.author.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-bold text-[#0F172A]">@{selectedTicket.author}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#475569]">
                                  {selectedTicket.channel}
                                </span>
                              </div>
                              <span className="text-[11px] text-[#475569]">ID: {selectedTicket.tweet_id} • {selectedTicket.timestamp}</span>
                            </div>
                          </div>

                          <button
                            onClick={() => toggleResolved(selectedTicket.tweet_id)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-full transition-all border cursor-pointer ${
                              selectedTicket.isResolved
                                ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                : "bg-white text-[#0F172A] border-[#E2E8F0] hover:bg-[#F1F5F9]"
                            }`}
                          >
                            {selectedTicket.isResolved ? "✓ Resolved" : "Mark Resolved"}
                          </button>
                        </div>

                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-[#475569] block mb-1.5">
                            Customer Message
                          </span>
                          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs sm:text-sm font-medium text-[#0F172A] leading-relaxed">
                            &ldquo;{selectedTicket.original_text}&rdquo;
                          </div>
                        </div>
                      </div>

                      {/* Decisioning Pipeline Card */}
                      <div className="modern-card p-6 space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
                          <span className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                            AI Agent Decisioning Engine
                          </span>
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                            Deterministic Guardrails
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-[#475569] uppercase tracking-wider">1. Intent</span>
                              <span className="font-extrabold text-indigo-600">
                                {Math.round((selectedTicket.agent_result?.intent?.confidence || 0) * 100)}%
                              </span>
                            </div>
                            <div className="text-xs font-bold text-[#0F172A]">
                              {selectedTicket.agent_result?.intent?.intent}
                            </div>
                            <div className="w-full bg-[#E2E8F0] rounded-full h-1 overflow-hidden mt-1">
                              <div className="bg-indigo-600 h-1 rounded-full" style={{ width: `${(selectedTicket.agent_result?.intent?.confidence || 0) * 100}%` }}></div>
                            </div>
                          </div>

                          <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-[#475569] uppercase tracking-wider">2. Sentiment</span>
                              <span className="font-bold text-[#0F172A]">{selectedTicket.agent_result?.intent?.sentiment}</span>
                            </div>
                            <div className="text-xs text-[#475569]">
                              {selectedTicket.agent_result?.intent?.sentiment?.toLowerCase() === "angry"
                                ? "Critical negative tone (Policy: Human Escalation)"
                                : "Manageable tone (Policy: Autonomous Handling)"}
                            </div>
                          </div>
                        </div>

                        {/* Decision Banner */}
                        <div className={`p-4 rounded-xl border flex items-start space-x-3 text-xs ${
                          selectedTicket.agent_result?.decision?.decision === "Escalate"
                            ? "bg-rose-50 border-rose-200 text-rose-900"
                            : "bg-teal-50 border-teal-200 text-teal-900"
                        }`}>
                          <span className="text-base mt-0.5">
                            {selectedTicket.agent_result?.decision?.decision === "Escalate" ? "🚨" : "⚡"}
                          </span>
                          <div>
                            <div className="font-bold text-[#0F172A]">
                              {selectedTicket.agent_result?.decision?.decision === "Escalate"
                                ? "Escalated to Human Specialist Tier-2"
                                : "Autonomous Resolution Authorized"}
                            </div>
                            <div className="text-xs opacity-90 mt-0.5 text-[#475569]">
                              {selectedTicket.agent_result?.decision?.reason}
                            </div>
                          </div>
                        </div>

                        {/* Grounded Context */}
                        {selectedTicket.agent_result?.draft?.retrieved_context && (
                          <div className="p-4 rounded-xl bg-indigo-50/40 border border-indigo-100 text-xs text-[#0F172A] space-y-1">
                            <div className="font-bold text-indigo-950 flex items-center space-x-1.5">
                              <span>📚</span>
                              <span>Grounded Knowledge Base (FAQ):</span>
                            </div>
                            <p className="italic text-[#475569]">
                              &ldquo;{selectedTicket.agent_result.draft.retrieved_context}&rdquo;
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Response Studio */}
                      <div className="modern-card p-6 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
                          <span className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                            AI Response Studio
                          </span>

                          <div className="flex items-center space-x-1.5 text-xs">
                            <span className="text-[#475569]">Tone:</span>
                            <button
                              onClick={() => applyTone(selectedTicket.tweet_id, "empathic")}
                              className="px-2.5 py-1 rounded-full bg-[#F1F5F9] hover:bg-indigo-50 hover:text-indigo-700 text-[#475569] font-semibold transition-all cursor-pointer text-[11px]"
                            >
                              ✨ Empathetic
                            </button>
                            <button
                              onClick={() => applyTone(selectedTicket.tweet_id, "concise")}
                              className="px-2.5 py-1 rounded-full bg-[#F1F5F9] hover:bg-indigo-50 hover:text-indigo-700 text-[#475569] font-semibold transition-all cursor-pointer text-[11px]"
                            >
                              ⚡ Concise
                            </button>
                            <button
                              onClick={() => applyTone(selectedTicket.tweet_id, "formal")}
                              className="px-2.5 py-1 rounded-full bg-[#F1F5F9] hover:bg-indigo-50 hover:text-indigo-700 text-[#475569] font-semibold transition-all cursor-pointer text-[11px]"
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
                          className="w-full p-4 text-xs sm:text-sm rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 leading-relaxed resize-none"
                        />

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <span className="text-xs text-[#475569]">
                            {selectedTicket.editedDraft?.length || 0}/280 characters
                          </span>

                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => copyDraft(selectedTicket.tweet_id, selectedTicket.editedDraft || "")}
                              disabled={!selectedTicket.editedDraft}
                              className="px-4 py-2 text-xs font-semibold text-[#0F172A] bg-white border border-[#E2E8F0] rounded-full hover:bg-[#F1F5F9] transition-all shadow-2xs disabled:opacity-40 cursor-pointer"
                            >
                              {copiedId === selectedTicket.tweet_id ? "✓ Copied" : "Copy Reply"}
                            </button>

                            <button
                              onClick={() => toggleResolved(selectedTicket.tweet_id)}
                              className="px-5 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] active:scale-[0.98] rounded-full transition-all shadow-xs cursor-pointer border-0"
                            >
                              {selectedTicket.isResolved ? "Reopen Ticket" : "Approve & Send"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

          {/* VIEW 2: VISUAL ANALYTICS */}
          {currentNav === "analytics" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">Interactive Analytics & Intent Distribution</h2>
                  <p className="text-xs text-[#475569] mt-0.5">Unwatermarked dynamic vector charts reflecting real-time triaged support tickets.</p>
                </div>
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {metrics.total} Processed Samples
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 modern-card p-6 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                      Intent Categorization (Donut Chart)
                    </span>
                    <span className="text-xs text-[#475569]">Hover slices to inspect</span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-around gap-6 pt-2">
                    <div className="relative w-52 h-52 shrink-0">
                      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
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
                              className="transition-all duration-200 cursor-pointer"
                            />
                          );
                        })}
                      </svg>

                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-2xl font-black text-[#0F172A] tracking-tight">
                          {hoveredIntent
                            ? donutData.find(d => d.name === hoveredIntent)?.percent + "%"
                            : metrics.total}
                        </span>
                        <span className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">
                          {hoveredIntent || "Total Tickets"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 flex-1">
                      {donutData.map(item => (
                        <div
                          key={item.name}
                          onMouseEnter={() => setHoveredIntent(item.name)}
                          onMouseLeave={() => setHoveredIntent(null)}
                          className={`flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer ${
                            hoveredIntent === item.name ? "bg-[#F1F5F9] font-bold" : "hover:bg-[#F8FAFC]"
                          }`}
                        >
                          <div className="flex items-center space-x-2.5">
                            <span className="w-3 h-3 rounded-md" style={{ backgroundColor: item.color }}></span>
                            <span className="text-xs text-[#0F172A]">{item.name}</span>
                          </div>
                          <div className="flex items-center space-x-2 text-xs">
                            <span className="font-bold text-[#0F172A]">{item.count}</span>
                            <span className="text-[#475569] text-xs">({item.percent}%)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 modern-card p-6 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                      Triage Decision Rate
                    </span>
                    <span className="text-xs font-bold text-teal-700">{metrics.autoRate}% Autonomous</span>
                  </div>

                  <div className="space-y-5 pt-2">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[#0F172A]">⚡ Auto-Handled</span>
                        <span className="font-extrabold text-teal-600">{metrics.autoHandled} ({metrics.autoRate}%)</span>
                      </div>
                      <div className="w-full bg-[#E2E8F0] rounded-full h-3.5 overflow-hidden">
                        <div
                          className="bg-teal-500 h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.max(metrics.autoRate, 5)}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-[#475569] block">Directly grounded in FAQ database</span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[#0F172A]">🚨 Escalated to Specialist</span>
                        <span className="font-extrabold text-rose-600">{metrics.escalated} ({metrics.escalateRate}%)</span>
                      </div>
                      <div className="w-full bg-[#E2E8F0] rounded-full h-3.5 overflow-hidden">
                        <div
                          className="bg-rose-500 h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.max(metrics.escalateRate, 5)}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-[#475569] block">Requires human supervisor care</span>
                    </div>

                    <div className="pt-4 border-t border-[#E2E8F0] space-y-2">
                      <span className="text-xs font-bold text-[#475569] uppercase tracking-wider block">
                        Sentiment Distribution
                      </span>
                      <div className="grid grid-cols-4 gap-2 text-center text-xs">
                        <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100">
                          <span className="text-[10px] font-bold text-emerald-700 block">Positive</span>
                          <span className="font-extrabold text-emerald-900">{metrics.sentimentCounts.Positive || 0}</span>
                        </div>
                        <div className="p-2 rounded-xl bg-[#F1F5F9] border border-[#E2E8F0]">
                          <span className="text-[10px] font-bold text-[#475569] block">Neutral</span>
                          <span className="font-extrabold text-[#0F172A]">{metrics.sentimentCounts.Neutral || 0}</span>
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

          {/* VIEW 3: SIMULATION STUDIO */}
          {currentNav === "simulator" && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="modern-card p-8 space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">Interactive Simulation Studio</h2>
                  <p className="text-xs text-[#475569] mt-1">
                    Test the autonomous agent against custom customer inquiries, edge cases, and policy limits.
                  </p>
                </div>

                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#475569] block mb-2">
                    Scenario Presets
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {presetExamples.map((preset, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setCustomAuthor(preset.author);
                          setCustomText(preset.text);
                        }}
                        className="px-3.5 py-1.5 rounded-full bg-[#F1F5F9] hover:bg-indigo-50 hover:text-indigo-700 text-xs font-semibold text-[#475569] border border-[#E2E8F0] transition-all cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleCustomSubmit} className="space-y-4 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-xs font-bold text-[#0F172A] mb-1">Customer Handle</label>
                      <input
                        type="text"
                        value={customAuthor}
                        onChange={e => setCustomAuthor(e.target.value)}
                        placeholder="handle"
                        className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-[#0F172A]">Support Inquiry</label>
                        <span className="text-xs font-mono text-[#475569]">{customText.length}/280</span>
                      </div>
                      <textarea
                        rows={3}
                        maxLength={280}
                        value={customText}
                        onChange={e => setCustomText(e.target.value)}
                        placeholder="Type customer message or select a preset..."
                        className="w-full p-3.5 text-xs sm:text-sm rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium resize-none leading-relaxed"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={!customText.trim() || customLoading}
                      className="px-6 py-2.5 rounded-full text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] active:scale-[0.98] disabled:opacity-50 transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed flex items-center space-x-2 border-0"
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
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="bg-white rounded-[12px] shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] border border-[#E2E8F0] overflow-hidden">
                <div className="p-6 border-b border-[#E2E8F0]">
                  <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">RAG Knowledge Base & Grounding Context</h2>
                  <p className="text-xs text-[#475569] mt-1">
                    Verified policy guidelines utilized by the autonomous reasoning agent to ground responses and avoid hallucinations.
                  </p>
                </div>

                <div>
                  <div className="p-6 border-b border-[#E2E8F0]">
                    <h3 className="text-sm font-bold text-[#0F172A] flex items-center space-x-2 mb-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                      <span>Delivery Issue Policy</span>
                    </h3>
                    <p className="text-xs text-[#475569] leading-relaxed">
                      &ldquo;We apologize for the delay. Please check your tracking link. If it&apos;s been more than 48 hours past the expected date, we will issue a replacement or refund.&rdquo;
                    </p>
                  </div>

                  <div className="p-6 border-b border-[#E2E8F0]">
                    <h3 className="text-sm font-bold text-[#0F172A] flex items-center space-x-2 mb-2">
                      <span className="w-2 h-2 rounded-full bg-teal-600"></span>
                      <span>Refund Request Policy</span>
                    </h3>
                    <p className="text-xs text-[#475569] leading-relaxed">
                      &ldquo;Refunds typically process within 3-5 business days. Please provide your order number via DM so we can process it immediately.&rdquo;
                    </p>
                  </div>

                  <div className="p-6 border-b border-[#E2E8F0]">
                    <h3 className="text-sm font-bold text-[#0F172A] flex items-center space-x-2 mb-2">
                      <span className="w-2 h-2 rounded-full bg-sky-600"></span>
                      <span>Product Inquiry Guidelines</span>
                    </h3>
                    <p className="text-xs text-[#475569] leading-relaxed">
                      &ldquo;You can find detailed product specifications on the product page. If you have specific questions, let us know!&rdquo;
                    </p>
                  </div>

                  <div className="p-6">
                    <h3 className="text-sm font-bold text-[#0F172A] flex items-center space-x-2 mb-2">
                      <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                      <span>Escalation Protocol for Complaints</span>
                    </h3>
                    <p className="text-xs text-[#475569] leading-relaxed">
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
