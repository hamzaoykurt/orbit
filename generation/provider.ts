export type ModelRequest = { name: string; instructions: string; input: unknown; schema: object; signal?: AbortSignal };
export type ModelProvider = (request: ModelRequest) => Promise<unknown>;
export type ModelConfig = { apiKey?: string; model?: string; baseUrl?: string };

export function createModelProvider(config: ModelConfig, transport: typeof fetch = fetch): ModelProvider {
  return async ({ name, instructions, input, schema, signal }) => {
    if (!config.apiKey) throw new Error('provider-not-configured');
    const base = new URL(config.baseUrl || 'https://api.openai.com/v1/');
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('provider-config-invalid');
    const endpoint = new URL(`${base.href.replace(/\/$/, '')}/responses`);
    const response = await transport(endpoint, {
      method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000),
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model || 'gpt-5-mini', store: false, instructions,
        input: JSON.stringify(input), max_output_tokens: 6500,
        ...((config.model || 'gpt-5-mini').startsWith('gpt-5') ? { reasoning: { effort: 'low' } } : {}),
        text: { format: { type: 'json_schema', name, strict: true, schema } },
      }),
    });
    if (!response.ok) throw new Error(`provider-http-${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('provider-empty');
    let size = 0; let raw = ''; const decoder = new TextDecoder();
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 128 * 1024) { await reader.cancel(); throw new Error('provider-too-large'); }
        raw += decoder.decode(value, { stream: true });
      }
    } finally { reader.releaseLock(); }
    const payload = JSON.parse(raw + decoder.decode());
    if (payload.status !== 'completed' || payload.error) throw new Error('provider-incomplete');
    const messages = (payload.output || []).flatMap((item: { content?: { type: string; text?: string }[] }) => item.content || []);
    if (messages.some((item: { type: string }) => item.type === 'refusal')) throw new Error('provider-refusal');
    const text = messages.filter((item: { type: string }) => item.type === 'output_text').map((item: { text: string }) => item.text).join('');
    if (!text) throw new Error('provider-empty');
    return JSON.parse(text);
  };
}
