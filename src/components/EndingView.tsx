import { useState } from 'react'
import { ENDINGS, EPILOGUE } from '../scenario/endings'
import { awkwardness } from '../engine/state'
import type { EndingKind, GameState } from '../engine/types'

type Props = {
  kind: EndingKind
  state: GameState
  onRegress: () => void
  onRestart: () => void
}

const LABEL: Record<EndingKind, string> = {
  bad: 'BAD ENDING',
  normal: 'NORMAL ENDING',
  true: 'TRUE ENDING',
}

export function EndingView({ kind, state, onRegress, onRestart }: Props) {
  const [epilogue, setEpilogue] = useState(false)
  const ending = ENDINGS[kind]
  const isTrue = kind === 'true'

  return (
    <div className={`ending ${kind}`}>
      <div className="ending-label">{LABEL[kind]}</div>
      <h1 className="ending-title">{ending.title}</h1>

      <div className="ending-lines">
        {ending.lines.map((line, i) => (
          <p key={i} style={{ animationDelay: `${0.5 + i * 1.1}s` }}>
            {line}
          </p>
        ))}
      </div>

      <p
        className="ending-closing"
        style={{ animationDelay: `${0.5 + ending.lines.length * 1.1}s` }}
      >
        {ending.closing}
      </p>

      {isTrue && epilogue && (
        <div className="epilogue">
          <div className="epilogue-heading">{EPILOGUE.heading}</div>
          {EPILOGUE.lines.map((line, i) => (
            <p key={i} style={{ animationDelay: `${0.3 + i * 1.1}s` }}>
              {line}
            </p>
          ))}
          <p
            className="ending-closing"
            style={{ animationDelay: `${0.3 + EPILOGUE.lines.length * 1.1}s` }}
          >
            {EPILOGUE.closing}
          </p>
        </div>
      )}

      <div className="ending-foot" style={{ animationDelay: `${1 + ending.lines.length * 1.1}s` }}>
        <div className="ending-stats">
          최종 호감도 {state.affection} · {state.run}회차
        </div>

        {isTrue ? (
          epilogue ? (
            <>
              <button onClick={onRestart}>처음부터 다시</button>
              <p className="ending-note">
                연인이 된 다음이 이 프로토타입의 구간 밖이다. 여기까지가 온보딩이었다.
              </p>
            </>
          ) : (
            <>
              <button onClick={() => setEpilogue(true)}>다음 날</button>
              <p className="ending-note">그는 먼저 연락하겠다고 했다.</p>
            </>
          )
        ) : (
          <>
            <button onClick={onRegress}>돌아간다</button>
            <p className="ending-note">
              다음 회차의 그는 {awkwardness(state.run + 1)}%만큼 서툴다.
              <br />
              기억하지는 못한다. 다만 몸이 조금 기억한다.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
