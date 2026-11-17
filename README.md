# Haderslev Marineforening

Hjemmeside for Haderslev Marineforening.

## Filer

- `index.html`: selve siden (Om os, Aktiviteter, Bliv medlem, Kontakt)
- `style.css`: farver og layout (virker også på mobil)

Tekster i [firkantede klammer] er pladsholdere og skal udskiftes med foreningens egne oplysninger.

## Se siden på din egen computer

1. Download repoet: grøn knap **Code → Download ZIP**, og pak det ud.
2. Dobbeltklik på `index.html`. Siden åbner i din browser.

## Læg siden online gratis med GitHub Pages

Repoet skal være **Public** (det er det allerede).

1. Gå til repoet på GitHub: https://github.com/haaspoul-creator/haderslev-marineforening
2. Klik på **Settings** (tandhjulet øverst).
3. Klik på **Pages** i menuen til venstre.
4. Under **Build and deployment**:
   - **Source**: vælg **Deploy from a branch**
   - **Branch**: vælg **main** og mappen **/ (root)**
   - Klik på **Save**
5. Vent 1–2 minutter, og genindlæs siden. Øverst står der nu:
   **"Your site is live at https://haaspoul-creator.github.io/haderslev-marineforening/"**
6. Klik på linket. Det er foreningens hjemmeside, og den kan deles med alle.

## Opdatere siden

Hver gang der bliver lavet en ændring på `main`-grenen (fra Claude eller direkte på GitHub), bliver siden automatisk opdateret inden for 1–2 minutter.

Redigér direkte på GitHub: åbn filen, klik på blyanten ✏️, ret teksten, og klik på **Commit changes**.

## Eget domæne (valgfrit)

Vil I have en adresse som `www.haderslev-marineforening.dk`?

1. Køb domænet hos en dansk udbyder (fx Simply, One.com eller GratisDNS).
2. Opret hos udbyderen en **CNAME**-post: `www` → `haaspoul-creator.github.io`
3. Skriv domænet under **Settings → Pages → Custom domain** på GitHub, og klik på **Save**.
4. Sæt flueben i **Enforce HTTPS**, når det bliver muligt (kan tage op til et døgn).
