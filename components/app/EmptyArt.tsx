/** A small friendly picture for empty places: a gold sun coming up over sage hills. */
export default function EmptyArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 84" width="160" height="84" aria-hidden="true" className={className}>
      <circle cx="80" cy="58" r="24" fill="#e2b84f" opacity="0.9" />
      <path d="M58 30l-4-6M80 22v-8M102 30l4-6M48 44l-7-3M112 44l7-3" stroke="#e2b84f" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M0 84c20-22 42-30 66-22s40 6 56-6 30-8 38 2v26z" fill="var(--app-accent)" opacity="0.85" />
      <path d="M0 84c30-14 58-16 84-8s52 6 76-4v12z" fill="var(--app-accent)" />
      <path d="M128 18c1 5 3 7 8 8-5 1-7 3-8 8-1-5-3-7-8-8 5-1 7-3 8-8z" fill="#e2b84f" />
    </svg>
  );
}
