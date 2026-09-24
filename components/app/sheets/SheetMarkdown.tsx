import type { ReactNode } from "react";

/**
 * The small slice of Markdown a summary sheet needs: bullets, numbered
 * lists, tables, "### " subheadings, **bold**, *italic*, `code` and $maths$.
 * Built as React nodes (never HTML strings), so nothing typed can inject.
 */
export default function SheetMarkdown({ text }: { text: string }) {
  const blocks = toBlocks(text);
  return (
    <div className="sheet-md flex flex-col gap-2 text-[13.5px] leading-[1.55]" style={{ color: "var(--app-text-soft)" }}>
      {blocks.map((block, index) => {
        if (block.kind === "ul" || block.kind === "ol") {
          const List = block.kind;
          return (
            <List key={index} className={(block.kind === "ul" ? "list-disc" : "list-decimal") + " flex flex-col gap-0.5 pl-5"}>
              {block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}
            </List>
          );
        }
        if (block.kind === "table") {
          const [head, ...rows] = block.rows;
          return (
            <div key={index} className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                {block.header ? (
                  <thead>
                    <tr>{head.map((cell, i) => <th key={i} className="border-b px-2 py-1 text-left font-semibold" style={{ borderColor: "var(--app-border-strong)", color: "var(--app-text)" }}>{inline(cell)}</th>)}</tr>
                  </thead>
                ) : null}
                <tbody>
                  {(block.header ? rows : block.rows).map((row, r) => (
                    <tr key={r}>{row.map((cell, i) => <td key={i} className="border-b px-2 py-1 align-top" style={{ borderColor: "var(--app-border)" }}>{inline(cell)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.kind === "h") {
          return <p key={index} className="mt-1 text-[13px] font-semibold" style={{ color: "var(--app-text)" }}>{inline(block.text)}</p>;
        }
        return <p key={index}>{inline(block.text)}</p>;
      })}
    </div>
  );
}

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "table"; rows: string[][]; header: boolean };

const RULE = /^\s*\|?\s*:?-{3,}/;

function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const last = blocks[blocks.length - 1];
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet) {
      if (last?.kind === "ul") last.items.push(bullet[1]);
      else blocks.push({ kind: "ul", items: [bullet[1]] });
    } else if (numbered) {
      if (last?.kind === "ol") last.items.push(numbered[1]);
      else blocks.push({ kind: "ol", items: [numbered[1]] });
    } else if (line.startsWith("|")) {
      if (RULE.test(line)) {
        if (last?.kind === "table" && last.rows.length === 1) last.header = true;
        continue;
      }
      const cells = line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
      if (last?.kind === "table") last.rows.push(cells);
      else blocks.push({ kind: "table", rows: [cells], header: false });
    } else if (line.startsWith("#")) {
      blocks.push({ kind: "h", text: line.replace(/^#+\s*/, "") });
    } else if (last?.kind === "p" && lines[i - 1]?.trim()) {
      last.text += ` ${line}`;
    } else {
      blocks.push({ kind: "p", text: line });
    }
  }
  return blocks;
}

/** **bold**, *italic*, `code` and $maths$, left to right. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\$[^$]+\$|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > at) out.push(text.slice(at, index));
    const token = match[0];
    const key = `${index}`;
    if (token.startsWith("**")) out.push(<strong key={key} style={{ color: "var(--app-text)" }}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("$")) out.push(<MathText key={key} source={token.slice(1, -1)} />);
    else if (token.startsWith("`")) out.push(<code key={key} className="rounded px-1 text-[12.5px]" style={{ background: "var(--app-surface-soft)" }}>{token.slice(1, -1)}</code>);
    else out.push(<em key={key}>{token.slice(1, -1)}</em>);
    at = index + token.length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

const SYMBOLS: Record<string, string> = {
  times: "×", div: "÷", pm: "±", cdot: "·", leq: "≤", geq: "≥", le: "≤", ge: "≥", neq: "≠", approx: "≈",
  infty: "∞", to: "→", rightarrow: "→", sqrt: "√", degree: "°", circ: "°", propto: "∝", sum: "Σ", int: "∫", partial: "∂",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", epsilon: "ε", theta: "θ", lambda: "λ", mu: "μ",
  pi: "π", rho: "ρ", sigma: "σ", Sigma: "Σ", tau: "τ", phi: "φ", omega: "ω", Omega: "Ω",
};

/**
 * Maths in a serif italic, with ^ and _ as real super/subscripts, \frac{a}{b}
 * as a/b and the common LaTeX names as symbols. Not a typesetter, but a
 * formula sheet reads cleanly without shipping one.
 */
function MathText({ source }: { source: string }) {
  const text = source
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)")
    .replace(/\\(?:text|mathrm)\{([^{}]*)\}/g, "$1")
    .replace(/\\([A-Za-z]+)/g, (whole, name: string) => SYMBOLS[name] ?? whole)
    .replace(/\(([A-Za-z0-9.]+)\)\/\(([A-Za-z0-9.]+)\)/g, "$1/$2");
  const parts: ReactNode[] = [];
  // Like LaTeX, an unbraced script takes one character (H_2O), except a
  // run of digits (10^23 reads as students mean it).
  const script = /([\^_])(\{[^{}]*\}|-?[0-9]+|[A-Za-z+\-−])/g;
  let at = 0;
  for (const match of text.matchAll(script)) {
    const index = match.index ?? 0;
    if (index > at) parts.push(text.slice(at, index));
    const body = match[2].replace(/^\{|\}$/g, "");
    parts.push(match[1] === "^" ? <sup key={index}>{body}</sup> : <sub key={index}>{body}</sub>);
    at = index + match[0].length;
  }
  if (at < text.length) parts.push(text.slice(at));
  return (
    <span className="whitespace-nowrap font-serif italic" style={{ color: "var(--app-text)" }}>
      {parts}
    </span>
  );
}
