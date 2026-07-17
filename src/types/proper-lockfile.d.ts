declare module "proper-lockfile" {
  export type LockOptions = {
    realpath?: boolean;
    stale?: number;
    update?: number;
    retries?: number | {
      retries?: number;
      factor?: number;
      minTimeout?: number;
      maxTimeout?: number;
      randomize?: boolean;
    };
  };

  export function lock(path: string, options?: LockOptions): Promise<() => Promise<void>>;
}
