import { describe, expect, it } from 'vitest'
import { FALLBACK_EMOTION, parseTurn } from './parseTurn'

describe('parseTurn — 정상 응답', () => {
  it('순수 JSON을 파싱한다', () => {
    const { turn, ok } = parseTurn(
      '{"dialogue":"...저도요.","affection_delta":-2,"emotion":"서운함","scene_advance":false}',
    )
    expect(ok).toBe(true)
    expect(turn).toEqual({
      dialogue: '...저도요.',
      affection_delta: -2,
      emotion: '서운함',
      scene_advance: false,
    })
  })

  it('코드펜스로 감싸도 파싱한다', () => {
    const { turn, ok } = parseTurn('```json\n{"dialogue":"네","affection_delta":1,"emotion":"기쁨","scene_advance":true}\n```')
    expect(ok).toBe(true)
    expect(turn.scene_advance).toBe(true)
  })

  it('앞뒤에 설명이 붙어도 첫 객체를 뽑아낸다', () => {
    const { turn, ok } = parseTurn('알겠습니다.\n{"dialogue":"그럼요","affection_delta":0,"emotion":"평온"}\n이상입니다.')
    expect(ok).toBe(true)
    expect(turn.dialogue).toBe('그럼요')
  })

  it('대사에 줄바꿈과 따옴표가 섞여도 보존한다', () => {
    const raw = JSON.stringify({
      dialogue: '...저도요.\n\n근데 이런 거 또 물어봐도 되나요\n"버거로운" 건 아닌지',
      affection_delta: 2,
      emotion: '조심스러움',
      scene_advance: false,
    })
    const { turn, ok } = parseTurn(raw)
    expect(ok).toBe(true)
    expect(turn.dialogue).toContain('\n\n')
    expect(turn.dialogue).toContain('"버거로운"')
  })
})

describe('parseTurn — 폴백', () => {
  it('JSON이 아니면 원문을 대사로 쓰고 delta 0으로 폴백한다', () => {
    const { turn, ok } = parseTurn('...말이 안 나오네요')
    expect(ok).toBe(false)
    expect(turn).toEqual({
      dialogue: '...말이 안 나오네요',
      affection_delta: 0,
      emotion: FALLBACK_EMOTION,
      scene_advance: false,
    })
  })

  it('깨진 JSON도 앱을 멈추지 않는다', () => {
    const { ok, turn } = parseTurn('{"dialogue":"네","affection_delta":')
    expect(ok).toBe(false)
    expect(turn.affection_delta).toBe(0)
    expect(turn.scene_advance).toBe(false)
  })

  it('빈 응답도 폴백한다', () => {
    const { ok, turn } = parseTurn('   ')
    expect(ok).toBe(false)
    expect(turn.dialogue).toBe('...')
  })

  it('배열로 감싸도 안쪽 객체를 복구한다 (누락 필드는 안전값)', () => {
    const { turn, ok } = parseTurn('[{"dialogue":"네"}]')
    expect(ok).toBe(true)
    expect(turn).toEqual({
      dialogue: '네',
      affection_delta: 0,
      emotion: FALLBACK_EMOTION,
      scene_advance: false,
    })
  })

  it('dialogue가 없으면 폴백한다', () => {
    expect(parseTurn('{"affection_delta":3,"emotion":"기쁨"}').ok).toBe(false)
  })
})

describe('parseTurn — 필드 타입 방어', () => {
  it('delta가 문자열이면 0으로 본다', () => {
    const { turn, ok } = parseTurn('{"dialogue":"네","affection_delta":"+3","emotion":"기쁨"}')
    expect(ok).toBe(true)
    expect(turn.affection_delta).toBe(0)
  })

  it('scene_advance가 문자열 "true"여도 신호로 인정하지 않는다', () => {
    const { turn } = parseTurn('{"dialogue":"네","affection_delta":0,"scene_advance":"true"}')
    expect(turn.scene_advance).toBe(false)
  })

  it('emotion이 비면 기본 라벨을 채운다', () => {
    const { turn } = parseTurn('{"dialogue":"네","affection_delta":0,"emotion":"  "}')
    expect(turn.emotion).toBe(FALLBACK_EMOTION)
  })

  it('범위를 벗어난 delta는 파싱 단계에서 통과시키고 엔진이 클램프한다', () => {
    const { turn } = parseTurn('{"dialogue":"네","affection_delta":-99,"emotion":"분노"}')
    expect(turn.affection_delta).toBe(-99)
  })
})
