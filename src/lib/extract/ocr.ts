import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

// OCR (tesseract.js, język polski + angielski). Dane językowe pochodzą z pakietów npm
// @tesseract.js-data/pol i @tesseract.js-data/eng – OCR działa bez dostępu do internetu.

const LANGS = ["pol", "eng"] as const;

async function prepareLangDir(): Promise<string> {
  const dir = path.join(process.cwd(), "node_modules", ".cache", "porownywarka-ocr");
  await fs.mkdir(dir, { recursive: true });
  const require = createRequire(path.join(process.cwd(), "package.json"));
  for (const lang of LANGS) {
    const target = path.join(dir, `${lang}.traineddata.gz`);
    try {
      await fs.access(target);
    } catch {
      const pkgDir = path.dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`));
      await fs.copyFile(path.join(pkgDir, "4.0.0_best_int", `${lang}.traineddata.gz`), target);
    }
  }
  return dir;
}

type OcrWorker = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;
let workerPromise: Promise<OcrWorker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function getWorker(): Promise<OcrWorker> {
  workerPromise ??= (async () => {
    const { createWorker } = await import("tesseract.js");
    const langPath = await prepareLangDir();
    return createWorker([...LANGS], 1, { langPath, cachePath: langPath, gzip: true });
  })();
  return workerPromise;
}

/** Rozpoznaje tekst na obrazie (PNG). Wywołania są kolejkowane – jeden worker OCR na proces. */
export async function ocrImage(png: Buffer): Promise<{ text: string; confidence: number }> {
  const run = queue.then(async () => {
    const worker = await getWorker();
    const { data } = await worker.recognize(png);
    return { text: data.text, confidence: data.confidence };
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function terminateOcr() {
  if (!workerPromise) return;
  const w = await workerPromise;
  workerPromise = null;
  await w.terminate();
}
