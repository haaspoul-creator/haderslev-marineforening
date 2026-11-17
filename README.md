# Haderslev Marineforening

Hjemmeside for Haderslev Marineforening.

## Filer

- `index.html`: selve siden (Om os, Aktiviteter, Bliv medlem, Kontakt)
- `style.css`: farver og layout (virker også på mobil)

Tekster i [firkantede klammer] er pladsholdere og skal udskiftes med foreningens egne oplysninger.

Siden er en ren statisk side (HTML + CSS). Den har ingen database, ingen build-trin og ingen afhængigheder.

## Se siden på din egen computer

1. Download repoet: grøn knap **Code → Download ZIP**, og pak det ud.
2. Dobbeltklik på `index.html`. Siden åbner i din browser.

## Deploy på Vercel

### 1. Opret en Vercel-konto
1. Gå til https://vercel.com/signup
2. Vælg **Continue with GitHub**, og log ind med GitHub-kontoen `haaspoul-creator`.
3. Vælg planen **Hobby** (gratis).

### 2. Importér projektet
1. Gå til https://vercel.com/new
2. Under **Import Git Repository**: find `haderslev-marineforening`, og klik på **Import**.
   - Kan du ikke se repoet, så klik på **Adjust GitHub App Permissions**, og giv Vercel adgang til det.
3. Indstillinger på næste side:
   - **Project Name**: `haderslev-marineforening`
   - **Framework Preset**: **Other**
   - **Root Directory**: `./`
   - **Build Command**: lad feltet være tomt
   - **Output Directory**: lad feltet være tomt (Vercel bruger roden)
   - **Environment Variables**: ingen
4. Klik på **Deploy**.
5. Efter ca. 30 sekunder er siden online på en adresse som
   `https://haderslev-marineforening.vercel.app`

### 3. Automatiske opdateringer
Vercel holder øje med `main`-grenen på GitHub:
- Hver ændring på `main` sættes automatisk online (Production).
- Ændringer på andre grene får deres egen preview-adresse, så de kan ses, før de kommer på den rigtige side.

Redigér direkte på GitHub: åbn filen, klik på blyanten ✏️, ret teksten, og klik på **Commit changes**. Siden er opdateret ca. et minut efter.

### 4. Eget domæne (valgfrit)
Vil I have en adresse som `www.haderslev-marineforening.dk`?

1. Køb domænet hos en dansk udbyder (fx Simply, One.com eller GratisDNS).
2. I Vercel: åbn projektet → **Settings → Domains**, skriv domænet, og klik på **Add**.
3. Vercel viser de DNS-poster, der skal oprettes hos domæneudbyderen. Typisk:
   - `www` → **CNAME** → `cname.vercel-dns.com`
   - `@` (selve domænet) → **A** → `76.76.21.21`
4. Vent til Vercel viser **Valid Configuration** (fra få minutter op til et døgn). HTTPS bliver slået til automatisk.

### Alternativ: deploy fra kommandolinjen
Kræver Node.js installeret.

```bash
npm i -g vercel
vercel login
vercel --prod
```
