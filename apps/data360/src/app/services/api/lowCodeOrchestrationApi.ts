import apiClient from '@/lib/api-client';

export async function getLowCodeBootstrap() {
  const [connect, workflow, cortex] = await Promise.allSettled([
    apiClient.get('/connect/connectors/capabilities').then((r) => r.data),
    apiClient.get('/api/v1/workflows/capabilities').then((r) => r.data),
    apiClient.get('/cortex/capabilities').then((r) => r.data),
  ]);

  const toPayload = (result: PromiseSettledResult<any>) =>
    result.status === 'fulfilled'
      ? { ok: true, data: result.value }
      : { ok: false, error: String(result.reason || 'unknown_error') };

  return {
    modules: {
      connect: toPayload(connect),
      workflow: toPayload(workflow),
      cortex: toPayload(cortex),
    },
    generated_at: new Date().toISOString(),
  };
}
