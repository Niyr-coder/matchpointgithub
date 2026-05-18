import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// Cargar env
const env = readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim();

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const email = 'qa-user@matchpoint.test';
const password = 'QaTest1234!';

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { display_name: 'QA Tester' }
});

if (error) {
  if (error.message.includes('already')) {
    console.log('User ya existe — listo para login');
    console.log('email:', email);
    console.log('password:', password);
  } else {
    console.error('error:', error.message);
    process.exit(1);
  }
} else {
  console.log('user creado:', data.user.id);
  console.log('email:', email);
  console.log('password:', password);
}
