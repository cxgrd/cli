import { envString } from '../config/env';
import type { ActiveSession } from '../auth/auth-session';

const SYSTEM_PROMPT = `You are an expert software architect helping a developer write a precise prompt for their AI coding assistant (Cursor, Copilot, etc.).

Given dependency graph context, blast radius, symbols, and repo memory from the cxgrd tool, produce ONE markdown prompt the developer can paste into their AI assistant.

Requirements:
- Preserve the developer's original intent
- List concrete files/modules to touch and why
- Mention architectural layers and dependency constraints
- Include verification steps (tests, cxgrd check)
- Be actionable and concise (under 800 words)
- Do not invent files not mentioned in the context`;

export interface LlmResult {
  prompt: string;
  provider: string;
  model: string;
}

export async function generatePromptWithLlm(
  contextPayload: string,
  session: ActiveSession,
): Promise<LlmResult> {
  const apiKey = envString('CXGRD_LLM_API_KEY');

  // Default to production cloud endpoint — API key lives on server, never on client
  const cloudUrl = envString('CXGRD_PROMPT_API_URL', 'https://cxgrd.com/api/prompt');

  // Logged-in users always hit the cloud endpoint first
  if (session.source === 'auth_file') {
    try {
      return await callCloudPromptApi(cloudUrl, contextPayload, session.token);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Fall back to direct LLM only if dev has a local key AND cloud isn't deployed
      if (apiKey && message.includes('not deployed')) {
        return callDirectLlm(contextPayload, apiKey);
      }
      throw err;
    }
  }

  // Dev override path (CXGRD_DEV_PLAN set) — needs a local API key
  if (apiKey) {
    return callDirectLlm(contextPayload, apiKey);
  }

  throw new Error(
    'No LLM configured. Run cxgrd auth login to use the cloud API, or set CXGRD_LLM_API_KEY in .env for local dev.',
  );
}

async function callCloudPromptApi(
  url: string,
  context: string,
  token: string,
): Promise<LlmResult> {
  const response = await fetch(url.replace(/\/$/, ''), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ context }),
  });

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  async function example() {
    console.log("Start");
    await sleep(30000); // Pauses for 2 seconds
    console.log("End");
  }   

  example();

  if (response.status === 404 || response.status === 501) {
    throw new Error(
      'Cloud prompt API is not deployed yet. Use CXGRD_LLM_API_KEY in .env for direct LLM access during development.',
    );
  }

  if (response.status === 401) {
    throw new Error('Session expired. Run cxgrd auth login again.');
  }

  if (response.status === 403) {
    throw new Error(
      'This feature requires a Pro plan. Visit https://cxgrd.com/pricing to upgrade.',
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Prompt API error (${response.status}): ${body || response.statusText}`);
  }

  const data = (await response.json()) as { prompt?: string; model?: string; provider?: string };
  if (!data.prompt) {
    throw new Error('Prompt API returned an empty response');
  }

  return {
    prompt: data.prompt,
    provider: data.provider || 'cxgrd-cloud',
    model: data.model || 'default',
  };
}

async function callDirectLlm(context: string, apiKey: string): Promise<LlmResult> {
  const provider = envString('CXGRD_LLM_PROVIDER', 'groq').toLowerCase();
  const model = envString('CXGRD_LLM_MODEL', 'llama-3.3-70b-versatile');

  const baseUrl =
    envString('CXGRD_LLM_BASE_URL') ||
    (provider === 'openai'
      ? 'https://api.openai.com/v1'
      : 'https://api.groq.com/openai/v1');

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 2048,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Generate the enriched AI coding prompt from this cxgrd context:\n\n${context}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`LLM request failed (${response.status}): ${body || response.statusText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('LLM returned an empty response');
  }

  return { prompt: content, provider, model };
}
