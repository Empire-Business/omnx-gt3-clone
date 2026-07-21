const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration() {
  const migrationPath = path.join(__dirname, '../supabase/migrations/20260309120000_meeting_enhancements.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('Running migration...');
  console.log('SQL length:', sql.length, 'characters');
  
  // Execute the entire SQL using rpc
  const { data, error } = await supabase.rpc('exec_sql', { query: sql });
  
  if (error) {
    console.error('Migration error:', error);
    // Try without exec_sql - just log the SQL for manual execution
    console.log('\n\n=== PLEASE RUN THIS SQL MANUALLY IN SUPABASE DASHBOARD ===\n');
    console.log(sql);
    console.log('\n=== END SQL ===\n');
  } else {
    console.log('Migration completed successfully!');
  }
}

runMigration().catch(console.error);
