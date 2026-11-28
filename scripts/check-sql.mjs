import { readFileSync } from 'node:fs'
const files = ['supabase/migrations/0001_schema.sql', 'supabase/migrations/0002_rls.sql', 'supabase/migrations/0003_rpc.sql', 'supabase/all-in-one.sql']
let failed = false
for (const file of files) {
  const sql = readFileSync(file, 'utf8')
  const dollars = (sql.match(/\$\$/g) || []).length
  const badDo = /^\s*do \$(?!\$)/m.test(sql)
  const badEnd = /^\s*end \$;(?!\$)/m.test(sql)
  const ok = dollars % 2 === 0 && !badDo && !badEnd
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${file} — $$=${dollars}, badDo=${badDo}, badEnd=${badEnd}`)
  if (!ok) failed = true
}
process.exit(failed ? 1 : 0)