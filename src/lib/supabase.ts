import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://nalzfneeucuiekwsalng.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hbHpmbmVldWN1aWVrd3NhbG5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODMzMDMsImV4cCI6MjA5NDk1OTMwM30.znRFNkKc23sK69dN1vXn9pO2zgkzoeXXHsPdBpUBmHE"
);
