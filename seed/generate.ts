// Generuje przykładowe pliki: ofertę (.docx) i 3 fikcyjne CV (2× PDF, 1× DOCX) do katalogu seed/files.
// Uruchomienie: npm run seed:generate
// Wszystkie osoby i firmy w CV są fikcyjne.
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const OUT = path.join(__dirname, "files");
const FONT = path.join(__dirname, "fonts", "DejaVuSans.ttf");
const FONT_BOLD = path.join(__dirname, "fonts", "DejaVuSans-Bold.ttf");

const bullet = (text: string) => new Paragraph({ text, numbering: { reference: "punkty", level: 0 } });
const numbering = {
  config: [{ reference: "punkty", levels: [{ level: 0, format: "bullet" as const, text: "•", alignment: AlignmentType.LEFT }] }],
};

// ---------------------------------------------------------------- oferta

async function offerDocx() {
  const doc = new Document({
    numbering,
    sections: [
      {
        children: [
          new Paragraph({ text: "Administrator baz danych SQL Server / Specjalista Azure", heading: HeadingLevel.TITLE }),
          new Paragraph({ children: [new TextRun({ text: "Poznań / Kraków / zdalnie · umowa o pracę lub B2B", italics: true })] }),
          new Paragraph({ text: "O nas", heading: HeadingLevel.HEADING_2 }),
          new Paragraph(
            "summ-it S.A. od 2011 roku dba o dane i infrastrukturę bazodanową klientów – od administracji Microsoft SQL Server i Oracle, przez rozwiązania wysokiej dostępności, po migracje do chmury Microsoft Azure. Dołącz do zespołu, który na co dzień pracuje z bazami liczonymi w terabajtach i petabajtach.",
          ),
          new Paragraph({ text: "Czym będziesz się zajmować", heading: HeadingLevel.HEADING_2 }),
          bullet("administracją i utrzymaniem środowisk Microsoft SQL Server u klientów (on-premises i w Azure),"),
          bullet("projektowaniem i wdrażaniem rozwiązań HA/DR (Always On Availability Groups, Failover Cluster Instances, log shipping),"),
          bullet("migracjami baz danych do Azure SQL Managed Instance, Azure SQL Database oraz SQL Server na maszynach wirtualnych Azure,"),
          bullet("analizą i optymalizacją wydajności (plany wykonania, indeksy, Query Store),"),
          bullet("automatyzacją zadań administracyjnych (PowerShell) i budową infrastruktury jako kodu,"),
          bullet("udziałem w dyżurach i obsłudze zgłoszeń klientów."),
          new Paragraph({ children: [new TextRun({ text: "Czego oczekujemy", bold: true, size: 28 })] }),
          bullet("min. 4 lat doświadczenia w administracji Microsoft SQL Server w środowiskach produkcyjnych,"),
          bullet("praktycznej znajomości rozwiązań wysokiej dostępności SQL Server (Always On AG lub FCI),"),
          bullet("min. 2 lat doświadczenia z Microsoft Azure (Azure SQL, maszyny wirtualne, sieci, IAM),"),
          bullet("bardzo dobrej znajomości T-SQL i umiejętności strojenia zapytań,"),
          bullet("umiejętności automatyzacji w PowerShell,"),
          bullet("znajomości języka angielskiego na poziomie min. B2,"),
          bullet("samodzielności i odpowiedzialności za powierzone systemy."),
          new Paragraph({ text: "Dodatkowym atutem będzie", heading: HeadingLevel.HEADING_3 }),
          bullet("znajomość Terraform lub Bicep,"),
          bullet("certyfikat DP-300 lub AZ-104,"),
          bullet("doświadczenie z Oracle Database,"),
          bullet("doświadczenie z Azure Data Factory lub SSIS."),
          new Paragraph({ text: "Oferujemy", heading: HeadingLevel.HEADING_2 }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              ["Forma współpracy", "Umowa o pracę lub B2B"],
              ["Wynagrodzenie", "16 000 – 22 000 zł brutto (UoP)"],
              ["Rozwój", "Budżet szkoleniowy, opłacone egzaminy certyfikacyjne Microsoft"],
              ["Praca", "Hybrydowo (Poznań, Kraków) lub w pełni zdalnie"],
            ].map(
              ([a, b]) =>
                new TableRow({
                  children: [new TableCell({ children: [new Paragraph(a)] }), new TableCell({ children: [new Paragraph(b)] })],
                }),
            ),
          }),
        ],
      },
    ],
  });
  fs.writeFileSync(path.join(OUT, "oferta-dba-sql-server-azure.docx"), await Packer.toBuffer(doc));
}

// ---------------------------------------------------------------- pomocnicze PDF

function pdf(file: string, build: (doc: PDFKit.PDFDocument) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: "CV", Author: "przykład" } });
    const stream = fs.createWriteStream(path.join(OUT, file));
    doc.pipe(stream);
    doc.registerFont("r", FONT);
    doc.registerFont("b", FONT_BOLD);
    build(doc);
    doc.end();
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}

// ---------------------------------------------------------------- CV 1: dokładne dopasowanie (PDF dwukolumnowy)

async function cvExactMatch() {
  await pdf("cv-anna-kowalczyk.pdf", (doc) => {
    const sideW = 165;
    doc.rect(0, 0, sideW + 40, 842).fill("#eef2f7");
    doc.fillColor("#111");

    // pasek boczny
    let y = 45;
    const side = (title: string, items: string[]) => {
      doc.font("b").fontSize(11.5).fillColor("#1a4a9b").text(title, 30, y, { width: sideW });
      y = doc.y + 6;
      doc.font("r").fontSize(9).fillColor("#222");
      for (const it of items) {
        doc.text(it, 30, y, { width: sideW });
        y = doc.y + 3;
      }
      y += 12;
    };
    side("Kontakt", ["anna.kowalczyk@example.com", "+48 600 000 001", "Poznań"]);
    side("Technologie", [
      "SQL Server 2014–2022",
      "Always On AG, FCI",
      "Log shipping, replikacja",
      "Azure SQL Managed Instance",
      "Azure SQL Database",
      "Azure VM, VNet, Entra ID",
      "T-SQL, Query Store",
      "PowerShell, dbatools",
      "Bicep, Terraform (podstawy)",
      "SSIS, Azure Data Factory",
      "Windows Server, WSFC",
    ]);
    side("Certyfikaty", ["Microsoft DP-300 Azure Database Administrator Associate (2022)", "Microsoft AZ-104 Azure Administrator Associate (2023)"]);
    side("Języki", ["Polski – ojczysty", "Angielski – C1"]);

    // treść główna
    const x = sideW + 70;
    const w = 595 - x - 40;
    doc.font("b").fontSize(24).fillColor("#111").text("Anna Kowalczyk", x, 45, { width: w });
    doc.font("r").fontSize(12).fillColor("#1a4a9b").text("Senior Database Administrator · SQL Server & Azure", x, doc.y + 2, { width: w });
    doc.moveDown(0.8);
    doc.font("r").fontSize(9.5).fillColor("#222").text(
      "Administratorka baz danych z 8-letnim doświadczeniem w utrzymaniu krytycznych środowisk Microsoft SQL Server. Specjalizuję się w rozwiązaniach wysokiej dostępności oraz migracjach do Microsoft Azure. Lubię automatyzować powtarzalną pracę i dzielić się wiedzą w zespole.",
      x,
      doc.y,
      { width: w },
    );

    const job = (title: string, company: string, dates: string, bullets: string[]) => {
      doc.moveDown(0.9);
      doc.font("b").fontSize(10.5).fillColor("#111").text(title, x, doc.y, { width: w });
      doc.font("r").fontSize(9).fillColor("#555").text(`${company} · ${dates}`, x, doc.y, { width: w });
      doc.moveDown(0.3);
      doc.font("r").fontSize(9.5).fillColor("#222");
      for (const b of bullets) doc.text(`• ${b}`, x, doc.y + 1, { width: w });
    };
    doc.moveDown(0.6);
    doc.font("b").fontSize(13).fillColor("#1a4a9b").text("Doświadczenie zawodowe", x, doc.y, { width: w });
    job("Senior Database Administrator", "DataBank Services sp. z o.o.", "03.2021 – obecnie", [
      "Administracja ponad 60 instancjami SQL Server 2016–2022 (on-premises i Azure) dla sektora finansowego.",
      "Projekt i wdrożenie Always On Availability Groups z replikami w dwóch centrach danych oraz w Azure (DR).",
      "Migracja 40 baz danych (łącznie 18 TB) do Azure SQL Managed Instance z wykorzystaniem Azure Database Migration Service.",
      "Infrastruktura Azure (VNet, prywatne endpointy, role RBAC w Entra ID) opisana w Bicep; utrzymanie pipeline'ów w Azure DevOps.",
      "Strojenie wydajności z użyciem Query Store i Extended Events – skrócenie czasu nocnego przetwarzania o 45%.",
    ]);
    job("Database Administrator", "LogiTrans S.A.", "06.2018 – 02.2021", [
      "Utrzymanie klastrów Failover Cluster Instance (WSFC) i log shippingu dla systemu ERP.",
      "Automatyzacja kopii zapasowych, kontroli integralności i raportowania w PowerShell (dbatools).",
      "Pakiety SSIS do integracji danych z systemami magazynowymi; pierwsze przepływy w Azure Data Factory.",
    ]);
    job("Młodszy administrator baz danych", "LogiTrans S.A.", "09.2016 – 05.2018", [
      "Monitoring, obsługa zgłoszeń, przygotowanie środowisk testowych SQL Server.",
      "Tworzenie raportów i procedur składowanych w T-SQL.",
    ]);
    doc.moveDown(0.9);
    doc.font("b").fontSize(13).fillColor("#1a4a9b").text("Wykształcenie", x, doc.y, { width: w });
    doc.font("r").fontSize(9.5).fillColor("#222").text("Politechnika Poznańska – Informatyka, studia magisterskie (2011–2016)", x, doc.y + 4, { width: w });
  });
}

// ---------------------------------------------------------------- CV 2: AWS zamiast Azure (PDF, układ daty | opis)

async function cvAws() {
  await pdf("cv-tomasz-nowicki.pdf", (doc) => {
    doc.font("b").fontSize(22).text("Tomasz Nowicki");
    doc.font("r").fontSize(11).fillColor("#444").text("Database & Cloud Engineer · Kraków · tomasz.nowicki@example.com");
    doc.moveDown(0.8);
    doc.fillColor("#111").font("b").fontSize(13).text("Podsumowanie");
    doc.font("r").fontSize(10).text(
      "Inżynier baz danych z 7-letnim doświadczeniem. Przez ostatnie 4 lata odpowiadam za bazy danych w chmurze AWS – SQL Server i PostgreSQL na Amazon RDS i EC2, wysoka dostępność, kopie zapasowe i automatyzacja infrastruktury. Wcześniej administrowałem SQL Server on-premises.",
    );
    doc.moveDown(0.8);
    doc.font("b").fontSize(13).text("Doświadczenie");
    doc.moveDown(0.3);

    const entry = (dates: string, title: string, lines: string[]) => {
      const y = doc.y + 4;
      doc.font("r").fontSize(9.5).fillColor("#555").text(dates, 40, y, { width: 95 });
      doc.font("b").fontSize(10).fillColor("#111").text(title, 150, y, { width: 405 });
      doc.font("r").fontSize(9.5);
      for (const l of lines) doc.text(`– ${l}`, 150, doc.y + 1, { width: 405 });
      doc.moveDown(0.6);
    };
    entry("2021 – obecnie", "Senior Database Engineer, CloudRetail Polska sp. z o.o.", [
      "Utrzymanie ok. 50 baz SQL Server (RDS for SQL Server, EC2) i PostgreSQL (Amazon Aurora) dla platformy e-commerce.",
      "Wdrożenie Multi-AZ i replik do odczytu, testy przełączania awaryjnego i procedury DR między regionami AWS.",
      "Infrastruktura jako kod w Terraform i AWS CloudFormation; IAM, VPC, KMS, AWS Backup.",
      "Migracja 12 baz z centrum danych do AWS z wykorzystaniem AWS DMS.",
      "Certyfikat AWS Certified Solutions Architect – Associate (2022).",
    ]);
    entry("2018 – 2021", "Administrator SQL Server, FinSoft S.A.", [
      "Administracja SQL Server 2012–2019 on-premises, konfiguracja Always On Availability Groups (2 klastry, 3 repliki).",
      "Optymalizacja zapytań T-SQL i indeksów, analiza planów wykonania, monitoring w Redgate SQL Monitor.",
      "Skrypty PowerShell do automatyzacji wdrożeń i kopii zapasowych.",
    ]);
    entry("2017 – 2018", "Młodszy specjalista IT, FinSoft S.A.", [
      "Wsparcie administratorów baz danych, raporty SSRS, obsługa zgłoszeń.",
    ]);

    doc.moveDown(0.4);
    doc.font("b").fontSize(13).text("Umiejętności", 40);
    doc.font("r").fontSize(10).text(
      "SQL Server, T-SQL, PostgreSQL, Amazon RDS, Aurora, EC2, AWS DMS, Terraform, CloudFormation, Python, Bash, PowerShell, Linux, Docker, Grafana, Redgate SQL Monitor",
      40,
    );
    doc.moveDown(0.8);
    doc.font("b").fontSize(13).text("Języki");
    doc.font("r").fontSize(10).text("Angielski – B2+ (codzienna praca w międzynarodowym zespole), niemiecki – A2");
    doc.moveDown(0.8);
    doc.font("b").fontSize(13).text("Wykształcenie");
    doc.font("r").fontSize(10).text("AGH Kraków – Informatyka Stosowana, inżynier (2013–2017)");
  });
}

// ---------------------------------------------------------------- CV 3: junior z potencjałem (DOCX z tabelą układu)

async function cvJunior() {
  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };
  const h = (t: string) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2 });
  const p = (t: string) => new Paragraph(t);

  const left = [
    h("Kontakt"),
    p("julia.zielinska@example.com"),
    p("Poznań"),
    p("Data urodzenia: 14.05.2001"),
    h("Umiejętności"),
    bullet("T-SQL (zapytania, procedury, indeksy)"),
    bullet("SQL Server 2022 Developer – domowe laboratorium"),
    bullet("Azure: SQL Database, maszyny wirtualne, Azure free account"),
    bullet("Python (pandas), PowerShell – podstawy"),
    bullet("Power BI"),
    bullet("Linux – podstawy, Git"),
    h("Certyfikaty"),
    bullet("Microsoft DP-900 Azure Data Fundamentals (2024)"),
    bullet("Microsoft AZ-900 Azure Fundamentals (2023)"),
    bullet("W przygotowaniu: DP-300 (planowany termin egzaminu: 2026)"),
    h("Języki"),
    p("Angielski – B2 (FCE)"),
  ];
  const right = [
    h("Doświadczenie"),
    new Paragraph({ children: [new TextRun({ text: "Młodsza analityczka danych – NetHurt sp. z o.o.", bold: true })] }),
    p("02.2025 – obecnie"),
    bullet("Przygotowywanie zapytań T-SQL i raportów Power BI dla działu sprzedaży."),
    bullet("Optymalizacja wolnych zapytań raportowych – dodanie indeksów skróciło czas generowania raportu z 6 min do 40 s."),
    bullet("Współpraca z administratorem przy migracji bazy raportowej do Azure SQL Database (testy, weryfikacja danych)."),
    new Paragraph({ children: [new TextRun({ text: "Stażystka w dziale IT – NetHurt sp. z o.o.", bold: true })] }),
    p("07.2024 – 01.2025"),
    bullet("Obsługa zgłoszeń użytkowników, przygotowanie stanowisk, dokumentacja."),
    bullet("Skrypty PowerShell do zakładania kont i raportowania stanu stacji roboczych."),
    bullet("Po 7 miesiącach awans na stanowisko młodszej analityczki danych."),
    h("Projekty własne"),
    bullet("Domowe laboratorium: SQL Server 2022 na Windows Server w Hyper-V, konfiguracja kopii zapasowych i odtwarzania, testy Always On AG w środowisku dwóch maszyn wirtualnych."),
    bullet("Wdrożenie małej bazy Azure SQL Database z aplikacją w Pythonie (FastAPI) – projekt inżynierski."),
    bullet("Hackathon „Dane dla Miasta” 2024 – 2. miejsce (analiza danych transportu publicznego)."),
    h("Wykształcenie"),
    p("Politechnika Poznańska – Informatyka, studia inżynierskie (2020–2024), praca dyplomowa o optymalizacji zapytań SQL; od 2024 studia magisterskie (tryb zaoczny)."),
    p("Stan cywilny: panna"),
  ];

  const doc = new Document({
    numbering,
    sections: [
      {
        children: [
          new Paragraph({ text: "Julia Zielińska", heading: HeadingLevel.TITLE }),
          new Paragraph({ children: [new TextRun({ text: "Młodsza analityczka danych · aspirująca administratorka baz danych", italics: true })] }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ width: { size: 35, type: WidthType.PERCENTAGE }, borders: noBorders, children: left }),
                  new TableCell({ width: { size: 65, type: WidthType.PERCENTAGE }, borders: noBorders, children: right }),
                ],
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Wyrażam zgodę na przetwarzanie moich danych osobowych dla potrzeb niezbędnych do realizacji procesu rekrutacji.",
                size: 14,
                italics: true,
              }),
            ],
          }),
        ],
      },
    ],
  });
  fs.writeFileSync(path.join(OUT, "cv-julia-zielinska.docx"), await Packer.toBuffer(doc));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await offerDocx();
  await cvExactMatch();
  await cvAws();
  await cvJunior();
  console.log(`Wygenerowano pliki w ${OUT}:`);
  for (const f of fs.readdirSync(OUT)) console.log(`  - ${f}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
