# Haderslev Marineforening – hjemmeside

Det er en statisk side (HTML, CSS og JavaScript uden byggetrin) på **Netlify** (gratis). Database og login ligger hos **Supabase** (gratis plan).

| Side | Adgang |
|---|---|
| Hjem, Om os, Arrangementskalender, Galleri | offentlig |
| Vagter, Beskeder | kræver login |
| Administration | kun administratorer |

Sikkerheden ligger i databasens regler (Row Level Security) i `supabase/migrations/`, ikke i browseren.

## Sådan sættes siden i drift (ca. 30 minutter)
1. **Supabase:** Opret et projekt på supabase.com (region EU, Frankfurt). Gå til SQL Editor, og kør de to filer i `supabase/migrations/` i rækkefølge.
2. **Edge-funktion** (bruges til at invitere medlemmer): `npx supabase login`, derefter `npx supabase link --project-ref <ref>` og `npx supabase functions deploy medlemmer`.
3. **Login-indstillinger** i Supabase under Authentication → Sign In / Providers: slå "Allow new users to sign up" FRA. Sæt URL Configuration → Site URL til `https://haderslevmarineforening.dk/log-ind/`, og tilføj `https://haderslevmarineforening.dk/**` som Redirect URL. Oversæt gerne e-mailskabelonerne (Invite, Magic Link, Reset Password) til dansk.
4. **E-mail:** Supabase' indbyggede mailafsendelse er begrænset til få mails i timen. Opsæt gratis SMTP (fx Brevo) under Authentication → SMTP.
5. Ret `assets/js/config.js` med projektets URL og anon/publishable-nøgle (Project Settings → API).
6. **Netlify:** Læg mappen på GitHub, og opret et site i Netlify ud fra repoet (intet byggetrin). Tilføj domænet `haderslevmarineforening.dk`, og ret DNS hos One.com, så den peger på Netlify. Gamle adresser omdirigeres via `netlify.toml`.
7. **Første administrator:** Inviter dig selv under Authentication → Users → Invite. Sæt derefter din rolle i SQL Editor: `update profiler set rolle='admin' where email='din@mail.dk';`. Resten klares fra siden Administration.

## Lokal udvikling og test
```
npx supabase start          # kræver Docker
python3 -m http.server 8080
node tools/test-sikkerhed.mjs   # 38 test af adgangsregler
```
