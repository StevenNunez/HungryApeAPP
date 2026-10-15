/**
 * Tiny chainable fake of the supabase-js query builder for route tests.
 * Every call chain ends in a `Call` handed to `handler`, which returns what the real
 * query would resolve to. Calls are also recorded in `calls` for assertions.
 */
export interface Call {
  table: string;
  op: 'select' | 'insert' | 'upsert' | 'update' | 'delete';
  payload?: any;
  filters: Record<string, any>;
  single: boolean;
  head: boolean;
}
export type Result = { data?: any; error?: any; count?: number | null };

export function fakeSupabase(handler: (c: Call) => Result | undefined) {
  const calls: Call[] = [];

  const from = (table: string) => {
    const call: Call = { table, op: 'select', filters: {}, single: false, head: false };
    const run = (): Promise<Result> => {
      calls.push({ ...call });
      const r = handler(call) ?? {};
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null, count: r.count ?? null });
    };
    const builder: any = {
      select: (_cols?: string, opts?: { head?: boolean }) => { if (opts?.head) call.head = true; return builder; },
      insert: (p: any) => { call.op = 'insert'; call.payload = p; return builder; },
      upsert: (p: any) => { call.op = 'upsert'; call.payload = p; return builder; },
      update: (p: any) => { call.op = 'update'; call.payload = p; return builder; },
      delete: () => { call.op = 'delete'; return builder; },
      eq: (k: string, v: any) => { call.filters[k] = v; return builder; },
      is: (k: string, v: any) => { call.filters[`${k}:is`] = v; return builder; },
      not: (k: string) => { call.filters[`${k}:not`] = true; return builder; },
      lt: (k: string, v: any) => { call.filters[`${k}:lt`] = v; return builder; },
      limit: () => builder,
      order: () => builder,
      single: () => { call.single = true; return run(); },
      maybeSingle: () => { call.single = true; return run(); },
      then: (resolve: any, reject: any) => run().then(resolve, reject),
    };
    return builder;
  };

  return { client: { from, auth: { getUser: async () => ({ data: { user: null } }) } } as any, calls };
}
