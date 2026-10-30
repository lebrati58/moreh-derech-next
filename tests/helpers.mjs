import pg from 'pg';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

export const PGHOST = process.env.PGHOST || '/var/tmp';
export const PGPORT = process.env.PGPORT || '5433';

// Crée une base neuve, charge le schéma (+ démo) et renvoie un client.
export async function freshDb(name, { seed = true } = {}) {
  const admin = new pg.Client({ host: PGHOST, port: PGPORT, user: 'postgres', database: 'postgres' });
  await admin.connect();
  await admin.query(`drop database if exists ${name}`);
  await admin.query(`create database ${name}`);
  await admin.end();
  const c = new pg.Client({ host: PGHOST, port: PGPORT, user: 'postgres', database: name });
  await c.connect();
  await c.query(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  if (seed) await c.query(readFileSync(new URL('../supabase/seed_demo.sql', import.meta.url), 'utf8'));
  await c.query(`select mdl.set_admin_password('test-password-123')`);
  return c;
}

// Appel d'une fonction RPC exactement comme PostgREST le fait (arguments nommés).
export async function rpc(c, fn, args = {}) {
  const keys = Object.keys(args);
  const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
  const { rows } = await c.query(sql, keys.map(k => {
    const v = args[k];
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v;
  }));
  return rows[0].r;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
