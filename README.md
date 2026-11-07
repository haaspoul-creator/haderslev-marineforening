# Haderslev Marineforening – hjemmeside

Den enklest mulige opbygning:
- **Sider:** almindelige HTML-, CSS- og JavaScript-filer uden byggetrin.
- **Server:** én fil, `api/index.js` (Node), med én afhængighed: Postgres-driveren `postgres`.
- **Database:** almindelig **PostgreSQL**. Skemaet ligger i `api/_skema.sql`.
- **Login:** indbygget. Adgangskoder gemmes med scrypt, og login holdes i en sikker cookie. Der er ingen ekstern login- eller mailtjeneste: administratorer laver personlige links til medlemmerne.

| Side | Adgang |
|---|---|
| Hjem, Om os, Arrangementskalender, Galleri | offentlig |
| Vagter, Beskeder | kræver login |
| Administration | kun administratorer |

Varekataloget til slopkisten ligger i `api/_slopkisten.json`. Alle regler for, hvem der må hvad, ligger i `api/index.js` og testes af `tools/test.mjs`.

## Drift på Vercel + Neon (gratis)
1. Læg mappen på GitHub, og importer repositoriet på vercel.com (Add New → Project). Der er intet byggetrin.
2. I Vercel-projektet: **Storage → Create Database → Neon (Postgres)**. Så sættes `DATABASE_URL` automatisk.
3. Opret tabeller og første administrator fra din egen computer:
   ```
   DATABASE_URL="<værdien fra Vercel>" node tools/opret-admin.mjs din@mail.dk "Dit Navn" https://dit-domæne.dk
   ```
   Åbn linket, der skrives ud, og vælg en adgangskode. Resten klares fra siden Administration.
4. Tilføj domænet `haderslevmarineforening.dk` under Settings → Domains, og ret DNS hos One.com. Gamle adresser omdirigeres via `vercel.json`.

## Uden Vercel
Siden kører på enhver server med Node 18+ og PostgreSQL:
```
npm install
DATABASE_URL=postgres://... PORT=8080 node tools/server.mjs
```

## Lokal test
```
docker run -d --name hmf-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=hmf -p 5432:5432 postgres:17-alpine
export DATABASE_URL=postgres://postgres:test@localhost:5432/hmf NODE_ENV=development
node tools/server.mjs &
node tools/test.mjs     # sletter alt i den lokale database og tester API og rettigheder
```
