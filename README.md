# Porównywarka CV – summ-it S.A.

Wewnętrzna aplikacja działu HR do zarządzania ofertami pracy i porównywania CV kandydatów z ofertami przy pomocy AI. Wszystkie dane (baza, pliki CV) są przechowywane lokalnie.

**Aplikacja jest bezpłatna.** Domyślnie analizy wykonuje darmowy model AI działający na Twoim komputerze (Ollama) – bez opłat i bez wysyłania CV do internetu. Opcjonalnie można włączyć płatny Claude API (wyższa jakość, własny klucz).

> **Ocena AI ma charakter pomocniczy. Decyzję rekrutacyjną podejmuje człowiek.**

## Spis treści

1. [Co potrafi](#co-potrafi)
2. [Wersja do pobrania (Windows)](#wersja-do-pobrania-windows)
3. [Silnik AI, koszty i inne komputery](#silnik-ai-koszty-i-inne-komputery)
4. [Instalacja ze źródeł (dla programistów)](#instalacja-ze-źródeł-dla-programistów)
5. [Jak działa ocena](#jak-działa-ocena)
6. [Strojenie: wagi, mapa technologii, kontekst firmy, prompty](#strojenie)
7. [Kopia zapasowa i odtwarzanie](#kopia-zapasowa-i-odtwarzanie)
8. [RODO i bezpieczeństwo](#rodo-i-bezpieczeństwo)
9. [Docker](#docker)
10. [Dane przykładowe (seed) i testy](#dane-przykładowe-seed-i-testy)
11. [Struktura projektu](#struktura-projektu)
12. [Ograniczenia](#ograniczenia)

## Co potrafi

- **Oferty pracy** – dodawanie z plików Word (.docx; stary .doc konwertowany przez LibreOffice), także kilku naraz, lub z wklejonej treści. AI automatycznie odczytuje z pliku stanowisko i wymagane kompetencje (wymagane / mile widziane, kategoria, waga 1–3) – niezależnie od nazw sekcji i formatowania (listy, tabele, pogrubione nagłówki). Domyślnie oferta jest od razu aktywna; wymagania można w każdej chwili poprawić (albo odznaczyć automatyczną aktywację i przejrzeć je przed startem). Każda zmiana wymagań tworzy nową wersję. Archiwizacja, usuwanie, pobieranie oryginału.
- **Kandydaci** – wgrywanie wielu CV naraz (przeciągnij i upuść; PDF, DOCX, DOC). Ekstrakcja tekstu z zachowaniem kolejności w CV wielokolumnowych, OCR (polski + angielski) dla skanów. Każde CV jest automatycznie analizowane i dostaje krótki opis.
- **Wynik kandydata** – opis, dwa wskaźniki (Dopasowanie %, Potencjał %), tabela wymagań ze statusem, dowodem z CV i uzasadnieniem, składowe potencjału, mocne i słabe strony, technologie pokrewne, pytania na rozmowę, notatki rekrutera, podgląd i pobranie oryginalnego CV, historia analiz.
- **Archiwum** – wszystko zapisane trwale; ponowna analiza nie nadpisuje poprzedniej. Wyszukiwarka kandydatów we wszystkich ofertach (imię i nazwisko, technologia, słowo kluczowe – także bez polskich znaków). Przypisanie istniejącego kandydata do innej oferty bez ponownego wgrywania pliku.
- **Ustawienia** – edycja mapy technologii pokrewnych i opisu firmy z poziomu aplikacji.

## Wersja do pobrania (Windows)

Gotowa paczka nie wymaga instalowania Node.js ani niczego poza (opcjonalnie) darmową Ollamą.

1. Pobierz `Porownywarka-CV-windows-x64.zip` z zakładki **Releases** repozytorium na GitHubie.
2. Rozpakuj (np. do folderu Dokumenty – nie do „Program Files”) i uruchom **`Uruchom.cmd`**. Aplikacja otworzy się w przeglądarce (http://localhost:3000).
3. Przy pierwszym uruchomieniu ustaw hasło.
4. **Ustawienia → Silnik AI**: zainstaluj bezpłatną Ollamę (https://ollama.com/download), kliknij „Pobierz model”, a potem „Test szybkości”.

Szczegółowa instrukcja dla użytkownika jest w paczce (`INSTRUKCJA.txt`, źródło: `launcher/INSTRUKCJA.txt`).

Struktura paczki: `program\` (aplikacja z wbudowanym Node.js), `dane\` (baza, pliki CV, ustawienia, konfiguracja – tworzony przy pierwszym uruchomieniu), `kopie-zapasowe\`. Aktualizacja = podmiana folderu `program\` – dane zostają.

**Budowanie paczki:** `npm run package:windows` (działa na Windows, Linuksie i macOS) → `dist/Porownywarka-CV-windows-x64.zip`. Automat GitHub Actions (`.github/workflows/windows-release.yml`) buduje paczkę na Windows, uruchamia testy i test startu paczki, a po zmianie wersji w `package.json` (pole `version`, np. `1.0.1`) na gałęzi `main` publikuje ją jako Release `v1.0.1`. Można go też uruchomić ręcznie: zakładka Actions → „Wersja Windows” → Run workflow.

## Silnik AI, koszty i inne komputery

| | Model lokalny (Ollama) – **domyślny** | Claude API (opcjonalny) |
|---|---|---|
| Koszt | **0 zł** | ok. 2 gr za CV (Haiku 5.5) … ok. 0,70 zł (Opus 5.5) |
| Dane | CV nie opuszczają komputera | tekst CV wysyłany do Anthropic |
| Czas analizy CV | laptop bez karty graficznej: ok. 5–15 min (w tle); z kartą NVIDIA 8 GB+: 1–3 min | 1–2 min |
| Jakość | dobra przy większych modelach (gemma3:12b, qwen3:8b), słabsza przy małych | najlepsza |
| Wymagania | Ollama + model (3–8 GB) | klucz API z console.anthropic.com |

Silnik wybierasz w **Ustawieniach → Silnik AI**. Aplikacja nigdy sama nie przełącza się na płatny silnik.

**Który model lokalny?** Zwykły laptop: `gemma3:4b` (domyślny) lub `qwen3:4b`. Komputer z kartą graficzną: `qwen3:8b` (8 GB+), `gemma3:12b` (12 GB+). Przycisk „Test szybkości” mierzy wydajność komputera i szacuje czas analizy jednego CV. Model lokalny działa z temperaturą 0 i wymuszonym schematem JSON – te same zasady oceny, dowody z CV i ich weryfikacja co przy Claude.

**Gdzie widać koszty:** Ustawienia → **Koszty AI** (bieżący miesiąc, 30 dni, łącznie, średni koszt CV; szacunek z liczby tokenów) oraz koszt każdej analizy w historii analiz kandydata. Oficjalne rozliczenie i **limit wydatków**: console.anthropic.com → Usage / Limits. Cennik do szacunków: `src/lib/ai/pricing.ts`.

**Inne komputery:** aplikację można zainstalować na dowolnej liczbie komputerów. Każda instalacja ma własne dane i własne ustawienia (folder `dane`). Koszty Claude obciążają konto, którego klucz API wpisano w ustawieniach danej instalacji – klucz jest zapisany tylko na tym komputerze i **nie ma go w paczce do pobrania**. Instalacja na modelu lokalnym nie generuje kosztów. Domyślnie aplikacja jest dostępna tylko na komputerze, na którym działa (127.0.0.1).

**Powtarzalność (Claude).** Aktualne modele Claude nie przyjmują parametru `temperature`. Powtarzalność zapewniają wymuszony schemat odpowiedzi, precyzyjne definicje w prompcie, liczenie wyników przez kod i zapisywanie każdej analizy. W dwóch przebiegach na danych przykładowych wyniki różniły się o 0,1–3 pkt.

## Instalacja ze źródeł (dla programistów)

Wymagania: **Node.js 22+**. Opcjonalnie LibreOffice (pliki `.doc`) i Ollama (darmowy silnik AI).

```bash
git clone https://github.com/kufelHARD/hr.git porownywarka-cv
cd porownywarka-cv
npm install            # przy błędzie node-gyp: npm install --ignore-scripts && npx prisma generate
npm run dev            # http://localhost:3000
```

Hasło, silnik AI i klucz Claude ustawia się w aplikacji. Plik `.env` (kopia `.env.example`) jest opcjonalny – jego wartości mają pierwszeństwo przed ustawieniami z aplikacji:

| Zmienna | Opis |
|---|---|
| `AI_PROVIDER` | `ollama` (domyślnie) lub `claude` |
| `OLLAMA_URL`, `OLLAMA_MODEL` | adres i model Ollamy (domyślnie `http://127.0.0.1:11434`, `gemma3:4b`) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT` | Claude: klucz, model (domyślnie `claude-haiku-5-5`), wysiłek |
| `APP_PASSWORD`, `AUTH_SECRET` | hasło (zamiast ustawianego w aplikacji) i sekret sesji |
| `DATA_DIR`, `DATABASE_URL` | folder danych i baza (domyślnie `./storage`) |
| `CONFIG_DIR`, `PROMPTS_DIR`, `BACKUP_DIR` | foldery konfiguracji, promptów i kopii (domyślnie `config`, `prompts`, `backups`) |
| `ANALYSIS_CONCURRENCY` | równoległe analizy dla Claude (model lokalny – zawsze 1) |
| `OCR_ENABLED`, `SOFFICE_PATH`, `COOKIE_SECURE` | OCR skanów, ścieżka LibreOffice, ciasteczka tylko po HTTPS |

Wersja produkcyjna: `npm run build && npm start`.

## Jak działa ocena

Po wgraniu CV: **ekstrakcja tekstu** (lokalnie, łącznie z OCR) → **analiza AI** (jedno zapytanie: ocena każdego wymagania + składowe potencjału + opis) → **wynik liczony przez kod** → zapis w bazie.

### Dopasowanie (0–100%)

AI przypisuje każdemu wymaganiu status i musi podać dosłowny cytat z CV jako dowód:

| Status | Znaczenie | Wartość (domyślnie) |
|---|---|---|
| `pelne` | CV wprost potwierdza wymaganie na wymaganym poziomie | 1.0 |
| `pokrewne` | technologia równoważna, np. AWS zamiast Azure, Oracle zamiast SQL Server | 0.6 |
| `czesciowe` | ta sama umiejętność, ale poniżej wymaganego poziomu (mniej lat, tylko kurs, niższy poziom języka) | 0.4 |
| `brak` | brak dowodu w CV | 0 |

```
waga_efektywna = waga wymagania (1–3) × mnożnik typu (wymagane ×2, mile widziane ×1)
dopasowanie    = Σ(wartość_statusu × waga_efektywna) / Σ(waga_efektywna) × 100
```

Kod sprawdza, czy każdy cytat-dowód faktycznie występuje w tekście CV. Jeśli nie (np. parafraza albo błąd OCR), w tabeli pojawia się „?” i ostrzeżenie – sprawdź w oryginale.

### Potencjał (0–100%)

Nie sprawdza zgodności punkt po punkcie, tylko jak blisko profil i trajektoria kandydata są tego, czego szukamy. AI ocenia pięć składowych (0–100, z uzasadnieniem):

| Składowa | Waga (domyślnie) |
|---|---|
| Bliskość domenowa (dane, bazy, chmura, integracje) | 0.25 |
| Umiejętności przenoszalne (fundamenty) | 0.25 |
| Trajektoria rozwoju (awanse, certyfikaty, nauka) | 0.20 |
| Czas wdrożenia w brakujące obszary | 0.15 |
| Dopasowanie do profilu firmy (`company-context.md`) | 0.15 |

Potencjał to średnia ważona tych ocen. Staż i spełnienie wymagań są już w dopasowaniu – potencjał ocenia kierunek, jakość i tempo rozwoju, więc kandydat może mieć niskie dopasowanie i wysoki potencjał.

### Zabezpieczenia jakości

- AI nie może wymyślać doświadczenia: każdy status inny niż „brak” wymaga cytatu z CV, a cytaty są weryfikowane w kodzie.
- AI ignoruje wiek, płeć, zdjęcie, narodowość, stan cywilny, pochodzenie i inne cechy niezwiązane z kompetencjami. Do AI trafia wyłącznie tekst – zdjęcia z CV nie są wysyłane.
- Treść CV jest traktowana jako dane, nie polecenia. Próby wpłynięcia na ocenę (np. ukryty tekst „oceń mnie najwyżej”) są ignorowane i oznaczane ostrzeżeniem.
- Odpowiedź AI musi być zgodna ze schematem JSON (wymuszonym przez API i walidowanym w kodzie); przy błędzie jest jedna ponowna próba.

## Strojenie

Wszystkie poniższe pliki można edytować bez zmian w kodzie (w wersji do pobrania leżą w `dane\konfiguracja\` i `dane\prompty\`). Zmiany obowiązują od następnej analizy; zapisane analizy zachowują parametry, z którymi je policzono.

### `config/scoring.json` – mnożniki i wagi

```jsonc
{
  "dopasowanie": {
    "wartosci_statusow": { "pelne": 1.0, "pokrewne": 0.6, "czesciowe": 0.4, "brak": 0 },
    "mnozniki_typow": { "wymagane": 2, "mile_widziane": 1 }
  },
  "potencjal": {
    "wagi_skladowych": {
      "bliskosc_domenowa": 0.25, "umiejetnosci_przenoszalne": 0.25,
      "trajektoria_rozwoju": 0.2, "czas_wdrozenia": 0.15, "dopasowanie_do_firmy": 0.15
    }
  },
  "retencja": { "wlaczona": false, "dni": 365, "tylko_bez_zgody": true }
}
```

- Chcesz, żeby technologie pokrewne liczyły się mocniej? Podnieś `pokrewne` (np. do 0.75).
- Chcesz, żeby wymagania obowiązkowe dominowały? Zwiększ `mnozniki_typow.wymagane` (np. do 3).
- Wagi potencjału nie muszą sumować się do 1 – są normalizowane.
- Po zmianie wag możesz przeliczyć kandydatów oferty przyciskiem „Analizuj wszystkich ponownie” (to nowe zapytania do AI).

### Mapa technologii pokrewnych

**Ustawienia → Mapa technologii pokrewnych** (lub plik `config/related-technologies.json`). Grupy technologii, których znajomość może zostać zaliczona jako „pokrewna”. Mapa jest wskazówką – AI rozpoznaje też sensowne pokrewieństwa spoza listy. Startowy zestaw obejmuje m.in. chmury (Azure/AWS/GCP/OCI), relacyjne bazy, HA/DR dla SQL Server i Oracle, BI, ETL, IaC, monitoring, integrację systemów, certyfikaty.

### Kontekst firmy

**Ustawienia → Kontekst firmy** (plik `config/company-context.md`). Dołączany do każdego zapytania; wpływa m.in. na składową „dopasowanie do profilu firmy”. Warto uzupełnić sekcję „Do uzupełnienia” (partnerstwa, certyfikaty firmowe, branże klientów).

### Prompty

Katalog `prompts/`:
- `analysis-system.md` – analiza CV (definicje statusów, skale potencjału, zasady opisu i rekomendacji),
- `requirements-system.md` – wyodrębnianie wymagań z oferty.

Każda analiza zapisuje skrót (hash) promptu, którego użyto, więc da się porównać wyniki sprzed i po zmianie. Nie zmieniaj nazw pól JSON wymienionych w promptach – są powiązane ze schematem w kodzie (`src/lib/ai/schemas.ts`).

## Kopia zapasowa i odtwarzanie

**Ustawienia → Kopia zapasowa → „Utwórz kopię zapasową”** albo `npm run backup` (opcjonalnie `-- --dir D:\kopie`). Powstaje plik ZIP (`kopie-zapasowe\` w wersji do pobrania, `backups/` w wersji źródłowej) ze spójną kopią bazy (działa przy uruchomionej aplikacji), wszystkimi plikami CV i ofert oraz konfiguracją i promptami. **Kopia zawiera dane osobowe** – przechowuj ją w bezpiecznym miejscu.

Odtwarzanie opisuje plik `PRZYWRACANIE.txt` w archiwum: zamknij aplikację, skopiuj `app.db` i `files/` do folderu danych, a `config/` i `prompts/` do folderów konfiguracji; uruchom aplikację.

## RODO i bezpieczeństwo

### Przesyłanie danych do Anthropic – do konsultacji z IOD

**Przy domyślnym silniku lokalnym (Ollama) CV nie opuszczają komputera.**

**Po włączeniu Claude API tekst CV (wraz z danymi osobowymi w nim zawartymi, np. imieniem, nazwiskiem, kontaktem i przebiegiem kariery) jest wysyłany do API Anthropic w celu analizy.** Do API trafia również treść oferty i opis firmy. Pliki oryginalne i zdjęcia nie są wysyłane – ekstrakcja tekstu i OCR działają lokalnie.

Przed włączeniem Claude API **skonsultuj to z osobą odpowiedzialną za ochronę danych (IOD)**, w szczególności:
- podstawę prawną przetwarzania i treść klauzuli informacyjnej dla kandydatów (informacja o użyciu narzędzia AI wspierającego rekrutację i o odbiorcy danych),
- umowę powierzenia przetwarzania danych (DPA) z Anthropic i przekazywanie danych poza EOG,
- aktualne zasady Anthropic dotyczące przechowywania danych przesyłanych przez API (okres retencji, wykorzystanie do trenowania modeli; dostępność wariantów z ograniczoną retencją) – w aktualnych dokumentach na stronie Anthropic,
- fakt, że ocena jest pomocnicza, a decyzję podejmuje człowiek (art. 22 RODO).

### Przechowywanie i usuwanie

- Dane są przechowywane lokalnie: baza i pliki w katalogu `storage/` (w `.gitignore`), pliki pod losowymi nazwami (bez danych osobowych w nazwach).
- Treść CV nie jest zapisywana w logach aplikacji.
- **Usunięcie kandydata** („Usuń wszystkie dane” na karcie kandydata) usuwa plik CV, wyekstrahowany tekst, wszystkie analizy i notatki we wszystkich ofertach. „Usuń z oferty” usuwa zgłoszenie w danej ofercie (a gdy kandydat nie ma innych zgłoszeń – wszystkie jego dane).
- **Usunięcie oferty** usuwa jej zgłoszenia i analizy; kandydaci bez zgłoszeń w innych ofertach są usuwani w całości.
- **Zgoda na przyszłe rekrutacje** – pole na karcie kandydata. W **Kandydaci → „Do usunięcia”** widać osoby bez zgody, których wszystkie oferty są zarchiwizowane.
- **Retencja** (domyślnie wyłączona): `config/scoring.json → retencja`. Po włączeniu kandydaci (domyślnie tylko bez zgody), których ostatnie zgłoszenie jest starsze niż `dni`, są usuwani automatycznie przy starcie aplikacji i raz na dobę. Ręcznie: `npm run retention -- --dry` (podgląd) / `npm run retention`.
- Kopie zapasowe (`backups/`) również zawierają dane osobowe – obejmij je tą samą polityką retencji.

### Dostęp

- Aplikacja jest chroniona jednym hasłem, ustawianym przy pierwszym uruchomieniu (przechowywany jest tylko skrót scrypt) albo `APP_PASSWORD` w `.env`; sesja ważna 7 dni.
- Uruchamiaj ją tylko w sieci wewnętrznej. Przy udostępnieniu poza komputer lokalny użyj HTTPS (np. reverse proxy) i ustaw `COOKIE_SECURE=true`.
- Brak kont indywidualnych i dziennika zmian per użytkownik – jeśli to potrzebne, wymaga rozbudowy.

## Docker

```bash
docker compose up -d --build
```

Aplikacja: http://localhost:3000. Kontener łączy się z Ollamą zainstalowaną na komputerze-gospodarzu (`OLLAMA_URL=http://host.docker.internal:11434`); opcjonalny plik `.env` może nadpisać ustawienia. Dane są w wolumenie `./storage` (poza kontenerem), konfiguracja i prompty – w podmontowanych katalogach `./config` i `./prompts`. Obraz domyślnie zawiera LibreOffice (obsługa `.doc`); mniejszy obraz bez niego: `docker compose build --build-arg WITH_LIBREOFFICE=false`.

Kopia zapasowa w Dockerze: `docker compose exec porownywarka npm run backup` – archiwum pojawi się w katalogu `./backups` na hoście.

## Dane przykładowe (seed) i testy

```bash
npm run seed:generate   # tworzy seed/files: ofertę .docx i 3 fikcyjne CV (2× PDF, 1× DOCX)
npm run seed            # tworzy przykładową ofertę, analizuje CV wybranym silnikiem AI, drukuje raport
npm run seed -- --reset # usuwa poprzedni przykład i tworzy go od nowa
```

Profile przykładowych kandydatów: dokładne dopasowanie (dwukolumnowy PDF), kandydat z AWS zamiast Azure (PDF z układem „data | opis”), junior z dużym potencjałem (DOCX z tabelą układu). Raport trafia też do `storage/raport-seed.md`.

```bash
npm test          # testy jednostkowe i integracyjne (bez wywołań AI)
npm run typecheck
npm run lint
```

Testy obejmują: liczenie dopasowania i potencjału, weryfikację cytatów, ekstrakcję DOCX (nagłówki, listy, tabele), PDF (kolumny, układ „data | opis”, scalanie wierszy), OCR skanów i wykrywanie nieczytelnych plików, usuwanie danych (RODO) i retencję, silnik lokalny (na atrapie serwera Ollama: schemat JSON, temperatura 0, pobieranie modelu, test szybkości) i szacowanie kosztów.

## Struktura projektu

```
config/        kontekst firmy, mapa technologii, parametry oceny (edytowalne)
prompts/       prompty systemowe AI (edytowalne)
prisma/        schemat bazy i migracje
launcher/      program uruchamiający i migracje dla wersji do pobrania, instrukcja użytkownika
scripts/       budowanie paczki Windows, test paczki, kopia zapasowa, retencja
seed/          generator i skrypt danych przykładowych
src/app/       interfejs (Next.js App Router) i API
src/lib/
  extract/     ekstrakcja tekstu: DOCX, PDF (kolejność kolumn), OCR, .doc
  ai/          wywołania Claude API, schematy odpowiedzi, prompty
  scoring/     deterministyczne liczenie wyników
  jobs/        kolejka analiz (wznawiana po restarcie)
  services/    oferty, kandydaci, retencja
storage/       DANE OSOBOWE: baza i pliki (poza repozytorium)
tests/         testy (Vitest)
```

## Ograniczenia

- Kolejność tekstu w PDF jest odtwarzana heurystycznie – nietypowe układy (tekst w grafice, obrócone napisy) mogą zostać odczytane z błędami. Odczytany tekst widać na dole karty kandydata.
- Jakość OCR zależy od jakości skanu; przy niskiej pewności pojawia się ostrzeżenie.
- Model lokalny na komputerze bez karty graficznej jest wolny (minuty na CV), a małe modele (4B) oceniają mniej trafnie niż Claude – weryfikuj wyniki, zwłaszcza dowody oznaczone „?”.
- Kolejka analiz działa w procesie aplikacji (jedna instancja). SQLite wystarcza dla jednego działu – przy wielu równoczesnych użytkownikach warto przejść na PostgreSQL.
- Tekst w nagłówkach/stopkach dokumentów Word jest odczytywany; pola tekstowe (text boxy) – zależnie od dokumentu.
