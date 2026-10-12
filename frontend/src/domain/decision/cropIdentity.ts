/** Product identity is independent of the IDs registered by each data source. */
export function cropIdentity(crop: string): string {
  return crop === '马铃薯' ? '土豆' : crop;
}
export function sameCrop(a: string, b: string): boolean { return cropIdentity(a) === cropIdentity(b); }
export function resolveSourceCrop(crop: string, registered: readonly string[]): string | undefined {
  return registered.find(value => value === crop) ?? registered.find(value => sameCrop(value, crop));
}
