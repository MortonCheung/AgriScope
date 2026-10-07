import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

const env={...loadEnv('production',process.cwd(),'VITE_'),...process.env};
const demo=env.VITE_ENABLE_DEMO==='true'&&['fixtures','mock'].includes(env.VITE_DECISION_PROVIDER);
if(!demo){
  // Vite copies public assets before this boundary check. Keep source fixtures for
  // explicit demos and their existing tests, remove only generated build output.
  rmSync(resolve('dist/decision'),{recursive:true,force:true});
  const files=readdirSync('dist/assets').filter(name=>name.endsWith('.js'));
  for(const file of files){
    const text=readFileSync(resolve('dist/assets',file),'utf8');
    if(/decision-ui-test-v0|decision-ui-formula-v0|test-native-contract|decision\/index\.json|test_state=normal|LegacyStressExperiment|公式情景：收入减成本/.test(text))throw new Error(`Demo payload/code in formal build: ${file}`);
  }
  if(existsSync('dist/decision'))throw new Error('Historical fixtures in formal build');
}
console.log(`Production boundary PASS (${demo?'explicit historical demo':'formal API / unavailable'})`);
