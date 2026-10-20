import { LookupHit } from "./types";

/** undefined = never looked up; null = looked up, not found. */
export class LookupCache {
  private readonly byValue = new Map<string, LookupHit | null>();
  private readonly byId = new Map<string, LookupHit | null>();

  private static vk(field: string, value: string): string { return `${field}|${value.trim().toUpperCase()}`; }
  private static ik(field: string, id: string): string { return `${field}|${id.toLowerCase()}`; }

  getByValue(field: string, value: string): LookupHit | null | undefined {
    return this.byValue.get(LookupCache.vk(field, value));
  }
  getById(field: string, id: string): LookupHit | null | undefined {
    return this.byId.get(LookupCache.ik(field, id));
  }
  put(field: string, hit: LookupHit): void {
    this.byValue.set(LookupCache.vk(field, hit.matchValue), hit);
    this.byId.set(LookupCache.ik(field, hit.id), hit);
  }
  markValueMissing(field: string, value: string): void { this.byValue.set(LookupCache.vk(field, value), null); }
  markIdMissing(field: string, id: string): void { this.byId.set(LookupCache.ik(field, id), null); }
  clear(): void { this.byValue.clear(); this.byId.clear(); }
}