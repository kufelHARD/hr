import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { env } from "@/lib/env";

const exec = promisify(execFile);

export class DocConversionUnavailableError extends Error {
  constructor() {
    super(
      "Stary format .doc nie jest obsługiwany bez LibreOffice. Otwórz plik w Wordzie i zapisz go jako .docx (Plik → Zapisz jako → Dokument programu Word), a następnie wgraj ponownie.",
    );
  }
}

const CANDIDATES = [
  "soffice",
  "libreoffice",
  "/usr/bin/soffice",
  "/usr/lib/libreoffice/program/soffice",
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
];

let cached: string | null | undefined;

export async function findSoffice(): Promise<string | null> {
  if (cached !== undefined) return cached;
  const list = env.sofficePath ? [env.sofficePath] : CANDIDATES;
  for (const bin of list) {
    try {
      await exec(bin, ["--version"], { timeout: 20000 });
      cached = bin;
      return bin;
    } catch {
      /* następny kandydat */
    }
  }
  cached = null;
  return null;
}

/** Konwersja .doc → .docx przez LibreOffice w trybie headless. */
export async function convertDocToDocx(buffer: Buffer): Promise<Buffer> {
  const soffice = await findSoffice();
  if (!soffice) throw new DocConversionUnavailableError();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "porownywarka-doc-"));
  try {
    const input = path.join(dir, "plik.doc");
    await fs.writeFile(input, buffer);
    // osobny profil użytkownika – konwersja działa także, gdy LibreOffice jest otwarty
    const profile = `file://${path.join(dir, "profil").replace(/\\/g, "/")}`;
    await exec(
      soffice,
      [`-env:UserInstallation=${profile}`, "--headless", "--convert-to", "docx", "--outdir", dir, input],
      { timeout: 120000 },
    );
    return await fs.readFile(path.join(dir, "plik.docx"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
