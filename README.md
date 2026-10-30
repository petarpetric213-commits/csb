# NEXORA ERP

Kompletan ERP sistem za prehrambenu proizvodnju (originalni proizvod, inspirisan savremenim nemačkim ERP konceptima) — Next.js + Prisma + SQLite, sa pravim biznis logikom: state-machine tokovi dokumenata, rezervacije zaliha, proizvodnja po recepturama (BOM), kvalitet, naplata i audit trag.

## Brzi start

**Preduslov:** Node.js **22.5+** (aplikacija koristi ugrađeni `node:sqlite` driver — bez ijedne nativne zavisnosti).

```bash
npm install
npm run dev
```

To je sve. Pri prvom pokretanju `predev` hook automatski kreira bazu i ubacuje demo podatke (simulacija 6 meseci poslovanja), a svako sledeće pokretanje je trenutno.

Otvori http://localhost:3000 i uloguj se:

| Email | Lozinka | Rola |
|---|---|---|
| `admin@nexora.demo` | `demo1234` | Administrator (obe firme) |
| `verkauf@nexora.demo` | `demo1234` | Prodaja |
| `einkauf@nexora.demo` | `demo1234` | Nabavka |
| `lager@nexora.demo` | `demo1234` | Skladište |
| `produktion@nexora.demo` | `demo1234` | Proizvodnja |
| `qualitaet@nexora.demo` | `demo1234` | Kvalitet |
| `finanzen@nexora.demo` | `demo1234` | Finansije |
| `viewer@nexora.demo` | `demo1234` | samo čitanje |

`.env` **nije potreban** za lokalni rad. Po želji ga napravi iz `.env.example` (npr. za drugačiju putanju baze ili `NEXT_PUBLIC_DEMO_MODE=true`).

## Korisne komande

| Komanda | Opis |
|---|---|
| `npm run dev` | Razvojni server (auto-setup baze pri prvom pokretanju) |
| `npm run db:reset` | Briše bazu i ponovo je kreira + puni demo podacima |
| `npm run db:setup` | Ručno pokreće setup (idempotentno — ništa ne radi ako je baza spremna) |
| `npm run db:studio` | Prisma Studio (pregled podataka u browseru) |
| `npm run db:generate` | Regenerisanje Prisma klijenta posle izmene šeme |
| `npm run typecheck` | TypeScript provera |
| `npm test` | Vitest testovi |

## Šta je uključeno

- **Prodaja**: ponude → nalozi (approve → reserve → pick → pack → ship → complete), fakture, plaćanja, logistika
- **Nabavka**: nabavni nalozi, prijem robe sa lotovima i rokovima trajanja
- **Zalihe**: stanje po magacinima, rezervisane količine, korekcije, transferi, kompletan pregled knjiženja
- **Proizvodnja**: proizvodni nalozi po recepturama (BOM), rezervacija i potrošnja materijala, radilišta, MRP predlozi
- **Kvalitet**: kontrole (prijem/produkcija), karantin nekorektnih lotova
- **Organizacija**: zaposleni, zadaci, dokumenti, audit trag svake promene
- **Platforma**: RBAC uloge i dozvole, više firmi (company switcher), 3 jezika (en/de/sr), svetla/tamna tema, command palette (Ctrl+K)

Svaka akcija kroz UI prolazi kroz server servise sa validacijom, audit logom i notifikacijama — nema lažnih dugmadi.

## Arhitektura (kratko)

```
src/app          Next.js 14 App Router (stranice + /api rute)
src/components   UI kit, app shell, deljene komponente
src/lib          klijentski API sloj, i18n, status mašine, dozvole
src/server       servisi (sales, purchasing, inventory, production, quality …)
src/generated    generisani Prisma klijent (WASM query compiler)
prisma/          šema (46 tabela), migracije, seed
scripts/         setup/migracijske skripte (node:sqlite)
```

Detalji o offline Prisma konfiguraciji i prelasku na PostgreSQL: vidi `DATABASE.md`.
