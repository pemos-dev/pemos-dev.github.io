/* The publishable/anon key is intended for browser use. Protect data with Supabase RLS. */
(() => {
  const SUPABASE_URL = 'https://tuavqypvnxzajbtgldaz.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_W6EUTfPqdpO96mGEAv0uDQ_4jMzNlaV';
  if (!window.supabase?.createClient) {
    window.portfolioDbError = 'The database client could not be loaded. Check your connection and refresh.';
    return;
  }
  window.portfolioDb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
})();
