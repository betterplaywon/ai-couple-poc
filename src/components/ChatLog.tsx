import { useEffect, useRef } from 'react'
import { CHARACTER_NAME } from '../scenario/character'

export type Msg =
  | { kind: 'user'; text: string }
  | { kind: 'him'; text: string; emotion: string }
  | { kind: 'scene'; text: string }

type Props = {
  messages: Msg[]
  pending: boolean
  error: string | null
}

export function ChatLog({ messages, pending, error }: Props) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, pending])

  return (
    <div className="log">
      {messages.map((msg, i) => {
        if (msg.kind === 'scene') {
          return (
            <div className="divider" key={i}>
              <span>{msg.text}</span>
            </div>
          )
        }
        if (msg.kind === 'user') {
          return (
            <div className="bubble me" key={i}>
              {msg.text}
            </div>
          )
        }
        return (
          <div className="him-turn" key={i}>
            <div className="who">{CHARACTER_NAME}</div>
            <div className="bubble him">{msg.text}</div>
          </div>
        )
      })}

      {pending && (
        <div className="him-turn">
          <div className="who">{CHARACTER_NAME}</div>
          <div className="bubble him typing" aria-label="입력 중">
            <i />
            <i />
            <i />
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}
      <div ref={endRef} />
    </div>
  )
}
