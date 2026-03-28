import { createClient } from '@supabase/supabase-js'

// Replace these with your project's URL and Anon Key from your Supabase Dashboard
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
