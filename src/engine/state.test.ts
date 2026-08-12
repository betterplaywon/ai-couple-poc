import { describe, expect, it } from 'vitest'
import {
  applyDelta,
  applyTurn,
  awkwardness,
  createState,
  nextRun,
  resolveEnding,
  resolveScene,
} from './state'
import type { GameState, SceneNo, TurnResponse } from './types'

function stateAt(patch: Partial<GameState> = {}): GameState {
  return { ...createState(), ...patch }
}

function turn(patch: Partial<TurnResponse> = {}): TurnResponse {
  return {
    dialogue: '...',
    affection_delta: 0,
    emotion: '무표정',
    scene_advance: false,
    ...patch,
  }
}

describe('applyDelta — 클램프 후 누적', () => {
  it('시작값은 30이다', () => {
    expect(createState().affection).toBe(30)
  })

  it('delta 상한 +8을 넘겨도 +8만 오른다', () => {
    expect(applyDelta(stateAt(), 99).affection).toBe(38)
  })

  it('delta 하한 -2를 넘겨도 -2만 내린다', () => {
    expect(applyDelta(stateAt(), -99).affection).toBe(28)
  })

  it('보상 우위 — 한 턴에 얻는 최대치가 잃는 최대치보다 크다', () => {
    const up = applyDelta(stateAt(), 99).affection - 30
    const down = 30 - applyDelta(stateAt(), -99).affection
    expect(up).toBeGreaterThan(down)
  })

  it('호감도는 0 아래로 내려가지 않는다', () => {
    expect(applyDelta(stateAt({ affection: 1 }), -2).affection).toBe(0)
  })

  it('호감도는 100을 넘지 않는다', () => {
    expect(applyDelta(stateAt({ scene: 3, affection: 99 }), 8).affection).toBe(100)
  })

  it('NaN·undefined는 0으로 취급한다', () => {
    expect(applyDelta(stateAt(), NaN).affection).toBe(30)
    expect(applyDelta(stateAt(), undefined as unknown as number).affection).toBe(30)
  })
})

describe('resolveScene — 화 전환 (화당 4턴)', () => {
  it('3턴에서는 신호가 와도 전환하지 않는다', () => {
    expect(resolveScene(stateAt({ turnInScene: 3 }), true)).toBe(false)
  })

  it('4턴 + 신호면 전환한다', () => {
    expect(resolveScene(stateAt({ turnInScene: 4 }), true)).toBe(true)
  })

  it('4턴이어도 신호가 없으면 전환하지 않는다', () => {
    expect(resolveScene(stateAt({ turnInScene: 4 }), false)).toBe(false)
  })

  it('5턴이면 신호 없이도 전환한다', () => {
    expect(resolveScene(stateAt({ turnInScene: 5 }), false)).toBe(true)
  })
})

describe('SCENE_CAP — 화별 천장', () => {
  it('1화는 아무리 잘해도 50을 넘지 않는다', () => {
    let s = stateAt()
    for (let i = 0; i < 10; i += 1) s = applyDelta(s, 8)
    expect(s.affection).toBe(50)
  })

  it('2화 천장(70)은 트루 임계값(75)보다 낮다 — 트루는 3화에서만 열린다', () => {
    let s = stateAt({ scene: 2, affection: 50 })
    for (let i = 0; i < 10; i += 1) s = applyDelta(s, 8)
    expect(s.affection).toBe(70)
    expect(resolveEnding(s)).toBe('normal')
  })

  it('3화에서만 트루에 닿을 수 있다', () => {
    let s = stateAt({ scene: 3, affection: 70 })
    for (let i = 0; i < 3; i += 1) s = applyDelta(s, 8)
    expect(resolveEnding(s)).toBe('true')
  })
})

describe('resolveEnding — 경계값', () => {
  const cases: Array<[number, string]> = [
    [0, 'bad'],
    [40, 'bad'],
    [41, 'normal'],
    [74, 'normal'],
    [75, 'true'],
    [100, 'true'],
  ]
  it.each(cases)('호감도 %i → %s', (affection, expected) => {
    expect(resolveEnding(stateAt({ affection }))).toBe(expected)
  })
})

describe('applyTurn — 진행 판정', () => {
  it('일반 턴은 턴 수만 올린다', () => {
    const next = applyTurn(stateAt(), turn({ affection_delta: 2 }))
    expect(next).toMatchObject({ scene: 1, turnInScene: 1, affection: 32, ending: null })
  })

  it('호감도 0이면 화 무관 즉시 배드로 이탈한다', () => {
    const next = applyTurn(stateAt({ scene: 1, affection: 2 }), turn({ affection_delta: -2 }))
    expect(next).toMatchObject({ affection: 0, ending: 'bad' })
  })

  it('전환 시 다음 화로 넘어가고 턴 수가 0으로 초기화된다', () => {
    const next = applyTurn(stateAt({ turnInScene: 3 }), turn({ scene_advance: true }))
    expect(next).toMatchObject({ scene: 2, turnInScene: 0 })
  })

  it('3화에서 전환 조건을 만족하면 엔딩으로 간다', () => {
    const next = applyTurn(
      stateAt({ scene: 3, turnInScene: 4, affection: 74 }),
      turn({ scene_advance: true }),
    )
    expect(next).toMatchObject({ scene: 3, ending: 'normal' })
  })

  it('3화 마지막 턴의 delta가 엔딩 분기에 반영된다 (74 → +1 → true 아님, normal)', () => {
    const next = applyTurn(
      stateAt({ scene: 3, turnInScene: 4, affection: 74 }),
      turn({ affection_delta: 1, scene_advance: true }),
    )
    expect(next.affection).toBe(75)
    expect(next.ending).toBe('true')
  })

  it('엔딩이 정해진 뒤에는 상태가 움직이지 않는다', () => {
    const ended = stateAt({ ending: 'bad', affection: 10 })
    expect(applyTurn(ended, turn({ affection_delta: 3 }))).toBe(ended)
  })

  it('LLM이 매턴 전환 신호를 줘도 화당 최소 4턴은 보장된다', () => {
    let s = stateAt()
    for (let i = 0; i < 3; i += 1) s = applyTurn(s, turn({ scene_advance: true }))
    expect(s.scene).toBe(1)
    s = applyTurn(s, turn({ scene_advance: true }))
    expect(s.scene).toBe(2)
    expect(s.turnInScene).toBe(0)
  })

  it('전환 신호를 매턴 줘도 최소 12턴은 걸린다 (4×3)', () => {
    let s = stateAt()
    let n = 0
    while (!s.ending && n < 40) { s = applyTurn(s, turn({ scene_advance: true })); n += 1 }
    expect(n).toBe(12)
  })

  it('신호가 한 번도 없어도 3화 × 5턴 = 15턴이면 반드시 끝난다', () => {
    let s = stateAt()
    for (let i = 0; i < 15; i += 1) s = applyTurn(s, turn())
    expect(s.ending).toBe('bad')
  })
})

describe('nextRun — 회귀와 각성', () => {
  it('회차가 오르고 호감도·화·턴이 초기화된다', () => {
    const dead = stateAt({ run: 1, scene: 3, turnInScene: 7, affection: 12, ending: 'bad' })
    expect(nextRun(dead)).toMatchObject({
      run: 2,
      scene: 1,
      turnInScene: 0,
      affection: 30,
      ending: null,
    })
  })

  it('폴백 카운터는 이월된다', () => {
    expect(nextRun(stateAt({ fallbackCount: 3 })).fallbackCount).toBe(3)
  })

  it('서툶 레벨은 회차마다 내려가고 3회차에서 멈춘다', () => {
    expect([1, 2, 3, 4].map(awkwardness)).toEqual([100, 85, 70, 70])
  })
})

describe('scene 타입', () => {
  it('전환을 반복해도 3화를 넘지 않는다', () => {
    let s = stateAt()
    const scenes: SceneNo[] = []
    for (let i = 0; i < 30; i += 1) {
      s = applyTurn(s, turn({ affection_delta: 3, scene_advance: true }))
      scenes.push(s.scene)
    }
    expect(Math.max(...scenes)).toBe(3)
  })
})
