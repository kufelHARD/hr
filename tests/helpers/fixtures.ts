// Generatory plików testowych (DOCX / PDF) – budowane w locie, żeby testy nie zależały od binarnych fixture'ów.
import path from "node:path";
import PDFDocument from "pdfkit";
import {
  AlignmentType,
  Document,
  Header,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

export const FONT = path.join(__dirname, "..", "..", "seed", "fonts", "DejaVuSans.ttf");
export const FONT_BOLD = path.join(__dirname, "..", "..", "seed", "fonts", "DejaVuSans-Bold.ttf");

export function pdfToBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont("r", FONT);
    doc.registerFont("b", FONT_BOLD);
    build(doc);
    doc.end();
  });
}

/** CV dwukolumnowe: pasek boczny po lewej, treść główna po prawej, nagłówek na całą szerokość. */
export function makeTwoColumnPdf(): Promise<Buffer> {
  return pdfToBuffer((doc) => {
    doc.font("b").fontSize(22).text("Anna Testowa", 40, 40);
    doc.font("r").fontSize(10).text("Administrator baz danych · Poznań", 40, 70);

    const sideX = 40;
    const sideW = 150;
    let y = 120;
    doc.font("b").fontSize(13).text("Umiejętności", sideX, y, { width: sideW });
    y += 22;
    for (const s of ["SQL Server 2019", "PowerShell", "Always On AG", "Azure SQL", "T-SQL", "Query Store"]) {
      doc.font("r").fontSize(10).text(`• ${s}`, sideX, y, { width: sideW });
      y += 15;
    }
    y += 15;
    doc.font("b").fontSize(13).text("Języki", sideX, y, { width: sideW });
    y += 22;
    doc.font("r").fontSize(10).text("Angielski – C1", sideX, y, { width: sideW });

    const mainX = 230;
    const mainW = 320;
    doc.font("b").fontSize(13).text("Doświadczenie zawodowe", mainX, 120, { width: mainW });
    doc
      .font("r")
      .fontSize(10)
      .text(
        "Starszy administrator baz danych w firmie Przykład sp. z o.o. Odpowiedzialność za klaster Always On obejmujący czterdzieści instancji SQL Server. Migracja środowiska do Azure SQL Managed Instance oraz automatyzacja kopii zapasowych w PowerShell.",
        mainX,
        142,
        { width: mainW },
      );
    doc.moveDown();
    doc
      .font("r")
      .fontSize(10)
      .text(
        "Administrator baz danych w firmie Druga S.A. Strojenie zapytań z wykorzystaniem Query Store i planów wykonania, utrzymanie replikacji transakcyjnej.",
        { width: mainW },
      );
  });
}

/** Układ „data | opis” – daty po lewej NIE są osobną kolumną. */
export function makeTimelinePdf(): Promise<Buffer> {
  return pdfToBuffer((doc) => {
    doc.font("b").fontSize(16).text("Doświadczenie", 40, 40);
    const entries = [
      ["2021 – obecnie", "Kierownik zespołu DBA, Firma Alfa", "Zarządzanie zespołem pięciu administratorów. Projekty HA/DR dla klientów z sektora finansowego. Wdrożenie monitoringu."],
      ["2017 – 2021", "Administrator Oracle, Firma Beta", "Utrzymanie baz Oracle 19c z Data Guard. Migracje między wersjami. Strojenie wydajności z AWR."],
      ["2015 – 2017", "Młodszy administrator, Firma Gamma", "Kopie zapasowe RMAN, obsługa zgłoszeń, przygotowanie raportów."],
    ];
    let y = 75;
    for (const [date, title, desc] of entries) {
      doc.font("r").fontSize(10).text(date, 40, y, { width: 90 });
      doc.font("b").fontSize(10).text(title, 150, y, { width: 400 });
      doc.font("r").fontSize(10).text(desc, 150, y + 15, { width: 400 });
      y = doc.y + 18;
    }
  });
}

/** „Skan” – strona PDF zawierająca wyłącznie obraz z tekstem (bez warstwy tekstowej). */
export async function makeScannedPdf(lines: string[]): Promise<Buffer> {
  const { createCanvas, GlobalFonts } = await import("@napi-rs/canvas");
  GlobalFonts.registerFromPath(FONT, "DejaVuTest");
  const canvas = createCanvas(1654, 2339); // A4 @ 200 DPI
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111";
  ctx.font = "40px DejaVuTest";
  lines.forEach((line, i) => ctx.fillText(line, 120, 200 + i * 70));
  const png = canvas.toBuffer("image/png");
  return pdfToBuffer((doc) => {
    doc.image(png, 0, 0, { width: 595.28, height: 841.89 });
  });
}

/** DOCX z nagłówkami, pseudo-nagłówkiem (pogrubienie), listą punktowaną, tabelą i nagłówkiem dokumentu. */
export async function makeDocx(): Promise<Buffer> {
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "punkty",
          levels: [{ level: 0, format: "bullet", text: "•", alignment: AlignmentType.LEFT }],
        },
      ],
    },
    sections: [
      {
        headers: { default: new Header({ children: [new Paragraph("Jan Przykładowy · jan@example.com")] }) },
        children: [
          new Paragraph({ text: "Specjalista ds. Azure", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun({ text: "Czego oczekujemy:", bold: true })] }),
          new Paragraph({ text: "Min. 3 lata doświadczenia z Microsoft Azure", numbering: { reference: "punkty", level: 0 } }),
          new Paragraph({ text: "Znajomość Terraform lub Bicep", numbering: { reference: "punkty", level: 0 } }),
          new Paragraph({ text: "Mile widziane", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: "Certyfikat AZ-104", numbering: { reference: "punkty", level: 0 } }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [new TableCell({ children: [new Paragraph("Lokalizacja")] }), new TableCell({ children: [new Paragraph("Poznań")] })],
              }),
              new TableRow({
                children: [new TableCell({ children: [new Paragraph("Forma pracy")] }), new TableCell({ children: [new Paragraph("Hybrydowa")] })],
              }),
            ],
          }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
