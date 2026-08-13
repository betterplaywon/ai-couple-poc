import type { EndingKind, GameState, SceneNo, TurnResponse } from './types.js'

export const AFFECTION_START = 30
export const AFFECTION_MIN = 0
export const AFFECTION_MAX = 100

/**
 * 보상 우위 — 얻기가 잃기보다 크다. 체류와 상승 체감을 위한 의도된 선택이다.
 * (초기 설계는 -5~+3의 리스크 우위였다. 근거는 docs/03-tradeoffs.md #19)
 */
export const DELTA_MIN = -2
export const DELTA_MAX = 8

/** 화당 4턴, 총 12턴. 짧아야 재도전이 가능하다. */
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

/**
 * 유저 발화의 성의 등급.
 *
 * LLM은 순응적으로 훈련돼 있어 "ㅇㅇ", "그래서요?"에도 +8을 준다(실측).
 * 배점 자체는 보상 우위가 맞지만, **무엇이 보상받을 자격이 있는지는 코드가 정한다.**
 * 프롬프트 지시만으로는 지켜지지 않는다 — 이건 기대이지 보장이 아니다.
 */
export type Effort = 'none' | 'plain' | 'engaged'

/**
 * 내용이 없는 반응 토큰. 여러 개가 이어 붙은 형태("아 네 그렇군요")도 잡아야 하므로
 * 토큰 알터네이션을 만들어 조합 가능하게 쓴다. 긴 토큰을 앞에 둬야 짧은 것이 먼저 먹지 않는다.
 */
const FILLER = [
  '그럴 수도 있겠네요?', '모르겠어요?', '상관없어요?', '그렇겠네요?', '그런가요?',
  '괜찮았어요?', '재밌었어요?', '신기하다', '그렇구나', '그렇군요?', '그래서요?',
  '별로요?', '몰라요?', '글쎄요?', '좋네요?', '진짜요?', '맞아요', '그냥요?',
  '아하', '그쵸', '넵', 'ㅇㅋ', '그래서', '뭐',
  'ㅇ+', 'ㅋ+', 'ㅎ+', 'ㄴ+', '네+', '응+', '어+', '음+', '아+', '오+',
].join('|')
const SEP = '[\\s.,!?…~]+'
const NO_EFFORT = new RegExp(`^(?:${FILLER})(?:${SEP}(?:${FILLER}))*[\\s.,!?…~ㅋㅎ]*$`)

/** 유저가 먼저 다가온 신호 — 이게 있으면 길이와 무관하게 최고점 자격이 있다. */
const REACHING_OUT =
  /좋아|보고 ?싶|설레|두근|함께|옆에 있|계속 보|다음에 또|또 만나|기다릴|사랑|마음에 들|있고 ?싶|고백|만나요|만날래|커피|밥 (먹|한)|약속|연락|같이 (갈|가요|해요|볼)/

export function classifyEffort(text: string): Effort {
  const t = text.trim()
  if (REACHING_OUT.test(t)) return 'engaged'
  if (NO_EFFORT.test(t) || t.length <= 4) return 'none'
  // 그에게 되묻거나, 길게 자기 얘기를 주는 것까지가 "다가옴"이다.
  // 문장을 갖췄다는 이유만으로 최고점을 주면 무난형과 성실형이 갈라지지 않는다(실측).
  if ((t.includes('?') && t.length > 8) || t.length > 40) return 'engaged'
  return 'plain'
}

/**
 * 이 발화가 받을 수 있는 delta 상한.
 * 감점은 막지 않는다 — LLM이 무례로 판단해 음수를 주는 것은 그대로 통과시킨다.
 *
 * plain 상한 2의 근거: 최장 경로(강제 전환 5턴 × 3화 = 15턴)를 성의만으로 채워도
 * 30 + 30 = 60 — 트루 임계값 75에 닿지 않는다. 3을 주면 정확히 75가 되어
 * 먼저 다가온 적 없는 유저가 트루를 받고, 그 순간 성실형과 무난형이 갈라지지 않는다.
 */
export function effortCeiling(text: string): number {
  switch (classifyEffort(text)) {
    case 'none':
      return 0
    case 'plain':
      return 2
    default:
      return DELTA_MAX
  }
}

/** 시도별 서툶 레벨(%). 시도를 건너 누적되는 유일한 값이다. */
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
 *
 * `userText`를 주면 발화 성의에 따른 delta 상한이 적용된다.
 * LLM은 "ㅇㅇ"에도 +8을 주므로(실측) 이 방어가 없으면 게이지가 무의미해진다.
 */
export function applyTurn(state: GameState, turn: TurnResponse, userText?: string): GameState {
  if (state.ending) return state

  const proposed = turn.affection_delta
  const capped =
    userText === undefined ? proposed : Math.min(proposed, effortCeiling(userText))
  const next = applyDelta(state, capped)

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

/** 배드엔딩 → 1화부터 재도전. 시도 횟수와 폴백 카운터만 이월된다. */
export function nextRun(state: GameState): GameState {
  return { ...createState(state.run + 1), fallbackCount: state.fallbackCount }
}
