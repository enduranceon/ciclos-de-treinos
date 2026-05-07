import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tcdoxeduhwyvhkxwrymj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pIBbWPeeC9rhd1-DrWU0SQ_ef0waSCV';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
