const pool = require('../connection');

async function inspect() {
  console.log('=== DATABASE AUDIT: TRIGGERS, FUNCTIONS, PROCEDURES ===\n');

  // 1. Triggers
  const triggers = await pool.query(`
    SELECT trigger_name, event_manipulation, event_object_table, action_statement, action_timing
    FROM information_schema.triggers
    WHERE trigger_schema NOT IN ('pg_catalog', 'information_schema')
  `);
  console.log('1. TRIGGERS found:', triggers.rows.length);
  triggers.rows.forEach(t => console.log(`   - Trigger: [${t.trigger_name}] on table [${t.event_object_table}] (${t.action_timing} ${t.event_manipulation})`));

  // 2. Routines (Functions & Procedures)
  const routines = await pool.query(`
    SELECT r.routine_name, r.routine_type, r.data_type, p.prokind
    FROM information_schema.routines r
    JOIN pg_catalog.pg_proc p ON p.proname = r.routine_name
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    GROUP BY r.routine_name, r.routine_type, r.data_type, p.prokind
    ORDER BY r.routine_type, r.routine_name
  `);
  console.log('\n2. ROUTINES found in public schema:', routines.rows.length);
  routines.rows.forEach(r => {
    const kind = r.prokind === 'p' ? 'PROCEDURE' : (r.prokind === 'f' ? 'FUNCTION' : r.routine_type);
    console.log(`   - [${kind}] ${r.routine_name} -> Returns: ${r.data_type || 'void'}`);
  });

  // 3. Tables
  const tables = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  console.log('\n3. TABLES in public schema:', tables.rows.map(r => r.table_name).join(', '));

  process.exit(0);
}

inspect().catch(err => {
  console.error('Error inspecting database:', err);
  process.exit(1);
});
