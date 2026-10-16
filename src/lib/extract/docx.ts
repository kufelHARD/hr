import mammoth from "mammoth";
import JSZip from "jszip";
import TurndownService from "turndown";

// DOCX → Markdown z zachowaniem nagłówków, list, pogrubień i tabel.
// Nie zakładamy żadnych konkretnych nazw sekcji – strukturę interpretuje AI.

const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Tytuł'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Podtytuł'] => h2:fresh",
];

function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    emDelimiter: "_",
    strongDelimiter: "**",
  });
  td.remove(["img", "style", "script"]);
  // puste kotwice/linki z mammoth (zakładki) – zostaw sam tekst
  td.addRule("anchors", {
    filter: (node) => node.nodeName === "A" && !node.getAttribute("href")?.startsWith("http"),
    replacement: (content) => content,
  });

  td.addRule("table", {
    filter: "table",
    replacement: (_content, node) => {
      const rows = Array.from((node as HTMLTableElement).querySelectorAll("tr")).filter(
        // tylko wiersze tej tabeli, bez zagnieżdżonych
        (tr) => tr.closest("table") === node,
      );
      const grid = rows.map((tr) =>
        Array.from(tr.children)
          .filter((c) => c.nodeName === "TD" || c.nodeName === "TH")
          .map((cell) => td.turndown((cell as HTMLElement).innerHTML).trim()),
      );
      const nonEmpty = grid.map((r) => r.filter((c) => c.length > 0)).filter((r) => r.length > 0);
      if (nonEmpty.length === 0) return "";
      const multiline = nonEmpty.some((r) => r.some((c) => c.includes("\n")));
      const cols = Math.max(...grid.map((r) => r.length));
      if (multiline || cols === 1) {
        // tabela układu strony (częste w CV i ofertach) – komórki jako kolejne bloki
        return "\n\n" + nonEmpty.map((r) => r.join("\n\n")).join("\n\n") + "\n\n";
      }
      // zwykła tabela danych – Markdown
      const esc = (s: string) => s.replace(/\|/g, "\\|");
      const lines = grid.map((r) => `| ${Array.from({ length: cols }, (_, i) => esc(r[i] ?? "")).join(" | ")} |`);
      lines.splice(1, 0, `| ${Array.from({ length: cols }, () => "---").join(" | ")} |`);
      return "\n\n" + lines.join("\n") + "\n\n";
    },
  });
  return td;
}

/** Tekst z nagłówków/stopek Worda (mammoth je pomija, a CV często mają tam imię i kontakt). */
export async function headerFooterText(buffer: Buffer): Promise<string[]> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const out: string[] = [];
    const files = Object.keys(zip.files)
      .filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n))
      .sort();
    for (const name of files) {
      const xml = await zip.files[name].async("string");
      const paragraphs = xml.split(/<\/w:p>/).map((p) =>
        Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g))
          .map((m) => m[1])
          .join("")
          .trim(),
      );
      const text = paragraphs.filter(Boolean).join("\n");
      if (text && !/^(strona|page)?\s*\d*\s*$/i.test(text)) out.push(decodeXml(text));
    }
    return Array.from(new Set(out));
  } catch {
    return [];
  }
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function cleanMarkdown(md: string): string {
  return md
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractDocx(buffer: Buffer): Promise<{ text: string; warnings: string[] }> {
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: STYLE_MAP,
      convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
    },
  );
  const markdown = cleanMarkdown(createTurndown().turndown(result.value));
  const hf = await headerFooterText(buffer);
  const parts = [];
  if (hf.length) parts.push(`[Nagłówek/stopka dokumentu]\n${hf.join("\n")}`);
  parts.push(markdown);
  const warnings = result.messages
    .filter((m) => m.type === "error")
    .map((m) => `Ostrzeżenie konwersji DOCX: ${m.message}`);
  return { text: parts.join("\n\n"), warnings };
}
