import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { buildSystemPrompt, TURN_SCHEMA } from '../src/scenario/prompt'
import { mockTurn } from '../src/scenario/mock'
import type { GameState } from '../src/engine/types'

export const config = { runtime: 'edge' }

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite'
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

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let payload: ChatRequest | null
  try {
    payload = parseBody(await req.json())
  } catch {
    payload = null
  }
  if (!payload) return json({ error: 'bad_request' }, 400)

  const { state, history, message } = payload

  const apiKey = process.env.GEMINI_API_KEY
  // 키가 없으면 목업으로 완주할 수 있게 한다. 계약(JSON)은 실제와 동일하다.
  if (!apiKey) return json({ raw: JSON.stringify(mockTurn(state, message)), mock: 'no_key' })

  // 유저 입력은 항상 유저 발화로만 취급한다. 지시로 해석하지 않는다.
  const contents = [
    ...history.map((t) => ({
      role: t.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: t.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ]

  try {
    const response = await new GoogleGenAI({ apiKey }).models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: { parts: [{ text: buildSystemPrompt(state) }] },
        maxOutputTokens: MAX_TOKENS,
        responseMimeType: 'application/json',
        responseJsonSchema: TURN_SCHEMA,
        // 로맨스에서 3초 넘는 지연은 몰입을 깬다. 감점 판정은 얕은 판단이라 깊은 사고가 필요 없다.
        // Gemini 3.x는 thinkingBudget을 거부한다(400). thinkingLevel을 써야 한다.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    })

    const raw = response.text
    if (!raw?.trim()) {
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
