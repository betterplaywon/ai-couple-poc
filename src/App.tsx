import { useState } from 'react'
import { ChatLog, type Msg } from './components/ChatLog'
import { Composer } from './components/Composer'
import { EndingView } from './components/EndingView'
import { StatusBar } from './components/StatusBar'
import { applyTurn, createState, nextRun } from './engine/state'
import { parseTurn } from './engine/parseTurn'
import type { GameState } from './engine/types'
import { SCENES } from './scenario/scenes'
import { CRISIS_REPLY, looksLikeCrisis } from './scenario/safety'
import { ChatError, sendTurn, type ApiTurn } from './api'

/** 화가 열릴 때 구분선과 그의 고정 오프닝을 함께 넣는다. */
function openScene(state: GameState): Msg[] {
  const scene = SCENES[state.scene]
  return [
    { kind: 'scene', text: `${state.scene}화 — ${scene.title}` },
    { kind: 'him', text: scene.opening, emotion: '' },
  ]
}

function toHistory(messages: Msg[]): ApiTurn[] {
  return messages.flatMap((m) =>
    m.kind === 'scene' ? [] : [{ role: m.kind === 'user' ? 'user' : 'assistant', content: m.text } as ApiTurn],
  )
}

export default function App() {
  const [state, setState] = useState<GameState>(() => createState())
  const [messages, setMessages] = useState<Msg[]>(() => openScene(createState()))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emotion, setEmotion] = useState(() => SCENES[1].openingEmotion)
  const [lastDelta, setLastDelta] = useState<number | null>(null)
  const [mock, setMock] = useState<string | null>(null)

  function reset(next: GameState) {
    setState(next)
    setMessages(openScene(next))
    setEmotion(SCENES[next.scene].openingEmotion)
    setLastDelta(null)
    setError(null)
  }

  async function send(text: string) {
    const history = toHistory(messages)
    setMessages((prev) => [...prev, { kind: 'user', text }])
    setPending(true)
    setError(null)

    // 위기 신호는 모델을 거치지 않는다. 사전에 작성한 문구로 답하고 상태를 움직이지 않는다.
    if (looksLikeCrisis(text)) {
      setMessages((prev) => [...prev, { kind: 'him', text: CRISIS_REPLY, emotion: '걱정' }])
      setEmotion('걱정')
      setLastDelta(null)
      setPending(false)
      return
    }

    try {
      const reply = await sendTurn(state, history, text)
      setMock(reply.mock)
      const { turn, ok } = parseTurn(reply.raw)

      // 폴백은 세션 지표다. 상태 전이 자체는 폴백값(delta 0)으로 그대로 진행한다.
      const base = ok ? state : { ...state, fallbackCount: state.fallbackCount + 1 }
      const next = applyTurn(base, turn, text)

      const sceneChanged = next.scene !== state.scene && !next.ending
      setMessages((prev) => {
        const appended: Msg[] = [...prev, { kind: 'him', text: turn.dialogue, emotion: turn.emotion }]
        return sceneChanged ? [...appended, ...openScene(next)] : appended
      })
      setState(next)
      setEmotion(sceneChanged ? SCENES[next.scene].openingEmotion : turn.emotion)
      setLastDelta(next.affection - state.affection)
    } catch (err) {
      // 실패한 턴은 상태를 움직이지 않는다. 유저 발화만 남기고 다시 보내게 한다.
      setError(err instanceof ChatError ? err.message : '알 수 없는 문제가 생겼어요.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="app">
      {state.ending ? (
        <EndingView
          kind={state.ending}
          state={state}
          onRetry={() => reset(nextRun(state))}
          onRestart={() => reset(createState())}
        />
      ) : (
        <>
          <StatusBar state={state} emotion={emotion} lastDelta={lastDelta} />
          <ChatLog messages={messages} pending={pending} error={error} />
          <Composer disabled={pending} onSend={(t) => void send(t)} />
        </>
      )}
      <footer className="notice">
        {mock
          ? '데모 모드 — 응답이 스크립트로 생성되고 있습니다 (Claude API 미연결). 실존 인물이 아닙니다.'
          : '이 대화 상대는 AI입니다. 실존 인물이 아닙니다.'}
      </footer>
    </div>
  )
}
