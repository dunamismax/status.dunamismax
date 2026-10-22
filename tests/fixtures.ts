import type { Service } from '../src/lib/model.js';
export const service=(state:Service['check']['state']='operational',id='test'):Service=>({target:{id,name:id,group:'Tests',public_url:'',probe_url:'',expected_status:0},check:{target_id:id,check_kind:'test',state,checked_at:'2026-10-22T10:00:00Z',latency_ms:1,reason:'public safe reason',probe_version:'test-v1'}});
