import type { GameState } from './engine/types'

export type ApiTurn = { role: 'user' | 'assistant'; content: string }

export class ChatError extends Error {}

/** api/chat.ts 는 원문만 돌려준다. 파싱과 상태 전이는 src/engine 한 곳에서 한다. */
export async function sendTurn(
  state: GameState,
  history: ApiTurn[],
  message: string,
): Promise<string> {
  let res: Response
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state, history, message }),
    })
  } catch {
    throw new ChatError('연결이 끊겼어요. 잠시 뒤 다시 보내주세요.')
  }

  if (!res.ok) {
    throw new ChatError(
      res.status === 500
        ? '서버 설정이 아직이에요. (ANTHROPIC_API_KEY)'
        : '답장이 오다가 멈췄어요. 다시 보내주세요.',
    )
  }

  const body: unknown = await res.json().catch(() => null)
  const raw = (body as { raw?: unknown } | null)?.raw
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ChatError('답장이 비어 있어요. 다시 보내주세요.')
  }
  return raw
}
