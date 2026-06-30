declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined;
  }

  function serve(
    handler: (request: Request) => Response | Promise<Response>,
  ): void;
}

declare module 'npm:@supabase/supabase-js@2' {
  export function createClient(url: string, key: string, options?: Record<string, unknown>): {
    from(table: string): any;
  };
}
