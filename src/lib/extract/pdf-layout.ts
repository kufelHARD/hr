// Odtwarzanie kolejności czytania tekstu z PDF na podstawie pozycji fragmentów (rekurencyjny XY-cut).
//
// CV bywają wielokolumnowe (pasek boczny + treść główna). Proste sklejanie fragmentów w kolejności
// strumienia PDF albo wierszami po współrzędnej Y miesza kolumny. Tutaj dzielimy stronę rekurencyjnie:
//   1. jeśli w regionie istnieje pionowa „szczelina” (pas bez tekstu na całej wysokości) – dzielimy na kolumny,
//   2. w przeciwnym razie dzielimy poziomo w miejscu największej przerwy między wierszami,
//   3. regiony niepodzielne składamy w wiersze.
// Wyjątek: układ „etykieta + opis” (np. daty po lewej, opis po prawej) to NIE są kolumny – rzadka lewa
// strona wyrównana z wierszami prawej jest czytana wierszami, żeby data została przy opisie.

export type TextBox = {
  text: string;
  x0: number;
  x1: number;
  /** góra / dół w układzie „od góry strony” */
  y0: number;
  y1: number;
  fontSize: number;
};

type Line = { boxes: TextBox[]; y0: number; y1: number; x0: number; x1: number; fontSize: number };

const MIN_COLUMN_GAP_FACTOR = 1.2; // szerokość szczeliny między kolumnami względem mediany rozmiaru czcionki
const MIN_COLUMN_GAP_PT = 9;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Scalanie przedziałów [a,b] → lista rozłącznych przedziałów posortowanych rosnąco. */
function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Grupowanie fragmentów w wiersze (wspólna linia bazowa). */
export function groupLines(boxes: TextBox[]): Line[] {
  const sorted = [...boxes].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const lines: Line[] = [];
  for (const box of sorted) {
    const h = box.y1 - box.y0;
    const line = lines.find((l) => {
      const overlap = Math.min(l.y1, box.y1) - Math.max(l.y0, box.y0);
      return overlap > 0.5 * Math.min(h, l.y1 - l.y0);
    });
    if (line) {
      line.boxes.push(box);
      line.y0 = Math.min(line.y0, box.y0);
      line.y1 = Math.max(line.y1, box.y1);
      line.x0 = Math.min(line.x0, box.x0);
      line.x1 = Math.max(line.x1, box.x1);
      line.fontSize = Math.max(line.fontSize, box.fontSize);
    } else {
      lines.push({ boxes: [box], y0: box.y0, y1: box.y1, x0: box.x0, x1: box.x1, fontSize: box.fontSize });
    }
  }
  for (const l of lines) l.boxes.sort((a, b) => a.x0 - b.x0);
  return lines.sort((a, b) => a.y0 - b.y0);
}

function lineText(line: Line): string {
  let out = "";
  let prev: TextBox | null = null;
  for (const b of line.boxes) {
    if (prev) {
      const gap = b.x0 - prev.x1;
      const needsSpace = gap > 0.15 * Math.max(b.fontSize, 1) && !out.endsWith(" ") && !b.text.startsWith(" ");
      // szeroka przerwa w wierszu (np. tabulator) – wyraźny separator
      if (gap > 2.5 * Math.max(b.fontSize, 1)) out += out.endsWith(" ") ? "  " : "   ";
      else if (needsSpace) out += " ";
    }
    out += b.text;
    prev = b;
  }
  return out.replace(/\s+$/g, "");
}

/** Czy podział pionowy to w rzeczywistości układ „etykieta | opis” (np. daty przy doświadczeniu)? */
function looksLikeLabelColumn(left: TextBox[], right: TextBox[]): boolean {
  const L = groupLines(left);
  const R = groupLines(right);
  const [sparse, dense] = L.length <= R.length ? [L, R] : [R, L];
  if (sparse.length === 0) return true;
  const ratio = sparse.length / dense.length;
  if (ratio >= 0.45) return false;
  const aligned = sparse.filter((s) =>
    dense.some((d) => Math.abs((d.y0 + d.y1) / 2 - (s.y0 + s.y1) / 2) < 0.6 * Math.max(s.fontSize, d.fontSize)),
  ).length;
  return aligned / sparse.length >= 0.7;
}

function findVerticalCut(boxes: TextBox[], medFont: number): number | null {
  const intervals = mergeIntervals(boxes.map((b) => [b.x0, b.x1]));
  if (intervals.length < 2) return null;
  const minGap = Math.max(MIN_COLUMN_GAP_PT, MIN_COLUMN_GAP_FACTOR * medFont);
  let best: { x: number; width: number } | null = null;
  for (let i = 0; i < intervals.length - 1; i++) {
    const width = intervals[i + 1][0] - intervals[i][1];
    if (width < minGap) continue;
    const x = (intervals[i][1] + intervals[i + 1][0]) / 2;
    const left = boxes.filter((b) => b.x1 <= x);
    const right = boxes.filter((b) => b.x0 >= x);
    if (groupLines(left).length < 2 || groupLines(right).length < 2) continue;
    if (looksLikeLabelColumn(left, right)) continue;
    if (!best || width > best.width) best = { x, width };
  }
  return best ? best.x : null;
}

function findHorizontalCut(boxes: TextBox[]): number | null {
  const intervals = mergeIntervals(boxes.map((b) => [b.y0, b.y1]));
  if (intervals.length < 2) return null;
  let best: { y: number; gap: number } | null = null;
  for (let i = 0; i < intervals.length - 1; i++) {
    const gap = intervals[i + 1][0] - intervals[i][1];
    if (gap <= 0) continue;
    if (!best || gap > best.gap) best = { y: (intervals[i][1] + intervals[i + 1][0]) / 2, gap };
  }
  return best ? best.y : null;
}

type Block = { lines: Line[] };

function xyCut(boxes: TextBox[], medFont: number, out: Block[], depth = 0) {
  if (boxes.length === 0) return;
  if (depth > 60) {
    out.push({ lines: groupLines(boxes) });
    return;
  }
  const vx = findVerticalCut(boxes, medFont);
  if (vx !== null) {
    xyCut(boxes.filter((b) => b.x1 <= vx), medFont, out, depth + 1);
    xyCut(boxes.filter((b) => b.x1 > vx), medFont, out, depth + 1);
    return;
  }
  // brak kolumn – jeśli region to jeden wiersz albo zwarty akapit, nie ma czego dzielić
  const lines = groupLines(boxes);
  if (lines.length <= 1) {
    out.push({ lines });
    return;
  }
  // Dzielimy poziomo tylko tam, gdzie po podziale może pojawić się układ kolumnowy;
  // inaczej region czytamy wierszami (szybciej i stabilniej).
  const hy = findHorizontalCut(boxes);
  if (hy === null) {
    out.push({ lines });
    return;
  }
  const top = boxes.filter((b) => (b.y0 + b.y1) / 2 < hy);
  const bottom = boxes.filter((b) => (b.y0 + b.y1) / 2 >= hy);
  if (top.length === 0 || bottom.length === 0) {
    out.push({ lines });
    return;
  }
  const topHasCols = hasColumnsSomewhere(top, medFont);
  const bottomHasCols = hasColumnsSomewhere(bottom, medFont);
  if (!topHasCols && !bottomHasCols) {
    out.push({ lines });
    return;
  }
  xyCut(top, medFont, out, depth + 1);
  xyCut(bottom, medFont, out, depth + 1);
}

/** Czy w regionie (lub w jego poziomych podregionach) da się znaleźć kolumny. */
function hasColumnsSomewhere(boxes: TextBox[], medFont: number, depth = 0): boolean {
  if (boxes.length < 4 || depth > 30) return false;
  if (findVerticalCut(boxes, medFont) !== null) return true;
  const hy = findHorizontalCut(boxes);
  if (hy === null) return false;
  const top = boxes.filter((b) => (b.y0 + b.y1) / 2 < hy);
  const bottom = boxes.filter((b) => (b.y0 + b.y1) / 2 >= hy);
  if (top.length === 0 || bottom.length === 0) return false;
  return hasColumnsSomewhere(top, medFont, depth + 1) || hasColumnsSomewhere(bottom, medFont, depth + 1);
}

/**
 * Składa tekst strony w kolejności czytania. Wiersze z wyraźnie większą czcionką oznacza jako nagłówki (##),
 * między blokami i akapitami wstawia pustą linię.
 */
export function layoutPage(boxes: TextBox[]): string {
  const clean = boxes.filter((b) => b.text.trim().length > 0 && b.x1 > b.x0 - 0.01);
  if (clean.length === 0) return "";
  const medFont = median(clean.map((b) => b.fontSize)) || 10;
  const blocks: Block[] = [];
  xyCut(clean, medFont, blocks);

  const parts: string[] = [];
  for (const block of blocks) {
    const out: string[] = [];
    let prev: Line | null = null;
    const lineHeights = block.lines.map((l) => l.y1 - l.y0);
    const typical = median(lineHeights) || medFont;
    for (const line of block.lines) {
      const text = lineText(line).trim();
      if (!text) continue;
      if (prev && line.y0 - prev.y1 > 0.9 * typical) out.push("");
      const isHeading = line.fontSize >= medFont * 1.25 && text.length < 80;
      out.push(isHeading ? `## ${text}` : text);
      prev = line;
    }
    if (out.length) parts.push(out.join("\n"));
  }
  return parts.join("\n\n");
}
