import type { TurnResponse } from './types'

export const FALLBACK_EMOTION = '알 수 없음'

export type ParseResult = {
  turn: TurnResponse
  /** false면 폴백 — 세션 지표로 집계한다 */
  ok: boolean
}

/** ```json ... ``` 같은 코드펜스를 벗기고, 본문에서 첫 JSON 객체를 뽑는다. */
function extractJson(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : raw).trim()
  if (body.startsWith('{') && body.endsWith('}')) return body

  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  return body.slice(start, end + 1)
}

function fallback(raw: string): ParseResult {
  const dialogue = raw.trim()
  return {
    turn: {
      dialogue: dialogue || '...',
      affection_delta: 0,
      emotion: FALLBACK_EMOTION,
      scene_advance: false,
    },
    ok: false,
  }
}

/**
 * LLM 응답은 항상 깨질 수 있다고 가정한다.
 * 파싱 실패 시 delta 0 / scene_advance false로 폴백하고 대사만 표시한 뒤 계속 진행한다.
 */
export function parseTurn(raw: string): ParseResult {
  const json = extractJson(raw)
  if (json === null) return fallback(raw)

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return fallback(raw)
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return fallback(raw)
  }

  const obj = parsed as Record<string, unknown>
  const dialogue = typeof obj.dialogue === 'string' ? obj.dialogue.trim() : ''
  if (!dialogue) return fallback(raw)

  const delta = obj.affection_delta
  const emotion = obj.emotion

  return {
    turn: {
      dialogue,
      affection_delta: typeof delta === 'number' && Number.isFinite(delta) ? delta : 0,
      emotion: typeof emotion === 'string' && emotion.trim() ? emotion.trim() : FALLBACK_EMOTION,
      scene_advance: obj.scene_advance === true,
    },
    ok: true,
  }
}
