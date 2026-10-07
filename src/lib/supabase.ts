import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  const missingVariables = [
    !supabaseUrl && 'EXPO_PUBLIC_SUPABASE_URL',
    !supabasePublishableKey && 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ].filter(Boolean).join(', ');

  throw new Error(
    `Configuração do Supabase ausente: ${missingVariables}.`,
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
