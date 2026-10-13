import type { Store } from '../types';
import { localStore } from './local';
import { supabaseStore } from './supabase';

export function getStore(): Store {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return supabaseStore;
  if (process.env.VERCEL) {
    // Serverless filesystems are read-only/ephemeral, so the JSON file store would silently lose data.
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on Vercel (the local JSON store is dev-only).');
  }
  return localStore;
}
