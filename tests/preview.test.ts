import { describe, expect, it } from "vitest";
import { docxPreviewHtml, previewDocument, wordPreviewBody } from "@/lib/extract/preview";
import { makeDocx } from "./helpers/fixtures";

describe("podgląd CV w formacie Word", () => {
  it("DOCX → HTML z treścią, tabelą i nagłówkiem dokumentu", async () => {
    const html = await docxPreviewHtml(await makeDocx());
    expect(html).toMatch(/<table>/);
    expect(html).toMatch(/<li>/);
    expect(html).toMatch(/class="hf"/);
    expect(html).not.toMatch(/<script/i);
  });

  it("uszkodzony plik – podgląd z odczytanego tekstu (z escapowaniem HTML)", async () => {
    const body = await wordPreviewBody(Buffer.from("to nie jest docx"), "docx", "Jan <b>Kowalski</b>");
    expect(body).toContain("Jan &lt;b&gt;Kowalski&lt;/b&gt;");
    expect(previewDocument("cv <x>.docx", body)).toContain("<title>cv &lt;x&gt;.docx</title>");
  });
});
