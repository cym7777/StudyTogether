import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function openDatabase(filename=':memory:') {
 const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 sqlite.exec('CREATE TABLE IF NOT EXISTS _local_migrations(name TEXT PRIMARY KEY)');
 // Recognize databases created by the initial local development version without rewriting data.
 if(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='members'").get()) sqlite.prepare('INSERT OR IGNORE INTO _local_migrations VALUES(?)').run('0001_core.sql');
 const migrationDir=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(migrationDir).filter(n=>n.endsWith('.sql')).sort()) {
  if(sqlite.prepare('SELECT name FROM _local_migrations WHERE name=?').get(name))continue;
  sqlite.exec('BEGIN IMMEDIATE');
  try{sqlite.exec(readFileSync(new URL(name,migrationDir),'utf8'));sqlite.prepare('INSERT INTO _local_migrations VALUES(?)').run(name);sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');sqlite.close();throw e;}
 }
 return {raw:sqlite,close:()=>sqlite.close(),async batch(statements) {
   sqlite.exec('BEGIN IMMEDIATE');
   try {const results=statements.map(s=>s.execute());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}
 },prepare(sql) {
   let args=[];return {bind(...values){args=values;return this;},execute(){const s=sqlite.prepare(sql);if(s.columns().length)return {results:s.all(...args),meta:{changes:0}};const r=s.run(...args);return {results:[],meta:{changes:Number(r.changes)}};},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:r.changes}};}};
 }};
}
