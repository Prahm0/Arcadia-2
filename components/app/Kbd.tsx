/** A keyboard shortcut, one keycap per key: <Kbd keys={["G", "T"]} />. */
export default function Kbd({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1" aria-label={keys.join(" then ")}>
      {keys.map((key, index) => (
        <kbd
          key={index}
          className="grid h-[18px] min-w-[18px] place-items-center rounded px-1 font-mono text-[10.5px] leading-none"
          style={{
            background: "var(--app-surface-soft)",
            boxShadow: "var(--elev-inset)",
            color: "var(--app-text-muted)",
          }}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
