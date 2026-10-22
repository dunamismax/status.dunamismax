/** Read-only production acceptance. Denial probes roll back even if a grant is wrong. */
import { database } from '../src/lib/db.js';
export async function verifyPermissions() {
 if(process.env.PGDATABASE!=='status_dunamismax'||process.env.PGUSER!=='status_dunamismax_web')throw new Error('Use only the status web role');
 const pool=database(),db=await pool.connect();let denials=0;
 try{
  for(const table of ['rollups','incidents','maintenance_windows','deployment_events'])await db.query('SELECT 1 FROM app.'+table+' LIMIT 1');
  await db.query('SET default_transaction_read_only=off');
  for(const sql of ['SELECT 1 FROM app.targets','SELECT 1 FROM app.check_runs','SELECT 1 FROM app.alert_notifications','SELECT 1 FROM app.schema_migrations',"UPDATE app.rollups SET overall_state=overall_state WHERE false",'DELETE FROM app.deployment_events WHERE false','CREATE TABLE app._permission_probe(id integer)','CREATE TEMP TABLE _permission_probe(id integer)',"SELECT nextval('app.rollups_id_seq')",'SET ROLE status_dunamismax_owner','SET ROLE status_dunamismax_collector']) {
   await db.query('BEGIN');let denied=false;
   try{await db.query(sql);}catch(error){denied=(error as {code?:string}).code==='42501';}
   finally{await db.query('ROLLBACK');}
   if(!denied)throw new Error('Unexpected privilege: production acceptance failed');denials++;
  }
  console.log(`Web role: four permitted reads; ${denials} privilege denials passed with read-only default disabled.`);
 }finally{db.release();await pool.end();}
}
verifyPermissions().catch(()=>{console.error('Production permission verification failed.');process.exitCode=1;});
