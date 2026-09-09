declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined;
  }

  function serve(
    handler: (request: Request) => Response | Promise<Response>,
  ): void;

  function test(name: string, testFunction: () => void | Promise<void>): void;
}

declare module 'npm:@supabase/supabase-js@2' {
  export function createClient(url: string, key: string, options?: Record<string, unknown>): {
    from(table: string): any;
    rpc(name: string, parameters?: Record<string, unknown>): Promise<{ data: any; error: any }>;
    auth: any;
    storage: any;
  };
}

declare module 'npm:qrcode@1.5.4' {
  const QRCode: {
    toDataURL(value: string, options?: Record<string, unknown>): Promise<string>;
  };
  export default QRCode;
}
