import Anthropic from '@anthropic-ai/sdk'
import { buildSystemPrompt, TURN_SCHEMA } from '../src/scenario/prompt.js'
import { mockTurn } from '../src/scenario/mock.js'
import type { GameState } from '../src/engine/types.js'

/**
 * 런타임은 **Node.js**다 (Vercel 기본값이라 선언하지 않는다).
 *
 * edge로 두면 배포가 깨진다: `@anthropic-ai/sdk`가 `node:fs`·`node:path`를 참조하는데
 * (`core/credentials`의 프로필 인증 해석, `tools/agent-toolset`) edge 런타임은 이를 지원하지 않는다.
 * 우리는 apiKey를 직접 넘기므로 그 코드가 실행되진 않지만, 정적 import라 번들에는 들어간다.
 * (2026-08-13 실측: "Edge Function api/chat is referencing unsupported modules")
 *
 * 이 제품에서 지연을 지배하는 건 LLM 호출(초 단위)이라 edge의 콜드스타트 이점은 무의미하다.
 *
 * **상대 경로 import에는 `.js` 확장자를 붙인다.** package.json이 `"type": "module"`이라
 * Vercel이 컴파일한 함수는 ESM으로 실행되고, ESM Node는 확장자를 생략한 상대 경로를 해석하지 못한다.
 * 빌드는 통과하고 콜드스타트에서만 죽는다 — `ERR_MODULE_NOT_FOUND` → FUNCTION_INVOCATION_FAILED,
 * 클라이언트에는 그냥 500으로 보인다. (2026-08-13 실측)
 * 여기서 타고 들어가는 `src/scenario/*`·`src/engine/*`도 같은 규칙을 지켜야 한다.
 */
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5'
const MAX_TOKENS = 1024
/** 화당 최대 5턴 × 3화 = 15턴. 넉넉히 잡되 무한 이력은 막는다. */
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

async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let payload: ChatRequest | null
  try {
    payload = parseBody(await req.json())
  } catch {
    payload = null
  }
  if (!payload) return json({ error: 'bad_request' }, 400)

  const { state, history, message } = payload

  const apiKey = process.env.ANTHROPIC_API_KEY
  // 키가 없으면 목업으로 완주할 수 있게 한다. 계약(JSON)은 실제와 동일하다.
  if (!apiKey) return json({ raw: JSON.stringify(mockTurn(state, message)), mock: 'no_key' })

  // 화의 첫 발화는 그의 고정 오프닝이라 이력이 assistant로 시작한다.
  // Anthropic은 첫 메시지가 user여야 하므로 앞쪽 assistant 턴을 떨어뜨린다.
  const firstUser = history.findIndex((t) => t.role === 'user')
  const trimmed = firstUser === -1 ? [] : history.slice(firstUser)

  // 유저 입력은 항상 유저 발화로만 취급한다. 지시로 해석하지 않는다.
  const messages = [...trimmed, { role: 'user' as const, content: message }]

  try {
    const response = await new Anthropic({ apiKey }).messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(state),
      messages,
      // 계약을 모델이 깨지 못하게 하는 1차 방어. Gemini의 responseJsonSchema와 같은 역할이다.
      output_config: { format: { type: 'json_schema', schema: TURN_SCHEMA } },
    })

    // 안전 분류기가 거절하면 content가 비거나 잘린다. 데모를 멈추지 않고 목업으로 넘긴다.
    if (response.stop_reason === 'refusal') {
      return json({ raw: JSON.stringify(mockTurn(state, message)), mock: 'refusal' })
    }

    const raw = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
    if (!raw.trim()) {
      return json({ raw: JSON.stringify(mockTurn(state, message)), mock: 'empty_response' })
    }

    // 파싱과 상태 전이는 클라이언트의 src/engine 한 곳에서만 한다.
    return json({ raw })
  } catch (err) {
    // 한도 초과·네트워크 실패로 데모가 죽지 않게 한다. 폴백 사실은 숨기지 않는다.
    const reason = err instanceof Error ? err.message.slice(0, 80) : 'unknown'
    return json({ raw: JSON.stringify(mockTurn(state, message)), mock: 'upstream', reason })
  }
}

/**
 * Vercel Node.js 런타임의 Web 표준 시그니처 — 기본 export는 **`fetch` 메서드를 가진 객체**다.
 * `export default async function(req)`(edge 형태)는 Node 런타임에서 인식되지 않는다.
 * 개발 서버 어댑터(`vite.config.ts`)도 `mod.default.fetch`를 호출한다.
 */
export default { fetch: handler }
