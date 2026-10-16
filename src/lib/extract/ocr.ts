import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { packageDir } from "./pdf";

// OCR (tesseract.js, język polski + angielski). Dane językowe pochodzą z pakietów npm
// @tesseract.js-data/pol i @tesseract.js-data/eng – OCR działa bez dostępu do internetu.

const LANGS = ["pol", "eng"] as const;

let langDirPromise: Promise<string> | null = null;

function prepareLangDir(): Promise<string> {
  langDirPromise ??= (async () => {
    const dir = path.join(process.cwd(), "node_modules", ".cache", "porownywarka-ocr");
    await fs.mkdir(dir, { recursive: true });
    for (const lang of LANGS) {
      const target = path.join(dir, `${lang}.traineddata.gz`);
      try {
        await fs.access(target);
      } catch {
        const pkgDir = packageDir(`@tesseract.js-data/${lang}`);
        await fs.copyFile(path.join(pkgDir, "4.0.0_best_int", `${lang}.traineddata.gz`), target);
      }
    }
    return dir;
  })().catch((e) => {
    langDirPromise = null;
    throw e;
  });
  return langDirPromise;
}

type OcrWorker = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;

// Pula wątków OCR: skany rozpoznawane są równolegle na kilku rdzeniach (env.ocrWorkers).
// Wątki tworzone są przy pierwszej potrzebie i zostają w pamięci (każdy ok. 100 MB).
const pool = { all: [] as OcrWorker[], free: [] as OcrWorker[], creating: 0, waiting: [] as Array<(w: OcrWorker) => void> };

async function createOne(): Promise<OcrWorker> {
  const { createWorker } = await import("tesseract.js");
  const langPath = await prepareLangDir();
  return createWorker([...LANGS], 1, { langPath, cachePath: langPath, gzip: true });
}

async function acquire(): Promise<OcrWorker> {
  const free = pool.free.pop();
  if (free) return free;
  if (pool.all.length + pool.creating < env.ocrWorkers) {
    pool.creating++;
    try {
      const w = await createOne();
      pool.all.push(w);
      return w;
    } finally {
      pool.creating--;
    }
  }
  return new Promise((resolve) => pool.waiting.push(resolve));
}

function release(w: OcrWorker) {
  const next = pool.waiting.shift();
  if (next) next(w);
  else pool.free.push(w);
}

/** Rozpoznaje tekst na obrazie (PNG). */
export async function ocrImage(png: Buffer): Promise<{ text: string; confidence: number }> {
  const worker = await acquire();
  try {
    const { data } = await worker.recognize(png);
    return { text: data.text, confidence: data.confidence };
  } finally {
    release(worker);
  }
}

/** Przygotowanie jednego wątku OCR z wyprzedzeniem (pierwszy skan nie czeka na wczytanie modelu). */
export async function warmUpOcr(): Promise<void> {
  if (pool.all.length || pool.creating) return;
  release(await acquire());
}

export async function terminateOcr() {
  const all = pool.all.splice(0);
  pool.free.length = 0;
  await Promise.all(all.map((w) => w.terminate()));
}
