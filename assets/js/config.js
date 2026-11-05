// Forbindelse til Supabase (database og login).
// Værdierne findes i Supabase under Project Settings -> API.
// "anon"/"publishable"-nøglen er beregnet til at stå offentligt i browseren;
// sikkerheden ligger i databasens regler (RLS). Læg ALDRIG "service_role"/"secret"-nøglen her.
window.HMF_CONFIG = {
  supabaseUrl: "http://127.0.0.1:54321",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
};
