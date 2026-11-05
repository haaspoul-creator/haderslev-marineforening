# Vejledning – Haderslev Marineforenings hjemmeside

## Log ind
1. Du får et personligt link fra en administrator (på mail eller SMS). Åbn det, ret evt. dit navn, og vælg en adgangskode (mindst 8 tegn).
2. Næste gang: tryk **Log ind** øverst til højre, og skriv din e-mail og adgangskode.
3. Glemt adgangskoden? Kontakt en fra bestyrelsen, så får du et nyt link.
4. Under dit navn øverst kan du rette dit navn, skifte adgangskode og logge ud.

## Vagter (medlemmer)
- Gå til **Vagter**. Sæt flueben i **Jeg tager vagten** for at tage en vagt. Fjern fluebenet for at afmelde dig.
- Dine vagter er fremhævet og mærket **Din vagt**. Står der **Fuld**, er alle pladser taget.
- På mobil: stryg sidelæns på tabellen for at se fluebenet.

## Beskeder (medlemmer)
- Skriv i feltet og tryk **Send besked**. Du kan slette dine egne beskeder (tryk **Slet** to gange).

## For administratorer
**Tilføj arrangement:** Gå til **Arrangementskalender** → tryk **Tilføj arrangement** → udfyld titel og dato (tid, sted og beskrivelse er valgfrit) → **Tilføj til kalenderen**. Arrangementet vises straks, også på forsiden som "Næste arrangement". Slet med **Slet** (to tryk).

**Tilføj vagt:** Gå til **Vagter** → **Tilføj vagt** → udfyld vagt, dato og **antal pladser** → **Tilføj vagt**. Hvis du sletter en vagt, slettes tilmeldingerne også.

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
