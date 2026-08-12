import Anthropic from '@anthropic-ai/sdk'
import { buildSystemPrompt, TURN_SCHEMA } from '../src/scenario/prompt'
import type { GameState } from '../src/engine/types'

export const config = { runtime: 'edge' }

const MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 1024
/** 화당 8턴 × 3화 = 24턴. 넉넉히 잡되 무한 이력은 막는다. */
const MAX_HISTORY = 48

type Turn = { role: 'user' | 'assistant'; content: string }
type ChatRequest = { state: GameState; history: Turn[]; message: string }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function isState(v: unknown): v is GameState {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  return (
    typeof s.run === 'number' &&
    typeof s.affection === 'number' &&
    (s.scene === 1 || s.scene === 2 || s.scene === 3) &&
    typeof s.turnInScene === 'number'
  )
}

function parseBody(body: unknown): ChatRequest | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  if (!isState(b.state)) return null
  if (typeof b.message !== 'string' || !b.message.trim()) return null

  const raw = Array.isArray(b.history) ? b.history : []
  const history: Turn[] = raw
    .filter((t): t is Turn => {
      if (typeof t !== 'object' || t === null) return false
      const x = t as Record<string, unknown>
      return (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string'
    })
    .slice(-MAX_HISTORY)

  return { state: b.state, history, message: b.message.slice(0, 2000) }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let payload: ChatRequest | null
  try {
    payload = parseBody(await req.json())
  } catch {
    payload = null
  }
  if (!payload) return json({ error: 'bad_request' }, 400)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ error: 'missing_api_key' }, 500)

  const { state, history, message } = payload

  // 유저 입력은 항상 유저 발화로만 취급한다. 지시로 해석하지 않는다.
  const messages = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user' as const, content: message },
  ]

  try {
    const response = await new Anthropic({ apiKey }).messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(state),
      messages,
      thinking: { type: 'disabled' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: TURN_SCHEMA },
      },
    })

    if (response.stop_reason === 'refusal') {
      return json({ error: 'refusal' }, 502)
    }

    const raw = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')

    // 파싱과 상태 전이는 클라이언트의 src/engine 한 곳에서만 한다.
    return json({ raw })
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status : undefined
    return json({ error: 'upstream_failed', status }, 502)
  }
}
