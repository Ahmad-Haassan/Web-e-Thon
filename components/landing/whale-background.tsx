import type { CSSProperties } from "react";

/**
 * Ambient "ink ocean" backdrop for the home page.
 *
 * Drifting whale silhouettes, rising bubbles and slow current lines — all
 * rendered in the portal's academic forest-green palette at low opacity so the
 * hero copy stays perfectly legible. Motion is CSS-only (GPU transforms) and
 * is switched off under `prefers-reduced-motion`.
 */

type WhaleTone = "deep" | "mid" | "light";

const TONES: Record<WhaleTone, { body: string; belly: string; fin: string }> = {
  deep: { body: "#0d4d31", belly: "#168a57", fin: "#0a3d27" },
  mid: { body: "#168a57", belly: "#3aa775", fin: "#0f6b45" },
  light: { body: "#3aa775", belly: "#7cc4a2", fin: "#168a57" },
};

function Whale({ tone }: { tone: WhaleTone }) {
  const palette = TONES[tone];
  return (
    <svg
      viewBox="0 0 240 150"
      className="h-auto w-full overflow-visible"
      fill="none"
      aria-hidden="true"
    >
      {/* Tail flukes */}
      <path
        d="M164 62C180 46 199 38 214 42C204 52 197 65 199 78C209 74 218 67 224 58C222 81 208 99 191 110C183 94 173 77 164 62Z"
        fill={palette.fin}
      />
      {/* Dorsal fin */}
      <path
        d="M118 31C124 17 138 11 149 15C140 23 135 32 135 42Z"
        fill={palette.fin}
      />
      {/* Main body */}
      <path
        d="M10 73C12 41 44 22 84 24C122 26 152 44 168 69C158 92 127 112 86 112C46 112 14 98 10 73Z"
        fill={palette.body}
      />
      {/* Pectoral fin */}
      <path
        d="M77 104C81 121 98 131 115 129C102 118 94 110 92 99Z"
        fill={palette.fin}
      />
      {/* Belly light */}
      <path
        d="M52 100C78 112 112 108 134 93C124 106 104 114 84 113C70 113 59 108 52 100Z"
        fill={palette.belly}
        opacity="0.55"
      />
      {/* Belly grooves */}
      <path
        d="M52 94C76 103 106 100 126 89"
        stroke={palette.belly}
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.35"
      />
      {/* Mouth line */}
      <path
        d="M11 79C23 88 39 90 52 87"
        stroke={palette.belly}
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.75"
      />
      {/* Eye */}
      <circle cx="40" cy="63" r="3.2" fill="#eef7f2" />
    </svg>
  );
}

type WhaleSpec = {
  tone: WhaleTone;
  top: string;
  width: string;
  opacity: number;
  duration: number;
  delay: number;
  reverse?: boolean;
};

const WHALES: WhaleSpec[] = [
  {
    tone: "deep",
    top: "16%",
    width: "clamp(200px, 26vw, 380px)",
    opacity: 0.12,
    duration: 96,
    delay: -30,
  },
  {
    tone: "mid",
    top: "63%",
    width: "clamp(160px, 18vw, 270px)",
    opacity: 0.1,
    duration: 74,
    delay: -52,
    reverse: true,
  },
  {
    tone: "light",
    top: "42%",
    width: "clamp(110px, 12vw, 175px)",
    opacity: 0.09,
    duration: 118,
    delay: -8,
  },
];

type BubbleSpec = {
  left: string;
  bottom: string;
  size: number;
  duration: number;
  delay: number;
  drift: number;
};

const BUBBLES: BubbleSpec[] = [
  { left: "6%", bottom: "8%", size: 7, duration: 17, delay: 0, drift: 16 },
  { left: "14%", bottom: "22%", size: 4, duration: 13, delay: 3, drift: -10 },
  { left: "23%", bottom: "4%", size: 9, duration: 21, delay: 7, drift: 12 },
  { left: "31%", bottom: "30%", size: 5, duration: 15, delay: 1, drift: -14 },
  { left: "44%", bottom: "10%", size: 6, duration: 19, delay: 9, drift: 18 },
  { left: "53%", bottom: "26%", size: 4, duration: 14, delay: 5, drift: -8 },
  { left: "62%", bottom: "6%", size: 8, duration: 23, delay: 2, drift: 10 },
  { left: "71%", bottom: "20%", size: 5, duration: 16, delay: 11, drift: -16 },
  { left: "79%", bottom: "12%", size: 6, duration: 18, delay: 6, drift: 14 },
  { left: "86%", bottom: "28%", size: 4, duration: 12, delay: 8, drift: -9 },
  { left: "92%", bottom: "5%", size: 9, duration: 24, delay: 4, drift: 12 },
  { left: "97%", bottom: "18%", size: 5, duration: 15, delay: 13, drift: -12 },
];

export function WhaleBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 select-none overflow-hidden"
    >
      {/* Slow current lines */}
      <svg
        className="absolute inset-x-0 bottom-0 h-1/2 w-full"
        viewBox="0 0 1440 420"
        preserveAspectRatio="none"
        fill="none"
      >
        <path
          className="whale-current"
          d="M-40 300C220 250 430 336 700 292C960 250 1180 318 1480 268"
          stroke="#bfe3d2"
          strokeWidth="1.5"
          opacity="0.55"
        />
        <path
          className="whale-current whale-current--slow"
          d="M-40 352C260 312 470 384 740 344C1010 306 1220 366 1480 330"
          stroke="#cfeade"
          strokeWidth="1.2"
          opacity="0.45"
        />
      </svg>

      {WHALES.map((whale, index) => (
        <div
          key={`whale-${index}`}
          className={`whale ${whale.reverse ? "whale--reverse" : ""}`}
          style={
            {
              top: whale.top,
              width: whale.width,
              opacity: whale.opacity,
              animationDuration: `${whale.duration}s`,
              animationDelay: `${whale.delay}s`,
            } as CSSProperties
          }
        >
          <div
            className="whale__body"
            style={{ animationDuration: `${6.5 + index * 1.6}s` }}
          >
            <Whale tone={whale.tone} />
          </div>
        </div>
      ))}

      {BUBBLES.map((bubble, index) => (
        <span
          key={`bubble-${index}`}
          className="whale-bubble"
          style={
            {
              left: bubble.left,
              bottom: bubble.bottom,
              width: bubble.size,
              height: bubble.size,
              animationDuration: `${bubble.duration}s`,
              animationDelay: `${bubble.delay}s`,
              "--drift": `${bubble.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
