import type { EndingKind, GameState, SceneNo, TurnResponse } from './types'

export const AFFECTION_START = 30
export const AFFECTION_MIN = 0
export const AFFECTION_MAX = 100

/**
 * 보상 우위 — 얻기가 잃기보다 크다. 체류와 상승 체감을 위한 의도된 선택이다.
 * (초기 설계는 -5~+3의 리스크 우위였다. 근거는 docs/03-tradeoffs.md #19)
 */
export const DELTA_MIN = -2
export const DELTA_MAX = 8

/** 화당 4턴, 총 12턴. 짧아야 회귀가 가능하다. */
export const SCENE_MIN_TURNS = 4
export const SCENE_MAX_TURNS = 5
export const LAST_SCENE = 3

export const ENDING_BAD_MAX = 40
export const ENDING_TRUE_MIN = 75

/**
 * 화별 호감도 천장.
 * 이게 없으면 1~2화에서 트루가 확정되고 3화 구조가 판정상 무의미해진다.
 * 2화 상한(70)이 트루 임계값(75)보다 낮은 것이 핵심 — 트루는 3화에서만 열린다.
 */
export const SCENE_CAP: Record<SceneNo, number> = { 1: 50, 2: 70, 3: AFFECTION_MAX }

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

/** LLM이 준 delta는 신뢰하지 않는다. 범위를 클램프하고, 화별 천장까지 눌러서 누적한다. */
export function applyDelta(state: GameState, delta: number): GameState {
  const safe = Number.isFinite(delta) ? Math.round(delta) : 0
  const clamped = clamp(safe, DELTA_MIN, DELTA_MAX)
  return {
    ...state,
    affection: clamp(state.affection + clamped, AFFECTION_MIN, SCENE_CAP[state.scene]),
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
