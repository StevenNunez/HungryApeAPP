import type { Instrumentation } from 'next';

/**
 * Server errors nobody caught (an API route or page that blows up) go to the
 * error registry (src/lib/errores-servidor.ts), which emails Teo Labs the first
 * time a new one appears. Routes that do catch an error call `anotarError` themselves.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // The import must sit inside this exact check: Next replaces NEXT_RUNTIME at build
  // time and drops the branch from the edge bundle (nodemailer can't run there).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { anotarError } = await import('./lib/errores-servidor');
    await anotarError({
      origen: 'servidor',
      donde: `${context.routeType} ${context.routePath}`,
      error: err,
      detalle: {
        metodo: request.method,
        ruta: request.path,
        digest: typeof err === 'object' && err !== null && 'digest' in err ? String((err as { digest: unknown }).digest) : undefined,
      },
    });
  }
};
