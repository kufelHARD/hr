import type { ReactNode } from "react";

// Minimalne wyświetlanie Markdown (nagłówki, listy, pogrubienia, akapity) – treść ofert i klauzuli RODO.

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i}>{p.slice(2, -2)}</strong>
    ) : p.startsWith("_") && p.endsWith("_") && p.length > 2 ? (
      <em key={i}>{p.slice(1, -1)}</em>
    ) : (
      p
    ),
  );
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let ordered = false;
  const flush = () => {
    if (!list.length) return;
    const items = list.map((l, i) => <li key={i}>{inline(l)}</li>);
    blocks.push(ordered ? <ol key={blocks.length} className="list-decimal space-y-1 pl-5">{items}</ol> : <ul key={blocks.length} className="list-disc space-y-1 pl-5">{items}</ul>);
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const num = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || num) {
      if (list.length && ordered !== Boolean(num)) flush();
      ordered = Boolean(num);
      list.push((bullet ?? num)![1]);
      continue;
    }
    flush();
    if (!line || /^\|?\s*-{3,}/.test(line)) continue;
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      blocks.push(
        <p key={blocks.length} className={level <= 2 ? "pt-2 text-lg font-semibold text-slate-900" : "pt-1 font-semibold text-slate-900"}>
          {inline(h[2])}
        </p>,
      );
    } else if (line.startsWith(">")) {
      blocks.push(<p key={blocks.length} className="rounded-md bg-amber-50 px-3 py-2 text-amber-900">{inline(line.replace(/^>\s*/, ""))}</p>);
    } else if (line.startsWith("|")) {
      blocks.push(<p key={blocks.length}>{inline(line.split("|").map((c) => c.trim()).filter(Boolean).join(" – "))}</p>);
    } else {
      blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  flush();
  return <div className={className ?? "space-y-2"}>{blocks}</div>;
}
