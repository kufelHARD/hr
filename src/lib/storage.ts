import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

// Pliki przechowywane pod losowymi nazwami (UUID) – bez danych osobowych w nazwach i ścieżkach.

export type StorageArea = "offers" | "cv";

function resolveSafe(relPath: string): string {
  const root = env.dataDir;
  const full = path.resolve(root, relPath);
  if (!full.startsWith(root + path.sep)) throw new Error("Nieprawidłowa ścieżka pliku.");
  return full;
}

export async function saveFile(area: StorageArea, buffer: Buffer, ext: string): Promise<string> {
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 8);
  const rel = path.join("files", area, `${crypto.randomUUID()}${safeExt.startsWith(".") ? safeExt : `.${safeExt}`}`);
  const full = resolveSafe(rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer, { flag: "wx" });
  return rel.split(path.sep).join("/");
}

export async function readStoredFile(relPath: string): Promise<Buffer> {
  return fs.readFile(resolveSafe(relPath));
}

export async function deleteStoredFile(relPath: string | null | undefined): Promise<void> {
  if (!relPath) return;
  await fs.rm(resolveSafe(relPath), { force: true });
}

export function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Nazwa pliku do nagłówka Content-Disposition (RFC 5987 – polskie znaki). */
export function contentDisposition(fileName: string, inline: boolean): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
