/** Verify immutable frontend snapshots without writing to model/data directories. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir=resolve(project,'public/decision/legacy-v2');
const manifest=JSON.parse(await readFile(resolve(dir,'manifest.json'),'utf8'));
const hash=text=>createHash('sha256').update(text).digest('hex');
if(manifest.snapshot_version!=='legacy-v2-20261007'||manifest.data_status!=='legacy_model_fixture'||manifest.samples.length!==4)throw new Error('Unexpected decision snapshot manifest.');
for(const sample of manifest.samples){
  if(!/^[a-z]+-\d+\.json$/.test(sample.file))throw new Error('Invalid snapshot path.');
  const raw=await readFile(resolve(dir,sample.file),'utf8');const fixture=JSON.parse(raw);
  if(hash(raw)!==sample.sha256||fixture.id!==sample.id||fixture.snapshot_version!==manifest.snapshot_version||JSON.stringify(fixture.request)!==JSON.stringify(sample.request)||!manifest.sources.some(s=>s.path===fixture.source.path&&s.sha256===fixture.source.sha256))throw new Error(`Snapshot mismatch: ${sample.id}`);
  if(!fixture.output.recommended_plan||!fixture.output.confidence||!fixture.output.risk_summary||!fixture.output.limitations)throw new Error(`Incomplete snapshot: ${sample.id}`);
}
// Source files can legitimately be retrained by another agent; saved snapshots stay immutable.
let matched=0;
for(const source of manifest.sources){
  try{if(hash(await readFile(resolve(project,'..',source.path),'utf8'))===source.sha256)matched++;}catch{/* Deployments need only the checked-in frontend payload. */}
}
console.log(`[verify-decision-fixtures] 4 snapshots verified; ${matched}/${manifest.sources.length} current source hashes match the saved extraction.`);
