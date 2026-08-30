export type ModelRequest = { name: string; instructions: string; input: unknown; schema: object; signal?: AbortSignal };
export type ModelProvider = (request: ModelRequest) => Promise<unknown>;
export type ModelConfig = { apiKey?: string; model?: string; baseUrl?: string; provider?: 'openai' | 'gemini' };
export type ProviderBindings = { AI_PROVIDER?: string; OPENAI_API_KEY?: string; OPENAI_MODEL?: string; OPENAI_BASE_URL?: string; GEMINI_API_KEY?: string; GEMINI_MODEL?: string };
export function resolveModelConfig(env:ProviderBindings):ModelConfig {
  const provider=env.AI_PROVIDER?.trim().toLowerCase() || (env.GEMINI_API_KEY?'gemini':'openai');
  if(provider==='gemini')return {provider,apiKey:env.GEMINI_API_KEY,model:env.GEMINI_MODEL?.trim()||'gemini-2.0-flash'};
  if(provider==='openai')return {provider,apiKey:env.OPENAI_API_KEY,model:env.OPENAI_MODEL?.trim()||'gpt-5-mini',baseUrl:env.OPENAI_BASE_URL};
  throw new Error('provider-config-invalid');
}

export function createModelProvider(config: ModelConfig, transport: typeof fetch = fetch): ModelProvider {
  return async ({ name, instructions, input, schema, signal }) => {
    if (!config.apiKey) throw new Error('provider-not-configured');
    if(config.provider==='gemini')return generateGemini(config,{name,instructions,input,schema,signal},transport);
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

async function generateGemini(config:ModelConfig,request:ModelRequest,transport:typeof fetch):Promise<unknown> {
  const model=config.model||'gemini-2.0-flash';
  if(!/^gemini-[a-zA-Z0-9._-]+$/.test(model))throw new Error('provider-config-invalid');
  // One configured provider only: quota errors never trigger a paid fallback.
  const response=await transport(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
    method:'POST',signal:request.signal||AbortSignal.timeout(45_000),
    headers:{'x-goog-api-key':config.apiKey!,'Content-Type':'application/json'},
    body:JSON.stringify({systemInstruction:{parts:[{text:request.instructions}]},contents:[{role:'user',parts:[{text:JSON.stringify(request.input)}]}],
    // Gemini's JSON mode is intentionally paired with the server-side validator.
    // Its schema dialect differs across model versions; sending the full OpenAI
    // schema can cause an otherwise valid request to be rejected before generation.
    generationConfig:{responseMimeType:'application/json',maxOutputTokens:6500},
    }),
  });
  if(!response.ok){await response.body?.cancel();throw new Error(`provider-http-${response.status}`);}
  const reader=response.body?.getReader();if(!reader)throw new Error('provider-empty');
  let size=0,raw='';const decoder=new TextDecoder();
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>128*1024){await reader.cancel();throw new Error('provider-too-large');}raw+=decoder.decode(value,{stream:true});}}finally{reader.releaseLock();}
  const payload=JSON.parse(raw+decoder.decode());
  if(payload.error||payload.promptFeedback?.blockReason)throw new Error('provider-refusal');
  const candidate=payload.candidates?.[0];
  if(candidate?.finishReason!=='STOP')throw new Error('provider-incomplete');
  const text=(candidate.content?.parts||[]).filter((part:{thought?:boolean;text?:unknown})=>!part.thought&&typeof part.text==='string').map((part:{text:string})=>part.text).join('');
  if(!text)throw new Error('provider-empty');
  const cleaned=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  try{return JSON.parse(cleaned);}catch{
    const start=cleaned.indexOf('{'),end=cleaned.lastIndexOf('}');
    if(start>=0&&end>start){try{return JSON.parse(cleaned.slice(start,end+1));}catch{/* validation layer reports malformed output */}}
    throw new Error('provider-malformed');
  }
}
