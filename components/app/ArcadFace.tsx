/**
 * Arcad's face, drawn over the face-less orb body (arcad-orb-body.png) in the
 * artwork's own 1254×1254 coordinate space, so it sits exactly where the brand
 * mark's face does. Every feature has a few variants (open / happy / closed /
 * wink eyes; smile / o / hmm / closed mouth) and `data-face` picks which show.
 * All motion — blinking, glancing, following the cursor via --lx/--ly — lives
 * in globals.css under `.arcad-face`.
 */

export type ArcadExpression = "idle" | "happy" | "wink" | "think" | "excited" | "surprised" | "sleep";

const INK = "#1b0a35";
const MOUTH = "#2a0f45";

function Eye({ x, y, tilt, wink = false }: { x: number; y: number; tilt: number; wink?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt})`}>
      <g className="arcad-face-eye-open">
        <ellipse rx="44" ry="58" fill="#1d0940" stroke={INK} strokeWidth="9" />
        <ellipse cx="4" cy="20" rx="30" ry="28" fill="#5b2aa8" opacity="0.75" />
        <circle cx="12" cy="-30" r="14" fill="#fff" />
        <circle cx="-14" cy="24" r="6" fill="#fff" opacity="0.55" />
      </g>
      <path className="arcad-face-eye-happy" d="M-42 14 Q0 -42 42 14" fill="none" stroke={INK} strokeWidth="20" strokeLinecap="round" />
      <path className="arcad-face-eye-closed" d="M-42 -6 Q0 30 42 -6" fill="none" stroke={INK} strokeWidth="18" strokeLinecap="round" />
      {wink ? (
        <path
          className="arcad-face-eye-wink"
          d="M56 -30 Q8 -20 -40 4 Q8 22 50 42"
          fill="none"
          stroke={INK}
          strokeWidth="22"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </g>
  );
}

export default function ArcadFace({ expression }: { expression: ArcadExpression }) {
  return (
    <svg className="arcad-face" data-face={expression} viewBox="0 0 1254 1254" aria-hidden="true">
      <g className="arcad-face-all">
        <g className="arcad-face-blush">
          <ellipse cx="372" cy="668" rx="44" ry="22" fill="#ff7ab8" />
          <ellipse cx="724" cy="716" rx="40" ry="20" fill="#ff7ab8" />
        </g>
        <g className="arcad-face-eyes">
          <Eye x={404} y={577} tilt={-8} />
          <Eye x={694} y={634} tilt={10} wink />
        </g>
        <g transform="translate(538 674) rotate(6)">
          <g className="arcad-face-mouth-smile">
            <path
              d="M-46 -24 Q0 -8 46 -20 Q42 36 0 36 Q-40 36 -46 -24Z"
              fill={MOUTH}
              stroke={INK}
              strokeWidth="9"
              strokeLinejoin="round"
            />
            <path d="M-24 28 Q0 6 26 26 Q2 36 -24 28Z" fill="#e0609f" />
          </g>
          <ellipse className="arcad-face-mouth-o" rx="16" ry="19" fill={MOUTH} stroke={INK} strokeWidth="9" />
          <path className="arcad-face-mouth-hmm" d="M-30 4 Q-14 -8 2 2 T34 -2" fill="none" stroke={INK} strokeWidth="12" strokeLinecap="round" />
          <path className="arcad-face-mouth-closed" d="M-30 -4 Q0 20 30 -6" fill="none" stroke={INK} strokeWidth="13" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}
