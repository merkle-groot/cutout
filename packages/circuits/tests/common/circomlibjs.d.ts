declare module "circomlibjs" {
  export function buildBabyjub(): Promise<{
    F: { e(x: unknown): unknown; toObject(x: unknown): bigint };
    Base8: [unknown, unknown];
    subOrder: bigint | { toString(): string };
    mulPointEscalar(p: readonly unknown[], s: bigint): unknown[];
    addPoint(p: readonly unknown[], q: readonly unknown[]): unknown[];
  }>;
}
