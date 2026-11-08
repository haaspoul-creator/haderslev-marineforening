# Vejledning – Haderslev Marineforenings hjemmeside

## Log ind
1. Du får et personligt link fra en administrator (på mail eller SMS). Åbn det, ret evt. dit navn, og vælg en adgangskode (mindst 8 tegn).
2. Næste gang: tryk **Log ind** øverst til højre, og skriv din e-mail og adgangskode.
3. Glemt adgangskoden? Kontakt en fra bestyrelsen, så får du et nyt link.
4. Tryk på dit navn øverst til højre (på mobil: i menuen) for Min profil, Forslag, Administration og Log ud. Under Min profil øverst kan du rette dit navn, skifte adgangskode og logge ud.

## Tilmelding til arrangementer (alle)
- Gå til **Arrangementskalender** (eller tryk **Tilmeld dig** ved næste arrangement på forsiden), og tryk **Tilmeld**.
- Skriv dit navn og antal personer (dig selv og evt. gæster, 1–20), og tryk **Tilmeld**. Du behøver ikke at logge ind.
- Ud for hvert arrangement står, hvor mange der er tilmeldt (og hvor mange pladser der er, hvis der er en grænse).
- Vil du afmelde dig, så tryk **Afmeld** ved din tilmelding. Det virker fra samme telefon/computer, som du tilmeldte dig fra – eller hvor som helst, hvis du var logget ind. Ellers kontakt bestyrelsen.

## Vagter (medlemmer)
- Gå til **Vagter**. Sæt flueben i **Jeg tager vagten** for at tage en vagt. Fjern fluebenet for at afmelde dig.
- Dine vagter er fremhævet og mærket **Din vagt**. Står der **Fuld**, er alle pladser taget.
- På mobil vises hver vagt som et kort med fluebenet nederst.
- **Udskriv vagtliste:** Vælg "Alle kommende vagter" eller en måned, og tryk **Udskriv vagtliste**. Listen viser de tilmeldte og en tom streg for hver ledig plads – god til opslagstavlen i Marinestuen.

## Billeder i galleriet (medlemmer)
- Gå til **Galleri**, og tryk **Læg billeder ind**. Vælg et eller flere billeder (højst 20 ad gangen) fra telefonen eller computeren.
- Skriv en fælles **billedtekst** (fx "Julefrokost 2026"), evt. en dato, og for hvert billede kort **hvad det viser** (bruges af blinde og svagtseende). Tryk **Læg i galleriet**.
- Billederne gøres automatisk mindre, og GPS-oplysninger fjernes. Læg kun billeder ind, som de viste personer er indforståede med.
- Dine billeder kan ses af medlemmerne med det samme og bliver offentlige, når bestyrelsen har godkendt dem. Du kan altid slette dine egne billeder.

## Slopkisten (medlemmer)
- Gå til **Slopkisten**. Find varen via kategorierne eller ved at søge på navn eller varenummer (fx C121050).
- Vælg størrelse/variant og antal, og tryk **Læg i kurv**. Udfyld **navn, e-mail og telefon** (skal udfyldes – navn og e-mail er sat ind fra din konto) og evt. en bemærkning (fx broderi). Tjek **oversigten** over varer og antal, og tryk **Bestil**. Bagefter står der **✓ Bestilt** med en oversigt over det, du har bestilt.
- Slopbestyreren kontakter dig om pris, betaling og udlevering. Under **Dine bestillinger** (i bestillingsfeltet) og **Mine bestillinger** længere nede kan du følge status, og du kan annullere, så længe bestillingen står som **Ny**.

## Beskeder (medlemmer)
- Skriv i feltet og tryk **Send besked**. Du kan slette dine egne beskeder (tryk **Slet** to gange).

## Forslag til hjemmesiden
- Har du en idé eller en rettelse? Tryk **Forslag til hjemmesiden** nederst på siden (eller under dit navn → Min profil). Vælg siden, skriv forslaget og tryk **Send forslag**.
- Du kan følge dit forslag og se bestyrelsens svar. Et forslag, der ikke er behandlet endnu, kan du trække tilbage.

## For administratorer
**Billeder:** Nye billeder fra medlemmer har en orange stiplet ramme og "Afventer godkendelse" i galleriet. Tryk **Godkend** for at gøre dem offentlige, eller **Slet**. På Administration står, hvor mange der venter.

**Slopkisten:** Øverst på siden Slopkisten ser administratorer alle bestillinger med medlemmets navn, e-mail og telefon. Skift status (Ny → Bestilt hjem → Klar til afhentning → Udleveret, eller Annulleret) – medlemmet ser status med det samme. Tryk **Udskriv** for at udskrive den enkelte bestilling på én side med varenumre og felter til dato for udlevering og betaling. Varekataloget ligger i filen `api/_slopkisten.json` (hentet fra marineforeningen.dk) og kan rettes der.

**Forslag:** Gå til **Forslag** (link under Administration). Sæt status (Ny, I gang, Udført, Ikke aktuelt), skriv evt. et kort svar og tryk **Gem**. Medlemmet ser svaret med det samme.

**Tilføj arrangement:** Gå til **Arrangementskalender** → tryk **Tilføj arrangement** → udfyld titel og dato (tid, sted og beskrivelse er valgfrit). Vælg om der skal være **tilmelding med navn og antal** (slået til som standard), og skriv evt. et **maks. antal personer** → **Tilføj til kalenderen**.

**Deltagerliste:** Tryk **Deltagerliste** ud for et arrangement for at se navne, antal og i alt. Herfra kan du **kopiere** eller **udskrive** listen og fjerne en tilmelding med **×**. Kun administratorer kan se navnene – andre ser kun antallet. Arrangementet vises straks, også på forsiden som "Næste arrangement". Har du skrevet forkert, så tryk **Ret** ud for arrangementet, ret felterne og tryk **Gem ændringer** (eller **Annuller**). Slet med **Slet** (to tryk).

**Tilføj vagt:** Gå til **Vagter** → **Tilføj vagt** → udfyld vagt, dato og **antal pladser** → **Tilføj vagt**. Ret en vagt med **Ret** (antal pladser kan ikke sættes lavere end antallet af tilmeldte). Skal en person fjernes fra en vagt, så tryk **×** ved navnet (to tryk). Hvis du sletter en vagt, slettes tilmeldingerne også.

**Galleri:** Tryk på et billede for at se det stort. Bladr med pilene (eller stryg på mobilen), og luk med × eller Esc.

**Ny Ankerpost eller nyhed:** Gå til **Administration** (øverst, ved dit navn) → **Ny nyhed på forsiden** → skriv overskrift og kort tekst, vælg evt. PDF-filen (højst 3 MB) → **Offentliggør**. Den nyeste nyhed vises på forsiden.

**Medlemmer:** I **Administration** → **Inviter et medlem** (navn, e-mail og rolle) → **Opret og lav link**. Tryk **Kopier link**, og send det på SMS, eller tryk **Send på mail**, så åbnes en færdig mail. Linket virker i 14 dage. Har et medlem glemt sin kode, så tryk **Nyt link** ud for navnet. I listen kan du skifte rolle:
- *Administrator*: kan oprette og slette arrangementer, vagter og nyheder, slette alle beskeder og styre medlemmer.
- *Medlem*: kan tage vagter og skrive beskeder.
- *Skrivebeskyttet*: kan kun læse.
**Fjern** sletter brugerens konto (deres beskeder bliver stående som "Tidligere medlem").

## Rette fast tekst (Om os, galleri, kontakt)
Teksterne ligger i almindelige HTML-filer (fx `om-os/index.html`). Den nemmeste vej: åbn filen på GitHub, tryk på blyanten, ret teksten og tryk **Commit changes**. Vercel lægger ændringen ud efter ca. et minut.
- Menu, adresse, telefon, e-mail og Facebook-link rettes i `tools/faelles.mjs`. Kør bagefter `node tools/faelles.mjs`, så alle sider opdateres (eller bed webmasteren om det).
- Nyt billede i galleriet: læg billedet i `assets/img/galleri/` (højst ca. 1400 px bredt) og kopier en `<figure>`-blok i `galleri/index.html`. Skriv altid en alt-tekst, der beskriver billedet.
