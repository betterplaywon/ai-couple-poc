export type SceneNo = 1 | 2 | 3
export type EndingKind = 'bad' | 'normal' | 'true'

/** 관계 상태. 저장하지 않고 React 메모리에만 존재한다. */
export type GameState = {
  /** 시도 횟수. 1부터 시작하고 배드엔딩마다 +1 */
  run: number
  scene: SceneNo
  /** 현재 화에서 끝난 턴 수 */
  turnInScene: number
  affection: number
  /** null이면 진행 중 */
  ending: EndingKind | null
  /** JSON 파싱 실패 누적 — 세션 지표 */
  fallbackCount: number
}

/** LLM이 매 턴 반환하는 구조화 출력 계약 (docs/02-state-engine.md) */
export type TurnResponse = {
  dialogue: string
  /** 제안값. 코드가 클램프한 뒤 누적한다 */
  affection_delta: number
  emotion: string
  /** 제안 신호일 뿐, 화 전환 판정은 코드가 한다 */
  scene_advance: boolean
}
