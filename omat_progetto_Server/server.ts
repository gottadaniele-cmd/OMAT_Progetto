import http from 'http';
import https from 'https';
import fs from 'fs';
import crypto from 'crypto';
import express, { CookieOptions, NextFunction, Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { Pool } from 'pg';
import { getSupabaseClient } from './src/supabaseClient';

dotenv.config({ path: '.env', override: true });

type UserRole = 'azienda' | 'admin' | 'studente';
type OrderStatus = 'sent' | 'under-review' | 'approved' | 'in-production' | 'completed' | 'rejected';
type OrderPriority = 'standard' | 'urgent' | 'critical';
type PctoStatus = 'sent' | 'under-review' | 'approved' | 'rejected';

type TokenPayload = {
  id: number;
  email: string;
  role: UserRole;
  name: string;
};

type AuthenticatedRequest = Request & {
  user?: TokenPayload;
};

const app = express();
const HTTP_PORT = Number(process.env.PORT ?? 3001);
const HTTPS_PORT = Number(process.env.HTTPS_PORT ?? 3000);
const TOKEN_DURATION_SECONDS = Number(process.env.DURATA_TOKEN ?? 3600);
const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? process.env.POSTGRES_URL,
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

const jwtKey =
  process.env.JWT_SECRET ??
  (fs.existsSync('keys/jwtKey') ? fs.readFileSync('keys/jwtKey', 'utf8') : 'omat-dev-secret');

const cookieOptions: CookieOptions = {
  path: '/',
  httpOnly: true,
  secure: isProduction,
  maxAge: TOKEN_DURATION_SECONDS * 1000,
  sameSite: isProduction ? 'none' : 'lax',
};

const ORDER_STATUSES: OrderStatus[] = [
  'sent',
  'under-review',
  'approved',
  'in-production',
  'completed',
  'rejected',
];
const PCTO_STATUSES: PctoStatus[] = ['sent', 'under-review', 'approved', 'rejected'];
const ORDER_PRIORITIES: OrderPriority[] = ['standard', 'urgent', 'critical'];

app.use((req, _res, next) => {
  console.log(`${req.method}: ${req.originalUrl}`);
  next();
});

app.use(express.json({ limit: '25mb' }));
app.use(cookieParser());
app.use(
  cors({
    origin(origin, callback) {
      callback(null, origin ?? true);
    },
    credentials: true,
  }),
);

app.get('/', (_req, res) => {
  res.send({
    name: 'OMAT API',
    ok: true,
    clientUrl: 'http://127.0.0.1:4200',
    healthUrl: '/api/health',
  });
});

app.get('/.well-known/appspecific/com.chrome.devtools.json', (_req, res) => {
  res.status(204).send();
});

function createToken(payload: TokenPayload): string {
  return jwt.sign(payload, jwtKey, { expiresIn: TOKEN_DURATION_SECONDS });
}

function toTokenPayload(payload: any): TokenPayload {
  return {
    id: Number(payload.id),
    email: String(payload.email),
    role: payload.role,
    name: String(payload.name),
  };
}

function normalizeOrder(row: any) {
  const attachments = normalizeOrderAttachments(row);

  return {
    id: String(row.id),
    code: `OM-${String(row.id).padStart(4, '0')}`,
    title: row.nomeProdotto ?? 'Lavorazione senza titolo',
    customer: row.nomeAzienda ?? 'Azienda non disponibile',
    customerEmail: row.emailAzienda ?? '',
    material: row.materiale ?? 'Da definire',
    quantity: Number(row.quantita ?? 1),
    priority: ORDER_PRIORITIES.includes(row.urgenza) ? row.urgenza : 'standard',
    status: row.stato ?? 'sent',
    assignedAdmin: row.adminResponsabile ?? 'Da assegnare',
    createdAt: row.dataRichiesta,
    updatedAt: row.dataAggiornamento ?? row.dataRichiesta,
    deliveryDate: row.dataConsegna,
    description: row.descrizione ?? '',
    notes: row.noteAggiuntive,
    attachments,
  };
}

function normalizeOrderAttachments(row: any) {
  if (!row.disegno) {
    return [];
  }

  try {
    const parsed = JSON.parse(row.disegno);
    const rawAttachments = Array.isArray(parsed) ? parsed : [parsed];

    return rawAttachments.map((attachment, index) => ({
      id: attachment.id ?? `ordine-${row.id}-allegato-${index + 1}`,
      fileName: attachment.fileName ?? attachment.name ?? `Allegato ${index + 1}`,
      contentType: attachment.contentType ?? attachment.type ?? 'application/octet-stream',
      size: Number(attachment.size ?? 0),
      uploadedAt: attachment.uploadedAt ?? row.dataRichiesta,
      dataUrl: attachment.dataUrl,
    }));
  } catch {
    return [
      {
        id: `ordine-${row.id}-disegno`,
        fileName: row.disegno,
        contentType: 'application/octet-stream',
        size: 0,
        uploadedAt: row.dataRichiesta,
      },
    ];
  }
}

function serializeOrderAttachments(body: any): string | null {
  if (Array.isArray(body.attachments) && body.attachments.length) {
    return JSON.stringify(
      body.attachments.map((attachment: any, index: number) => ({
        id: attachment.id ?? `allegato-${index + 1}`,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        size: Number(attachment.size ?? 0),
        uploadedAt: new Date().toISOString(),
        dataUrl: attachment.dataUrl,
      })),
    );
  }

  return body.disegno ?? null;
}

function normalizePcto(row: any) {
  return {
    id: String(row.id),
    studentName: row.nome ?? 'Studente',
    studentSurname: row.cognome ?? '',
    email: row.email ?? '',
    city: row.citta ?? '',
    postalCode: row.cap ? String(row.cap) : '',
    school: row.scuola ?? '',
    classYear: row.classe ?? '',
    studyProgram: row.indirizzo ?? '',
    startDate: row.dataInizio,
    endDate: row.dataFine,
    motivation: row.motivazione ?? '',
    status: row.stato ?? 'sent',
    createdAt: row.createdAt ?? row.dataInizio,
  };
}

async function verifyPassword(plainPassword: string, dbPassword: string | null): Promise<boolean> {
  if (!dbPassword) {
    return false;
  }

  if (dbPassword.startsWith('$2a$') || dbPassword.startsWith('$2b$') || dbPassword.startsWith('$2y$')) {
    return bcrypt.compare(plainPassword, dbPassword);
  }

  return plainPassword === dbPassword;
}

async function ensureDatabaseSchema(): Promise<void> {
  // Creazione tabelle se non esistono
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ordini (
      id SERIAL PRIMARY KEY,
      "nomeProdotto" TEXT NOT NULL,
      descrizione TEXT,
      disegno TEXT,
      urgenza TEXT DEFAULT 'standard',
      "idAzienda" INTEGER,
      "dataRichiesta" DATE DEFAULT CURRENT_DATE,
      "dataConsegna" DATE,
      "noteAggiuntive" TEXT,
      quantita INTEGER DEFAULT 1,
      materiale TEXT,
      stato TEXT NOT NULL DEFAULT 'sent',
      "adminResponsabile" TEXT,
      "dataAggiornamento" TIMESTAMP WITH TIME ZONE
    );

    CREATE TABLE IF NOT EXISTS public."richiestePCTO" (
      id SERIAL PRIMARY KEY,
      scuola TEXT,
      classe TEXT,
      indirizzo TEXT,
      "dataInizio" DATE,
      "dataFine" DATE,
      motivazione TEXT,
      "idStudente" INTEGER,
      stato TEXT NOT NULL DEFAULT 'sent',
      "dataAggiornamento" TIMESTAMP WITH TIME ZONE
    );
  `);

  // Aggiornamento colonne esistenti (per sicurezza)
  await pool.query(`
    alter table public.ordini
      add column if not exists stato text not null default 'sent',
      add column if not exists "adminResponsabile" text,
      add column if not exists "dataAggiornamento" timestamp with time zone;
  `);

  await pool.query(`
    alter table public."richiestePCTO"
      add column if not exists stato text not null default 'sent',
      add column if not exists "dataAggiornamento" timestamp with time zone;
  `);
}

function assertOrderStatus(value: unknown): OrderStatus {
  if (typeof value === 'string' && ORDER_STATUSES.includes(value as OrderStatus)) {
    return value as OrderStatus;
  }

  throw new Error('Stato ordine non valido');
}

function assertPctoStatus(value: unknown): PctoStatus {
  if (typeof value === 'string' && PCTO_STATUSES.includes(value as PctoStatus)) {
    return value as PctoStatus;
  }

  throw new Error('Stato PCTO non valido');
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const bearerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice('Bearer '.length)
    : undefined;
  const token = req.cookies?.TOKEN ?? bearerToken;

  if (!token) {
    res.status(401).send('Token mancante');
    return;
  }

  jwt.verify(token, jwtKey, (err: any, payload: any) => {
    if (err) {
      res.status(401).send('Token non valido o scaduto');
      return;
    }

    req.user = toTokenPayload(payload);
    res.cookie('TOKEN', createToken(req.user), cookieOptions);
    next();
  });
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).send('Permessi insufficienti');
    return;
  }

  next();
}

function attachUserIfPresent(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const bearerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice('Bearer '.length)
    : undefined;
  const token = req.cookies?.TOKEN ?? bearerToken;

  if (!token) {
    next();
    return;
  }

  jwt.verify(token, jwtKey, (err: any, payload: any) => {
    if (!err) {
      req.user = toTokenPayload(payload);
    }

    next();
  });
}

app.get('/api/health', async (_req, res) => {
  const result = await pool.query('select now() as now');
  res.send({ ok: true, dbTime: result.rows[0].now });
});

app.get('/api/supabase-test', async (_req, res) => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('admin').select('*').limit(5);

    res.send({ data, error });
  } catch (error: any) {
    res.status(503).send({
      data: null,
      error: {
        message: error?.message ?? 'Supabase non configurato',
      },
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email ?? req.body.username ?? '').trim();
  const password = String(req.body.password ?? '');

  if (!email || !password) {
    res.status(400).send('Email e password sono obbligatorie');
    return;
  }

  const adminResult = await pool.query(
    'select "idLavoratore", nome, cognome, ruolo, email, password from public.admin where email = $1 limit 1',
    [email],
  );
  const admin = adminResult.rows[0];

  if (admin && (await verifyPassword(password, admin.password))) {
    const payload: TokenPayload = {
      id: Number(admin.idLavoratore),
      email: admin.email,
      role: 'admin',
      name: `${admin.nome} ${admin.cognome}`.trim(),
    };

    const token = createToken(payload);
    res.cookie('TOKEN', token, cookieOptions);
    res.send({ token, user: payload });
    return;
  }

  const companyResult = await pool.query(
    'select "idAzienda", "nomeAzienda", "emailAzienda", password from public.aziende where "emailAzienda" = $1 limit 1',
    [email],
  );
  const company = companyResult.rows[0];

  if (company && (await verifyPassword(password, company.password))) {
    const payload: TokenPayload = {
      id: Number(company.idAzienda),
      email: company.emailAzienda,
      role: 'azienda',
      name: company.nomeAzienda,
    };

    const token = createToken(payload);
    res.cookie('TOKEN', token, cookieOptions);
    res.send({ token, user: payload });
    return;
  }

  const studentResult = await pool.query(
    'select "idStudente", nome, cognome, email, password from public.studenti where email = $1 limit 1',
    [email],
  );
  const student = studentResult.rows[0];

  if (student && (await verifyPassword(password, student.password))) {
    const payload: TokenPayload = {
      id: Number(student.idStudente),
      email: student.email,
      role: 'studente',
      name: `${student.nome} ${student.cognome ?? ''}`.trim(),
    };

    const token = createToken(payload);
    res.cookie('TOKEN', token, cookieOptions);
    res.send({
      token,
      user: {
        ...payload,
        firstName: student.nome ?? '',
        lastName: student.cognome ?? '',
        city: student.citta ?? '',
        postalCode: student.cap ? String(student.cap) : '',
      },
    });
    return;
  }

  res.status(401).send('Email o password non validi');
});

app.post('/api/auth/logout', (_req, res) => {
  res.cookie('TOKEN', '', { ...cookieOptions, maxAge: -1 });
  res.send({ ok: true });
});

app.get('/api/auth/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user?.role === 'studente') {
    const result = await pool.query(
      `
        select "idStudente", nome, cognome, "numeroTelefono", email, citta, cap
        from public.studenti
        where "idStudente" = $1
        limit 1
      `,
      [req.user.id],
    );
    const student = result.rows[0];

    if (!student) {
      res.status(404).send('Studente non trovato');
      return;
    }

    res.send({
      id: Number(student.idStudente),
      email: student.email,
      role: 'studente',
      name: `${student.nome} ${student.cognome ?? ''}`.trim(),
      firstName: student.nome ?? '',
      lastName: student.cognome ?? '',
      city: student.citta ?? '',
      postalCode: student.cap ? String(student.cap) : '',
      phone: student.numeroTelefono ?? '',
    });
    return;
  }

  res.send(req.user);
});

app.post('/api/auth/register-company', async (req, res) => {
  const passwordHash = await bcrypt.hash(String(req.body.password), 10);

  const result = await pool.query(
    `
      insert into public.aziende ("nomeAzienda", "emailAzienda", password, luogo, "contattoTelefonico")
      values ($1, $2, $3, $4, $5)
      returning "idAzienda", "nomeAzienda", "emailAzienda", luogo, "contattoTelefonico"
    `,
    [
      req.body.nomeAzienda,
      req.body.emailAzienda,
      passwordHash,
      req.body.luogo,
      req.body.contattoTelefonico,
    ],
  );

  res.status(201).send(result.rows[0]);
});

app.post('/api/auth/register-admin', async (req, res) => {
  const passwordHash = await bcrypt.hash(String(req.body.password), 10);

  const result = await pool.query(
    `
      insert into public.admin (nome, cognome, ruolo, "dataNascita", "numeroTelefono", email, password)
      values ($1, $2, $3, $4, $5, $6, $7)
      returning "idLavoratore", nome, cognome, ruolo, "dataNascita", "numeroTelefono", email
    `,
    [
      req.body.nome,
      req.body.cognome,
      req.body.ruolo,
      req.body.dataNascita ?? null,
      req.body.numeroTelefono ?? null,
      req.body.email,
      passwordHash,
    ],
  );

  res.status(201).send(result.rows[0]);
});

app.post('/api/auth/register-student', async (req, res) => {
  const passwordHash = await bcrypt.hash(String(req.body.password), 10);

  const result = await pool.query(
    `
      insert into public.studenti (nome, cognome, "numeroTelefono", email, citta, cap, password)
      values ($1, $2, $3, $4, $5, $6, $7)
      returning "idStudente", nome, cognome, "numeroTelefono", email, citta, cap
    `,
    [
      req.body.nome,
      req.body.cognome ?? null,
      req.body.numeroTelefono,
      req.body.email,
      req.body.citta ?? null,
      Number(req.body.cap),
      passwordHash,
    ],
  );

  res.status(201).send(result.rows[0]);
});

app.get('/api/orders', requireAuth, async (req: AuthenticatedRequest, res) => {
  const params: any[] = [];
  const where: string[] = [];

  if (req.user?.role === 'azienda') {
    params.push(req.user.id);
    where.push(`o."idAzienda" = $${params.length}`);
  } else if (req.user?.role !== 'admin') {
    res.status(403).send('Permessi insufficienti per visualizzare gli ordini');
    return;
  }

  const result = await pool.query(
    `
      select
        o.*,
        a."nomeAzienda",
        a."emailAzienda"
      from public.ordini o
      left join public.aziende a on a."idAzienda" = o."idAzienda"
      ${where.length ? `where ${where.join(' and ')}` : ''}
      order by o."dataRichiesta" desc, o.id desc
    `,
    params,
  );

  res.send(result.rows.map(normalizeOrder));
});

app.get('/api/orders/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const params: any[] = [req.params.id];
  const where = ['o.id = $1'];

  if (req.user?.role === 'azienda') {
    params.push(req.user.id);
    where.push(`o."idAzienda" = $${params.length}`);
  }

  const result = await pool.query(
    `
      select
        o.*,
        a."nomeAzienda",
        a."emailAzienda"
      from public.ordini o
      left join public.aziende a on a."idAzienda" = o."idAzienda"
      where ${where.join(' and ')}
      limit 1
    `,
    params,
  );

  if (!result.rowCount) {
    res.status(404).send('Ordine non trovato');
    return;
  }

  res.send(normalizeOrder(result.rows[0]));
});

app.post('/api/orders', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Se è un'azienda usiamo il suo ID dal token, altrimenti cerchiamo idAzienda nel body
    const idAzienda = req.user?.role === 'azienda' 
      ? req.user.id 
      : Number(req.body.idAzienda || req.body.customer);

    if (!idAzienda || isNaN(idAzienda)) {
      console.error("Errore validazione ordine: idAzienda mancante o non numerico", { body: req.body });
      res.status(400).send('ID Azienda non valido. Seleziona un ID numerico valido.');
      return;
    }

    const result = await pool.query(
      `
        insert into public.ordini (
          "nomeProdotto",
          descrizione,
          disegno,
          urgenza,
          "idAzienda",
          "dataRichiesta",
          "dataConsegna",
          "noteAggiuntive",
          quantita,
          materiale
        )
        values ($1, $2, $3, $4, $5, current_date, $6, $7, $8, $9)
        returning *
      `,
      [
        req.body.nomeProdotto ?? req.body.title,
        req.body.descrizione ?? req.body.description,
        serializeOrderAttachments(req.body),
        req.body.urgenza ?? req.body.priority ?? 'standard',
        idAzienda,
        req.body.dataConsegna ?? null,
        req.body.noteAggiuntive ?? req.body.notes ?? null,
        Number(req.body.quantita ?? req.body.quantity),
        req.body.materiale ?? req.body.material,
      ],
    );

    // Recuperiamo l'ordine appena creato con i dati dell'azienda joinati per la normalizeOrder
    const enriched = await pool.query(
      `select o.*, a."nomeAzienda", a."emailAzienda" 
       from public.ordini o 
       left join public.aziende a on a."idAzienda" = o."idAzienda" 
       where o.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).send(normalizeOrder(enriched.rows[0]));
  } catch (error) {
    console.error("Errore salvataggio ordine:", error);
    res.status(500).send("Errore durante il salvataggio dell'ordine");
  }
});

app.patch('/api/orders/:id/status', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
  const status = assertOrderStatus(req.body.status);

  const result = await pool.query(
    `
      update public.ordini
      set stato = $1,
          "adminResponsabile" = $2,
          "dataAggiornamento" = current_timestamp
      where id = $3
      returning *
    `,
    [status, req.user?.name ?? 'Admin OMAT', req.params.id],
  );

  if (!result.rowCount) {
    res.status(404).send('Ordine non trovato');
    return;
  }

  const enriched = await pool.query(
    `
      select o.*, a."nomeAzienda", a."emailAzienda"
      from public.ordini o
      left join public.aziende a on a."idAzienda" = o."idAzienda"
      where o.id = $1
      limit 1
    `,
    [req.params.id],
  );

  res.send(normalizeOrder(enriched.rows[0]));
});

app.get('/api/pcto', requireAuth, requireAdmin, async (_req, res) => {
  const result = await pool.query(
    `
      select
        r.*,
        s.nome,
        s.cognome,
        s.email,
        s.citta,
        s.cap,
        r."dataInizio" as "createdAt"
      from public."richiestePCTO" r
      left join public.studenti s on s."idStudente" = r."idStudente"
      order by r."dataInizio" desc, r.id desc
    `,
  );

  res.send(result.rows.map(normalizePcto));
});

app.get('/api/pcto/:id', requireAuth, requireAdmin, async (req, res) => {
  const result = await pool.query(
    `
      select
        r.*,
        s.nome,
        s.cognome,
        s.email,
        s.citta,
        s.cap,
        r."dataInizio" as "createdAt"
      from public."richiestePCTO" r
      left join public.studenti s on s."idStudente" = r."idStudente"
      where r.id = $1
      limit 1
    `,
    [req.params.id],
  );

  if (!result.rowCount) {
    res.status(404).send('Richiesta PCTO non trovata');
    return;
  }

  res.send(normalizePcto(result.rows[0]));
});

app.patch('/api/pcto/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const status = assertPctoStatus(req.body.status);

  const result = await pool.query(
    `
      update public."richiestePCTO"
      set stato = $1,
          "dataAggiornamento" = current_timestamp
      where id = $2
      returning *
    `,
    [status, req.params.id],
  );

  if (!result.rowCount) {
    res.status(404).send('Richiesta PCTO non trovata');
    return;
  }

  const enriched = await pool.query(
    `
      select
        r.*,
        s.nome,
        s.cognome,
        s.email,
        s.citta,
        s.cap,
        r."dataInizio" as "createdAt"
      from public."richiestePCTO" r
      left join public.studenti s on s."idStudente" = r."idStudente"
      where r.id = $1
      limit 1
    `,
    [req.params.id],
  );

  res.send(normalizePcto(enriched.rows[0]));
});

app.post('/api/pcto', attachUserIfPresent, async (req: AuthenticatedRequest, res) => {
  const client = await pool.connect();

  try {
    await client.query('begin');

    let student = null;

    if (req.user?.role === 'studente') {
      const studentResult = await client.query(
        'select "idStudente", nome, cognome, "numeroTelefono", email, citta, cap from public.studenti where "idStudente" = $1 limit 1',
        [req.user.id],
      );
      student = studentResult.rows[0];
    } else {
      // Controlla se lo studente esiste già per email
      const existingStudent = await client.query(
        'SELECT * FROM public.studenti WHERE email = $1 LIMIT 1',
        [req.body.email]
      );

      if ((existingStudent.rowCount ?? 0) > 0) {
        student = existingStudent.rows[0];
      } else {
        const studentResult = await client.query(
          `
            insert into public.studenti (nome, cognome, "numeroTelefono", email, citta, cap, password)
            values ($1, $2, $3, $4, $5, $6, $7)
            returning *
          `,
          [
            req.body.nome ?? req.body.firstName,
            req.body.cognome ?? req.body.lastName,
            req.body.numeroTelefono ?? req.body.phone ?? 'Non indicato',
            req.body.email,
            req.body.citta ?? req.body.city ?? null,
            Number(req.body.cap ?? req.body.postalCode),
            await bcrypt.hash(String(req.body.password ?? crypto.randomUUID()), 10),
          ],
        );
        student = studentResult.rows[0];
      }
    }

    if (!student) {
      res.status(404).send('Studente non trovato');
      return;
    }

    const pctoResult = await client.query(
      `
        insert into public."richiestePCTO" (scuola, classe, indirizzo, "dataInizio", "dataFine", motivazione, "idStudente", stato)
        values ($1, $2, $3, $4, $5, $6, $7, 'sent')
        returning *
      `,
      [
        req.body.scuola ?? req.body.school,
        req.body.classe ?? req.body.classYear,
        req.body.indirizzo ?? req.body.studyProgram,
        req.body.dataInizio ?? req.body.startDate,
        req.body.dataFine ?? req.body.endDate,
        req.body.motivazione ?? req.body.motivation ?? null,
        student.idStudente,
      ],
    );

    await client.query('commit');

    res.status(201).send({
      student,
      request: normalizePcto({
        ...pctoResult.rows[0],
        nome: student.nome,
        cognome: student.cognome,
        email: student.email,
        citta: student.citta,
        cap: student.cap,
      }),
    });
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).send(err?.message ?? 'Errore interno del server');
});

async function startServer(): Promise<void> {
  await ensureDatabaseSchema();

  http.createServer(app).listen(HTTP_PORT, () => {
    console.log(`Server HTTP in ascolto sulla porta ${HTTP_PORT}`);
  });

  if (fs.existsSync('keys/privateKey.pem') && fs.existsSync('keys/certificate.crt')) {
    const credentials = {
      key: fs.readFileSync('keys/privateKey.pem', 'utf8'),
      cert: fs.readFileSync('keys/certificate.crt', 'utf8'),
    };

    https.createServer(credentials, app).listen(HTTPS_PORT, () => {
      console.log(`Server HTTPS in ascolto sulla porta ${HTTPS_PORT}`);
    });
  }
}

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
