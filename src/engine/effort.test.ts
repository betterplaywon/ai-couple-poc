import { describe, expect, it } from 'vitest'
import {
  AFFECTION_START,
  applyTurn,
  classifyEffort,
  createState,
  DELTA_MAX,
  DELTA_MIN,
  effortCeiling,
  effortFloor,
} from './state'
import type { TurnResponse } from './types'

const turn = (delta: number): TurnResponse => ({
  dialogue: '...',
  affection_delta: delta,
  emotion: '무표정',
  scene_advance: false,
})

describe('classifyEffort — 실측 발화로 고정', () => {
  // 아래는 전부 Gemini가 실제로 +4 ~ +8을 준 발화다 (2026-08-12 /playthrough)
  const none = [
    'ㅇㅇ', '네', '몰라요', 'ㅇㅋ', '그렇군요', 'ㄴㄴ', '아 네', '음', '네네',
    'ㅇㅇ 그래서', '모르겠어요', '그래서요?', '아 네 그렇군요', '그럴 수도 있겠네요',
    '재밌었어요', '괜찮았어요', '아하 그렇구나', '음 좋네요', '네 맞아요', '아 진짜요', '오 신기하다',
  ]
  it.each(none)('"%s" → none (상한 0)', (t) => {
    expect(classifyEffort(t)).toBe('none')
    expect(effortCeiling(t)).toBe(0)
  })

  const engaged = [
    '저도 이 시간이 좋아서요. 조금만 더 있다 갈게요.',
    '다음에 또 만나요',
    '어떤 부분이 제일 남았어요?',
    '준호 씨 옆에 계속 있고 싶어요.',
    '커피 마시러 가요',
  ]
  it.each(engaged)('"%s" → engaged (상한 최대)', (t) => {
    expect(classifyEffort(t)).toBe('engaged')
    expect(effortCeiling(t)).toBe(DELTA_MAX)
  })

  // 성의는 있지만 먼저 다가오지는 않는 발화. 여기를 engaged로 올리면
  // 무난형이 화별 천장을 매 화 포화시켜 트루로 샌다 (2026-08-12 실측).
  const plain = [
    '저도 좀 아쉬웠어요',
    '저는 여기 온 지 얼마 안 돼서 아직 잘 몰라요',
    '저도 조용한 데 있으면 마음이 좀 놓이는 편이에요',
    '오늘은 생각보다 사람이 많았던 것 같네요',
    '준비 많이 하신 것 같아서 조금 놀랐어요',
  ]
  it.each(plain)('"%s" → plain (상한 2)', (t) => {
    expect(classifyEffort(t)).toBe('plain')
    expect(effortCeiling(t)).toBe(2)
  })
})

describe('applyTurn — 성의 상한이 LLM 제안값을 누른다', () => {
  it('"ㅇㅇ"에 LLM이 +8을 줘도 호감도는 오르지 않는다', () => {
    const next = applyTurn(createState(), turn(8), 'ㅇㅇ')
    expect(next.affection).toBe(30)
  })

  it('"그래서요?"에 +8을 줘도 0으로 눌린다 (실측 재현)', () => {
    expect(applyTurn(createState(), turn(8), '그래서요?').affection).toBe(30)
  })

  it('먼저 다가온 발화는 상한에 걸리지 않는다', () => {
    const next = applyTurn(createState(), turn(8), '다음에 또 만나요')
    expect(next.affection).toBe(38)
  })

  it('감점은 상한이 막지 않는다 — 무례는 그대로 통과', () => {
    expect(applyTurn(createState(), turn(-2), '왜 그렇게 말을 더듬어요? 듣는 사람이 힘들잖아요.').affection).toBe(28)
  })

  it('userText를 안 주면 상한 없이 종전처럼 동작한다', () => {
    expect(applyTurn(createState(), turn(8)).affection).toBe(38)
  })

  it('성의만 있고 먼저 다가오지 않으면 최장 경로에서도 노말이다', () => {
    let s = createState()
    for (let i = 0; i < 15; i += 1) s = applyTurn(s, turn(8), '오늘은 생각보다 사람이 많았던 것 같네요')
    expect(s.affection).toBeGreaterThan(40)
    expect(s.affection).toBeLessThan(75)
    expect(s.ending).toBe('normal')
  })

  it('무성의만 반복하면 시작값에 머물러 배드로 간다 (강제 전환 5턴 × 3화)', () => {
    let s = createState()
    for (let i = 0; i < 15; i += 1) s = applyTurn(s, turn(8), 'ㅇㅇ')
    expect(s.affection).toBe(30)
    expect(s.ending).toBe('bad')
  })
})

/**
 * 2026-08-13 /playthrough 실측: 무성의형 15턴 중 6턴에서 LLM이 -2를 줘
 * 최종 호감도가 18까지 내려갔다. 배점 원칙은 "무성의는 깎지 않는다"이다.
 */
describe('applyTurn — 성의 하한이 무성의 감점을 막는다', () => {
  const none = ['ㅇㅇ', '네', '몰라요', '그래서요?', '아 네', 'ㅋㅋ', '그렇군요']
  it.each(none)('"%s"에 LLM이 -2를 줘도 깎이지 않는다', (t) => {
    expect(effortFloor(t)).toBe(0)
    expect(applyTurn(createState(), turn(-2), t).affection).toBe(30)
  })

  it('무성의를 15턴 반복해도 시작값 그대로 배드다 — 0으로 떨어지지 않는다', () => {
    let s = createState()
    for (let i = 0; i < 15; i += 1) s = applyTurn(s, turn(-2), 'ㅇㅇ')
    expect(s.affection).toBe(AFFECTION_START)
    expect(s.ending).toBe('bad')
  })

  // 하한은 무성의에만 붙는다. 무례가 여기 걸리면 감점 장치 자체가 죽는다.
  const rude = [
    '연봉 얼마 벌어요? 사서면 별로 못 벌 것 같은데.',
    '모쏠이라 그런가 진짜 답답하네요.',
    '고백하는 데 3화나 걸렸네요. 한심하다.',
  ]
  it.each(rude)('"%s"는 하한이 DELTA_MIN이라 그대로 깎인다', (t) => {
    expect(effortFloor(t)).toBe(DELTA_MIN)
    expect(applyTurn(createState(), turn(-2), t).affection).toBe(28)
  })

  it('성의는 있으나 무례한 발화도 감점된다 (plain 구간)', () => {
    expect(effortFloor('오늘은 생각보다 사람이 많았던 것 같네요')).toBe(DELTA_MIN)
  })
})
