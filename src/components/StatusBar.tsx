import { AFFECTION_MAX, ENDING_BAD_MAX, ENDING_TRUE_MIN } from '../engine/state'
import type { GameState } from '../engine/types'
import { SCENES } from '../scenario/scenes'

type Props = {
  state: GameState
  emotion: string
  lastDelta: number | null
}

function tone(affection: number): string {
  if (affection <= ENDING_BAD_MAX) return 'cold'
  if (affection >= ENDING_TRUE_MIN) return 'warm'
  return 'mild'
}

export function StatusBar({ state, emotion, lastDelta }: Props) {
  const scene = SCENES[state.scene]
  const pct = (state.affection / AFFECTION_MAX) * 100

  return (
    <header className="status">
      <div className="status-line">
        <span className="scene-no">{state.scene}화</span>
        <span className="scene-title">{scene.title}</span>
        {state.run > 1 && <span className="run-badge">{state.run}번째 시도</span>}
      </div>

      <div className="gauge-row">
        <div className="gauge" role="meter" aria-valuenow={state.affection} aria-valuemin={0} aria-valuemax={100} aria-label="호감도">
          <div className={`gauge-fill ${tone(state.affection)}`} style={{ width: `${pct}%` }} />
          <div className="gauge-mark" style={{ left: `${ENDING_TRUE_MIN}%` }} aria-hidden />
        </div>
        <span className="affection">{state.affection}</span>
        {lastDelta !== null && lastDelta !== 0 && (
          <span className={`delta ${lastDelta > 0 ? 'up' : 'down'}`}>
            {lastDelta > 0 ? `+${lastDelta}` : lastDelta}
          </span>
        )}
      </div>

      <div className="status-sub">
        <span className="headline">{scene.headline}</span>
        {emotion && <span className="emotion">{emotion}</span>}
      </div>
    </header>
  )
}
