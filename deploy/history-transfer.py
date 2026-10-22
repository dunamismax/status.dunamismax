#!/usr/bin/python3
"""Private, streaming history export and explicit PostgreSQL -> MySQL reconciliation.
No shell interpolation, secrets in argv, or notifications. Run under the shared lock.
"""
import os,sys,json,subprocess,fcntl
from pathlib import Path
TABLES=['targets','check_runs','rollups','incidents','maintenance_windows','deployment_events','alert_notifications']
JSON_FIELDS={'public_payload','snapshot','affected_targets','metadata'}
def locked():
 if os.geteuid()!=0: sys.exit('root required')
 try: fcntl.flock(9,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except OSError: sys.exit('with-deploy-lock required')
def mysql(sql):
 return subprocess.check_output(['/usr/bin/mysql','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','status_dunamismax'],input=sql.encode(),stderr=subprocess.DEVNULL).decode()
def export(directory):
 directory.mkdir(mode=0o700,parents=True,exist_ok=True)
 statements=["SET time_zone='+00:00'; SET TRANSACTION ISOLATION LEVEL REPEATABLE READ; START TRANSACTION WITH CONSISTENT SNAPSHOT;"]
 for table in TABLES:
  columns=[line.split('\t')[0] for line in mysql('SHOW COLUMNS FROM '+table).splitlines()]
  fields=','.join("'%s',%s"%(c,'CAST(id AS CHAR)' if c=='id' else '`'+c+'`') for c in columns)
  statements += ["SELECT '__STATUS_TABLE_%s__';"%table,'SELECT JSON_OBJECT('+fields+') FROM '+table+' ORDER BY id;']
 statements.append('COMMIT;')
 proc=subprocess.Popen(['/usr/bin/mysql','--quick','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','status_dunamismax'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
 proc.stdin.write('\n'.join(statements));proc.stdin.close()
 output=None
 try:
  for line in proc.stdout:
   if line.startswith('__STATUS_TABLE_'):
    if output:output.close()
    table=line.strip()[15:-2]
    if table not in TABLES:raise RuntimeError('unknown table marker')
    file=directory/(table+'.jsonl');output=file.open('w');os.chmod(file,0o600)
   else:
    if output is None:raise RuntimeError('missing table marker')
    output.write(line)
  if proc.wait()!=0:raise RuntimeError('MySQL export failed')
 finally:
  if output:output.close()
  if proc.poll() is None:proc.kill();proc.wait()
 print('exported seven history tables')
def reverse():
 # Preserve every PostgreSQL row including post-cutover writes. Shared lock alone
 # does not stop collectors: caller MUST stop both writers before invoking this.
 sql=['SET time_zone=\'+00:00\';','START TRANSACTION;','SET FOREIGN_KEY_CHECKS=0;']
 p=subprocess.Popen(['/usr/bin/mysql','--default-character-set=utf8mb4','status_dunamismax'],stdin=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
 try:
  for line in sql:p.stdin.write(line+'\n')
  for table in reversed(TABLES):p.stdin.write('DELETE FROM '+table+';\n')
  for table in TABLES:
   proc=subprocess.Popen(['/usr/sbin/runuser','-u','postgres','--','/usr/bin/psql','-X','-qAt','-v','ON_ERROR_STOP=1','-d','status_dunamismax','-c','SELECT row_to_json(t) FROM app.'+table+' t ORDER BY id'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,cwd='/tmp')
   for line in proc.stdout:
    row=json.loads(line);cols=list(row)
    def literal(k,v):
     if v is None:return 'NULL'
     if k in JSON_FIELDS:v=json.dumps(v,ensure_ascii=False,separators=(',',':'))
     elif k.endswith('_at') and isinstance(v,str):v=v.replace('T',' ').replace('+00:00','').rstrip('Z')
     return "CONVERT(X'%s' USING utf8mb4)"%str(v).encode().hex()
    p.stdin.write('INSERT INTO '+table+'('+','.join('`'+c+'`' for c in cols)+') VALUES('+','.join(literal(k,row[k]) for k in cols)+');\n')
   if proc.wait()!=0:raise RuntimeError('export failed')
  p.stdin.write('SET FOREIGN_KEY_CHECKS=1; COMMIT;\n');p.stdin.close()
  if p.wait()!=0:raise RuntimeError('reverse import failed')
 except BaseException:
  p.kill();p.wait();raise
 print('reconciled PostgreSQL history into retained MySQL database')
if __name__=='__main__':
 locked()
 if len(sys.argv)==3 and sys.argv[1]=='export':export(Path(sys.argv[2]))
 elif sys.argv[1:]==['reverse']:reverse()
 else:sys.exit('Usage: history-transfer.py export PRIVATE_DIRECTORY | reverse')
