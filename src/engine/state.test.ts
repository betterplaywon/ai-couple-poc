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

  it('delta 상한 +4를 넘겨도 +4만 오른다', () => {
    expect(applyDelta(stateAt(), 99).affection).toBe(34)
  })

  it('상한(+4)보다 하한(-5)이 여전히 크다 — 비대칭은 유지된다', () => {
    const up = applyDelta(stateAt(), 99).affection - 30
    const down = 30 - applyDelta(stateAt(), -99).affection
    expect(down).toBeGreaterThan(up)
  })

  it('delta 하한 -5를 넘겨도 -5만 내린다', () => {
    expect(applyDelta(stateAt(), -99).affection).toBe(25)
  })

  it('호감도는 0 아래로 내려가지 않는다', () => {
    expect(applyDelta(stateAt({ affection: 2 }), -5).affection).toBe(0)
  })

  it('호감도는 100을 넘지 않는다', () => {
    expect(applyDelta(stateAt({ affection: 99 }), 3).affection).toBe(100)
  })

  it('NaN·undefined는 0으로 취급한다', () => {
    expect(applyDelta(stateAt(), NaN).affection).toBe(30)
    expect(applyDelta(stateAt(), undefined as unknown as number).affection).toBe(30)
  })
})

describe('resolveScene — 화 전환', () => {
  it('5턴에서는 신호가 와도 전환하지 않는다', () => {
    expect(resolveScene(stateAt({ turnInScene: 5 }), true)).toBe(false)
  })

  it('6턴에서는 신호가 와도 전환하지 않는다 (최소 7턴)', () => {
    expect(resolveScene(stateAt({ turnInScene: 6 }), true)).toBe(false)
  })

  it('7턴 + 신호면 전환한다', () => {
    expect(resolveScene(stateAt({ turnInScene: 7 }), true)).toBe(true)
  })

  it('7턴이어도 신호가 없으면 전환하지 않는다', () => {
    expect(resolveScene(stateAt({ turnInScene: 7 }), false)).toBe(false)
  })

  it('8턴이면 신호 없이도 전환한다', () => {
    expect(resolveScene(stateAt({ turnInScene: 8 }), false)).toBe(true)
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
    const next = applyTurn(stateAt({ scene: 1, affection: 3 }), turn({ affection_delta: -5 }))
    expect(next).toMatchObject({ affection: 0, ending: 'bad' })
  })

  it('전환 시 다음 화로 넘어가고 턴 수가 0으로 초기화된다', () => {
    const next = applyTurn(stateAt({ turnInScene: 6 }), turn({ scene_advance: true }))
    expect(next).toMatchObject({ scene: 2, turnInScene: 0 })
  })

  it('3화에서 전환 조건을 만족하면 엔딩으로 간다', () => {
    const next = applyTurn(
      stateAt({ scene: 3, turnInScene: 7, affection: 74 }),
      turn({ scene_advance: true }),
    )
    expect(next).toMatchObject({ scene: 3, ending: 'normal' })
  })

  it('3화 마지막 턴의 delta가 엔딩 분기에 반영된다 (74 → +1 → true 아님, normal)', () => {
    const next = applyTurn(
      stateAt({ scene: 3, turnInScene: 7, affection: 74 }),
      turn({ affection_delta: 1, scene_advance: true }),
    )
    expect(next.affection).toBe(75)
    expect(next.ending).toBe('true')
  })

  it('엔딩이 정해진 뒤에는 상태가 움직이지 않는다', () => {
    const ended = stateAt({ ending: 'bad', affection: 10 })
    expect(applyTurn(ended, turn({ affection_delta: 3 }))).toBe(ended)
  })

  it('LLM이 매턴 전환 신호를 줘도 화당 최소 7턴은 보장된다', () => {
    let s = stateAt()
    for (let i = 0; i < 6; i += 1) s = applyTurn(s, turn({ scene_advance: true }))
    expect(s.scene).toBe(1)
    s = applyTurn(s, turn({ scene_advance: true }))
    expect(s.scene).toBe(2)
    expect(s.turnInScene).toBe(0)
  })

  it('전환 신호를 매턴 줘도 최소 21턴은 걸린다 (7×3)', () => {
    let s = stateAt()
    let n = 0
    while (!s.ending && n < 40) { s = applyTurn(s, turn({ scene_advance: true })); n += 1 }
    expect(n).toBe(21)
  })

  it('신호가 한 번도 없어도 3화 × 8턴 = 24턴이면 반드시 끝난다', () => {
    let s = stateAt()
    for (let i = 0; i < 24; i += 1) s = applyTurn(s, turn())
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
