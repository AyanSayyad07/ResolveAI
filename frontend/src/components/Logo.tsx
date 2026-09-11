import React from "react";

interface LogoProps {
  size?: number;
  className?: string;
  showWordmark?: boolean;
  wordmarkClassName?: string;
}

export default function ResolveLogo({
  size = 36,
  className = "",
  showWordmark = false,
  wordmarkClassName = ""
}: LogoProps) {
  const iconSize = size;

  return (
    <div className={`inline-flex items-center gap-3 ${className}`} style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
      {/* Precision Vector Emblem */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          minWidth: iconSize,
          minHeight: iconSize,
          maxWidth: iconSize,
          maxHeight: iconSize,
          filter: "drop-shadow(0 2px 6px rgba(79, 70, 229, 0.25))"
        }}
      >
        <defs>
          {/* Main Vibrant Indigo -> Cyan Gradient */}
          <linearGradient id="resolve-grad-main" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4F46E5" />
            <stop offset="50%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#0D9488" />
          </linearGradient>

          {/* Accent Ribbon Gradient */}
          <linearGradient id="resolve-grad-ribbon" x1="12" y1="8" x2="38" y2="38" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#E0E7FF" stopOpacity="0.85" />
          </linearGradient>

          {/* Glow / Depth Overlay */}
          <linearGradient id="resolve-grad-glow" x1="24" y1="6" x2="24" y2="42" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0.1" />
          </linearGradient>

          {/* Spark Node Gradient */}
          <linearGradient id="resolve-spark-grad" x1="28" y1="20" x2="38" y2="30" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#A5F3FC" />
          </linearGradient>

          {/* Background Rounded Shield Shadow */}
          <filter id="resolve-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0F172A" floodOpacity="0.12" />
          </filter>
        </defs>

        {/* 1. Base Squircle / Rounded Enclosure */}
        <rect
          x="3"
          y="3"
          width="42"
          height="42"
          rx="12"
          fill="url(#resolve-grad-main)"
        />

        {/* 2. Ambient Internal Glass Sheen */}
        <rect
          x="4"
          y="4"
          width="40"
          height="20"
          rx="11"
          fill="url(#resolve-grad-glow)"
          opacity="0.35"
        />

        {/* 3. Subtle Inner Outline */}
        <rect
          x="3.75"
          y="3.75"
          width="40.5"
          height="40.5"
          rx="11.25"
          stroke="#FFFFFF"
          strokeOpacity="0.22"
          strokeWidth="1.5"
        />

        {/* 4. The Iconic "R" Resolution Vector Ribbon */}
        {/* Left vertical pillar */}
        <path
          d="M14 13C14 11.8954 14.8954 11 16 11H18C19.1046 11 20 11.8954 20 13V35C20 36.1046 19.1046 37 18 37H16C14.8954 37 14 36.1046 14 35V13Z"
          fill="url(#resolve-grad-ribbon)"
        />

        {/* Flowing Upper Loop (Loop of the 'R') */}
        <path
          d="M19 11H27C31.4183 11 35 14.5817 35 19C35 23.4183 31.4183 27 27 27H19V11Z"
          fill="url(#resolve-grad-ribbon)"
          fillOpacity="0.95"
        />
        {/* Cutout for loop hollow */}
        <path
          d="M20 16.5H26.5C27.8807 16.5 29 17.6193 29 19C29 20.3807 27.8807 21.5 26.5 21.5H20V16.5Z"
          fill="url(#resolve-grad-main)"
        />

        {/* Dynamic Forward Resolution Kick / Neural Vector */}
        <path
          d="M24 24.5L33.2 35.5C33.7 36.1 34.6 36.4 35.4 36.2C36.4 35.9 36.8 34.8 36.3 34L28.2 24.5H24Z"
          fill="url(#resolve-grad-ribbon)"
        />

        {/* 5. AI Resolution Pulse / Spark Diamond */}
        <path
          d="M32 12L33.2 15.8L37 17L33.2 18.2L32 22L30.8 18.2L27 17L30.8 15.8L32 12Z"
          fill="url(#resolve-spark-grad)"
          style={{ filter: "drop-shadow(0 0 4px rgba(255, 255, 255, 0.9))" }}
        />

        {/* Center Neural Node Connection Dot */}
        <circle cx="20" cy="24" r="2" fill="#4F46E5" />
      </svg>

      {/* Optional Matching Modern Wordmark */}
      {showWordmark && (
        <div className={`flex flex-col ${wordmarkClassName}`}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "17px", fontWeight: "800", letterSpacing: "-0.03em", color: "#0F172A", lineHeight: 1.1 }}>
              Resolve<span style={{
                background: "linear-gradient(135deg, #4F46E5 0%, #0D9488 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent"
              }}>AI</span>
            </span>
            <span style={{
              fontSize: "10px",
              fontWeight: "700",
              padding: "1px 6px",
              borderRadius: "6px",
              backgroundColor: "#EEF2FF",
              color: "#4F46E5",
              border: "1px solid #E0E7FF",
              lineHeight: "14px"
            }}>
              v2.5
            </span>
          </div>
          <span style={{ fontSize: "11px", fontWeight: "500", color: "#64748B", letterSpacing: "-0.01em" }}>
            Autonomous Support Intelligence
          </span>
        </div>
      )}
    </div>
  );
}
