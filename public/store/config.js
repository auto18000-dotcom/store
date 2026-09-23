// TourGuid Store -- Supabase configuration (Dev tier).
//
// SUPABASE_ANON_KEY here must be the PUBLISHABLE key (sb_publishable_...).
// That key is public by design -- every TourGuid app build ships it -- and
// belongs in client-side code. It is NOT the same as a secret/service-role
// key, which must never appear here or in any browser bundle.
window.TOURGUID_STORE_CONFIG = {
  SUPABASE_URL: "https://rcckjhxqepvkciugobqd.supabase.co",
  SUPABASE_ANON_KEY: "REPLACE_WITH_DEV_PUBLISHABLE_KEY",
};
