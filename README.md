# Porównywarka CV – summ-it S.A.

Wewnętrzna aplikacja działu HR do zarządzania ofertami pracy i porównywania CV kandydatów z ofertami przy pomocy AI (Claude API). Wszystkie dane (baza, pliki CV) są przechowywane lokalnie.

> **Ocena AI ma charakter pomocniczy. Decyzję rekrutacyjną podejmuje człowiek.**

## Spis treści

1. [Co potrafi](#co-potrafi)
2. [Instalacja i uruchomienie](#instalacja-i-uruchomienie)
3. [Konfiguracja klucza API i modelu](#konfiguracja-klucza-api-i-modelu)
4. [Jak działa ocena](#jak-działa-ocena)
5. [Strojenie: wagi, mapa technologii, kontekst firmy, prompty](#strojenie)
6. [Kopia zapasowa i odtwarzanie](#kopia-zapasowa-i-odtwarzanie)
7. [RODO i bezpieczeństwo](#rodo-i-bezpieczeństwo)
8. [Docker](#docker)
9. [Dane przykładowe (seed) i testy](#dane-przykładowe-seed-i-testy)
10. [Struktura projektu](#struktura-projektu)
11. [Ograniczenia](#ograniczenia)

## Co potrafi

- **Oferty pracy** – dodawanie z plików Word (.docx; stary .doc konwertowany przez LibreOffice), także kilku naraz, lub z wklejonej treści. AI automatycznie odczytuje z pliku stanowisko i wymagane kompetencje (wymagane / mile widziane, kategoria, waga 1–3) – niezależnie od nazw sekcji i formatowania (listy, tabele, pogrubione nagłówki). Domyślnie oferta jest od razu aktywna; wymagania można w każdej chwili poprawić (albo odznaczyć automatyczną aktywację i przejrzeć je przed startem). Każda zmiana wymagań tworzy nową wersję. Archiwizacja, usuwanie, pobieranie oryginału.
- **Kandydaci** – wgrywanie wielu CV naraz (przeciągnij i upuść; PDF, DOCX, DOC). Ekstrakcja tekstu z zachowaniem kolejności w CV wielokolumnowych, OCR (polski + angielski) dla skanów. Każde CV jest automatycznie analizowane i dostaje krótki opis.
- **Wynik kandydata** – opis, dwa wskaźniki (Dopasowanie %, Potencjał %), tabela wymagań ze statusem, dowodem z CV i uzasadnieniem, składowe potencjału, mocne i słabe strony, technologie pokrewne, pytania na rozmowę, notatki rekrutera, podgląd i pobranie oryginalnego CV, historia analiz.
- **Archiwum** – wszystko zapisane trwale; ponowna analiza nie nadpisuje poprzedniej. Wyszukiwarka kandydatów we wszystkich ofertach (imię i nazwisko, technologia, słowo kluczowe – także bez polskich znaków). Przypisanie istniejącego kandydata do innej oferty bez ponownego wgrywania pliku.
- **Ustawienia** – edycja mapy technologii pokrewnych i opisu firmy z poziomu aplikacji.

## Instalacja i uruchomienie

Wymagania: **Node.js 22 lub nowszy** (https://nodejs.org). Opcjonalnie **LibreOffice** – tylko do obsługi starych plików `.doc` (bez niego aplikacja poprosi o zapis pliku jako `.docx`).

```bash
git clone https://github.com/kufelHARD/hr.git porownywarka-cv
cd porownywarka-cv
npm install
cp .env.example .env        # Windows: copy .env.example .env
# uzupełnij w .env: ANTHROPIC_API_KEY, APP_PASSWORD, AUTH_SECRET
npm run dev
```

Aplikacja działa pod adresem http://localhost:3000. Polecenie `npm run dev` samo tworzy katalog `storage/` i bazę danych (migracje).

Wersja produkcyjna (szybsza, do stałego użytku):

```bash
npm run build
npm start
```

> Jeśli `npm install` zakończy się błędem kompilacji `better-sqlite3` / `node-gyp` (zdarza się na niektórych wersjach npm w systemie Windows), użyj:
> `npm install --ignore-scripts` a następnie `npx prisma generate`. Moduły natywne mają gotowe binarki – kompilator nie jest potrzebny.

### Plik `.env`

| Zmienna | Opis |
|---|---|
| `ANTHROPIC_API_KEY` | Klucz API Anthropic (patrz niżej) |
| `ANTHROPIC_MODEL` | Model, domyślnie `claude-opus-5-5` |
| `ANTHROPIC_EFFORT` | Poziom wysiłku modelu: `low` / `medium` / `high` / `xhigh` / `max` (domyślnie `high`) |
| `ANALYSIS_TEMPERATURE` | Zostaw puste (patrz „Powtarzalność”) |
| `APP_PASSWORD` | Hasło do aplikacji (wspólne dla działu HR) |
| `AUTH_SECRET` | Losowy ciąg do podpisywania sesji, np. wynik `openssl rand -hex 32` |
| `DATA_DIR` | Katalog na bazę i pliki CV (domyślnie `./storage`) |
| `DATABASE_URL` | Ścieżka do bazy SQLite (domyślnie `file:./storage/app.db`) |
| `ANALYSIS_CONCURRENCY` | Ile CV analizować równolegle (domyślnie 2) |
| `OCR_ENABLED` | OCR skanów PDF (`true`/`false`) |
| `SOFFICE_PATH` | Ścieżka do LibreOffice, jeśli nie jest wykrywany automatycznie |
| `COOKIE_SECURE` | `true`, jeśli aplikacja jest udostępniona przez HTTPS |

## Konfiguracja klucza API i modelu

1. Zaloguj się na https://console.anthropic.com (konto firmowe), dodaj metodę płatności lub doładuj środki.
2. **API Keys → Create Key**, skopiuj klucz i wpisz go w `.env` jako `ANTHROPIC_API_KEY=...`.
3. Uruchom aplikację ponownie. W **Ustawieniach** zobaczysz, czy klucz jest ustawiony.

Klucz API jest rozliczany za użycie i jest niezależny od subskrypcji claude.ai. Nie zapisuj go w repozytorium (plik `.env` jest w `.gitignore`).

**Koszt** (zmierzony na danych przykładowych, `claude-opus-5-5`, effort `high`): ok. **0,15–0,21 USD za analizę jednego CV** i kilka centów za wyodrębnienie wymagań z oferty. Kolejne CV do tej samej oferty są tańsze dzięki cache’owaniu wspólnej części zapytania (opis firmy, mapa technologii, oferta). Analiza trwa zwykle 1–2 minuty na CV. Tańszą alternatywą jest `ANTHROPIC_MODEL=claude-sonnet-5-5` (ok. połowa ceny) – warto wtedy porównać wyniki na kilku znanych CV.

**Powtarzalność.** Aktualne modele (w tym `claude-opus-5-5`) nie przyjmują parametru `temperature` – zapytanie z nim kończy się błędem. Powtarzalność zapewniają: wymuszony schemat odpowiedzi JSON (walidowany w kodzie), precyzyjne definicje statusów i skal w prompcie, liczenie wyników przez kod (nie przez AI) oraz zapisywanie każdej analizy (nic nie jest przeliczane po cichu). `ANALYSIS_TEMPERATURE` jest wysyłana tylko, gdy ją ustawisz – dla starszych modeli, które ją obsługują.

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

Wszystkie poniższe pliki można edytować bez zmian w kodzie. Zmiany obowiązują od następnej analizy; zapisane analizy zachowują parametry, z którymi je policzono.

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

```bash
npm run backup                     # → backups/backup-RRRRMMDD-GGMM.tar.gz
npm run backup -- --dir D:\kopie   # inny katalog docelowy
```

Archiwum zawiera spójną kopię bazy (działa także przy uruchomionej aplikacji), wszystkie pliki z `storage/files` oraz `config/` i `prompts/`. **Kopia zawiera dane osobowe** – przechowuj ją w bezpiecznym miejscu (szyfrowany dysk, ograniczony dostęp).

Odtwarzanie: zatrzymaj aplikację, rozpakuj archiwum (`tar -xzf backup-….tar.gz`), skopiuj `app.db` i katalog `files/` do `storage/`, a `config/` i `prompts/` do katalogu aplikacji; uruchom aplikację.

## RODO i bezpieczeństwo

### Przesyłanie danych do Anthropic – do konsultacji z IOD

**Tekst CV (wraz z danymi osobowymi w nim zawartymi, np. imieniem, nazwiskiem, kontaktem i przebiegiem kariery) jest wysyłany do API Anthropic (Claude) w celu analizy.** Do API trafia również treść oferty i opis firmy. Pliki oryginalne i zdjęcia nie są wysyłane – ekstrakcja tekstu i OCR działają lokalnie.

Przed użyciem produkcyjnym **skonsultuj to z osobą odpowiedzialną za ochronę danych (IOD)**, w szczególności:
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

- Aplikacja jest chroniona jednym hasłem (`APP_PASSWORD`); sesja ważna 7 dni.
- Uruchamiaj ją tylko w sieci wewnętrznej. Przy udostępnieniu poza komputer lokalny użyj HTTPS (np. reverse proxy) i ustaw `COOKIE_SECURE=true`.
- Brak kont indywidualnych i dziennika zmian per użytkownik – jeśli to potrzebne, wymaga rozbudowy.

## Docker

```bash
cp .env.example .env    # uzupełnij klucz i hasło
docker compose up -d --build
```

Aplikacja: http://localhost:3000. Dane są w wolumenie `./storage` (poza kontenerem), konfiguracja i prompty – w podmontowanych katalogach `./config` i `./prompts`. Obraz domyślnie zawiera LibreOffice (obsługa `.doc`); mniejszy obraz bez niego: `docker compose build --build-arg WITH_LIBREOFFICE=false`.

Kopia zapasowa w Dockerze: `docker compose exec porownywarka npm run backup` – archiwum pojawi się w katalogu `./backups` na hoście.

## Dane przykładowe (seed) i testy

```bash
npm run seed:generate   # tworzy seed/files: ofertę .docx i 3 fikcyjne CV (2× PDF, 1× DOCX)
npm run seed            # tworzy przykładową ofertę, analizuje CV (wymaga klucza API), drukuje raport
npm run seed -- --reset # usuwa poprzedni przykład i tworzy go od nowa
```

Profile przykładowych kandydatów: dokładne dopasowanie (dwukolumnowy PDF), kandydat z AWS zamiast Azure (PDF z układem „data | opis”), junior z dużym potencjałem (DOCX z tabelą układu). Raport trafia też do `storage/raport-seed.md`.

```bash
npm test          # testy jednostkowe i integracyjne (bez wywołań AI)
npm run typecheck
npm run lint
```

Testy obejmują: liczenie dopasowania i potencjału, weryfikację cytatów, ekstrakcję DOCX (nagłówki, listy, tabele), PDF (kolumny, układ „data | opis”, scalanie wierszy), OCR skanów i wykrywanie nieczytelnych plików oraz usuwanie danych (RODO) i retencję.

## Struktura projektu

```
config/        kontekst firmy, mapa technologii, parametry oceny (edytowalne)
prompts/       prompty systemowe AI (edytowalne)
prisma/        schemat bazy i migracje
scripts/       kopia zapasowa, retencja, przygotowanie katalogów
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
- Kolejka analiz działa w procesie aplikacji (jedna instancja). SQLite wystarcza dla jednego działu – przy wielu równoczesnych użytkownikach warto przejść na PostgreSQL.
- Tekst w nagłówkach/stopkach dokumentów Word jest odczytywany; pola tekstowe (text boxy) – zależnie od dokumentu.
