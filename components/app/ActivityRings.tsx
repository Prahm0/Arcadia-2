export interface ActivityRing {
  key: string;
  colour: string;
  ratio: number;
  label: string;
  value: string;
  of: string;
}

/** Shared progress rings for Progress and the persistent desktop sidebar. */
export default function ActivityRings({
  rings,
  size = 168,
  stroke = 18,
  gap = 4,
  className = "",
}: {
  rings: ActivityRing[];
  size?: number;
  stroke?: number;
  gap?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={rings.map((ring) => `${ring.label} ${ring.value} ${ring.of}`).join(", ")}
      className={`shrink-0 -rotate-90 ${className}`}
    >
      {rings.map((ring, index) => {
        const r = size / 2 - stroke / 2 - index * (stroke + gap);
        const c = 2 * Math.PI * r;
        const ratio = Math.max(0, Math.min(1, ring.ratio));
        return (
          <g key={ring.key}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ring.colour} strokeOpacity={0.18} strokeWidth={stroke} />
            <circle
              className="progress-ring-fill"
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={ring.colour}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={ratio > 0 ? c * (1 - Math.max(ratio, 0.02)) : c}
              style={{ ["--ring-c" as string]: `${c}`, animationDelay: `${index * 120}ms` }}
            />
          </g>
        );
      })}
    </svg>
  );
}
