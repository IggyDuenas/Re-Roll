import type { Store } from '../types';
import { localStore } from './local';
import { supabaseStore } from './supabase';

export function getStore(): Store {
  return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? supabaseStore : localStore;
}
