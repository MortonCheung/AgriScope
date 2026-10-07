export type ProviderMode='api'|'fixtures'|'mock'|'unavailable';
export function resolveProviderMode(mode:string|undefined,demoEnabled:boolean,production:boolean):ProviderMode{
  if(mode===undefined||mode==='')return 'api';if(mode==='api')return 'api';
  if(mode==='fixtures'||mode==='mock')return production&&!demoEnabled?'unavailable':mode;
  return 'unavailable';
}
