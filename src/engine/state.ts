import type { EndingKind, GameState, SceneNo, TurnResponse } from './types'

export const AFFECTION_START = 30
export const AFFECTION_MIN = 0
export const AFFECTION_MAX = 100

/** 비대칭 — 잃기는 여전히 더 쉽다. 상한은 체류·보상 체감을 위해 +4로 올렸다 */
export const DELTA_MIN = -5
export const DELTA_MAX = 4

export const SCENE_MIN_TURNS = 7
export const SCENE_MAX_TURNS = 8
export const LAST_SCENE = 3

export const ENDING_BAD_MAX = 40
export const ENDING_TRUE_MIN = 75

/** 회차별 서툶 레벨(%). 각성은 이 숫자 하나로 표현된다. */
export function awkwardness(run: number): number {
  if (run <= 1) return 100
  if (run === 2) return 85
  return 70
}

export function createState(run = 1): GameState {
  return {
    run,
    scene: 1,
    turnInScene: 0,
    affection: AFFECTION_START,
    ending: null,
    fallbackCount: 0,
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** LLM이 준 delta는 신뢰하지 않는다. 범위를 클램프한 뒤 누적한다. */
export function applyDelta(state: GameState, delta: number): GameState {
  const safe = Number.isFinite(delta) ? Math.round(delta) : 0
  const clamped = clamp(safe, DELTA_MIN, DELTA_MAX)
  return {
    ...state,
    affection: clamp(state.affection + clamped, AFFECTION_MIN, AFFECTION_MAX),
  }
}

/** 화 전환 여부. 턴 수 ≥ 6 AND (LLM 신호 OR 턴 수 ≥ 8) */
export function resolveScene(state: GameState, sceneAdvance: boolean): boolean {
  if (state.turnInScene < SCENE_MIN_TURNS) return false
  return sceneAdvance || state.turnInScene >= SCENE_MAX_TURNS
}

/** 3화 종료 시점의 호감도로 갈린다. */
export function resolveEnding(state: GameState): EndingKind {
  if (state.affection <= ENDING_BAD_MAX) return 'bad'
  if (state.affection >= ENDING_TRUE_MIN) return 'true'
  return 'normal'
}

/**
 * 한 턴을 상태에 반영한다. 화 전환·엔딩 판정의 유일한 출처.
 * 클라이언트와 서버 양쪽에 두지 않는다.
 */
export function applyTurn(state: GameState, turn: TurnResponse): GameState {
  if (state.ending) return state

  const next = applyDelta(state, turn.affection_delta)

  // 즉시 배드 이탈 — 화 무관
  if (next.affection === AFFECTION_MIN) {
    return { ...next, ending: 'bad' }
  }

  const advanced = { ...next, turnInScene: next.turnInScene + 1 }
  if (!resolveScene(advanced, turn.scene_advance)) return advanced

  if (advanced.scene >= LAST_SCENE) {
    return { ...advanced, ending: resolveEnding(advanced) }
  }
  return {
    ...advanced,
    scene: (advanced.scene + 1) as SceneNo,
    turnInScene: 0,
  }
}

/** 배드엔딩 → 1화 회귀. 회차와 폴백 카운터만 이월된다. */
export function nextRun(state: GameState): GameState {
  return { ...createState(state.run + 1), fallbackCount: state.fallbackCount }
}
