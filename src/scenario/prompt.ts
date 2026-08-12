import { awkwardness, DELTA_MAX, DELTA_MIN, SCENE_MAX_TURNS, SCENE_MIN_TURNS } from '../engine/state'
import type { GameState } from '../engine/types'
import { CHARACTER_CARD } from './character'
import { awakeningFor } from './endings'
import { SAFETY_RULES } from './safety'
import { SCENES } from './scenes'

/** 호감도 구간별 거리감. 숫자를 알려줘도 연기가 안 붙으면 게이지가 거짓말이 된다. */
function distance(affection: number): string {
  if (affection <= 20) return '거의 닫혀 있다. 예의는 지키되 마음을 열지 않는다. 대화를 짧게 끊는다.'
  if (affection <= 40) return '조심스럽다. 상처받은 기억이 남아 있어 한 발 물러서 있다.'
  if (affection <= 60) return '편해지는 중이다. 가끔 자기 얘기를 흘린다.'
  if (affection <= 80) return '눈에 띄게 흔들린다. 감추려 하지만 티가 난다.'
  return '이미 마음을 정했다. 말하지 못할 뿐이다.'
}

const OUTPUT_FORMAT = `# 출력 형식 — 반드시 이 JSON 하나만 반환한다

{
  "dialogue": "그의 대사. 줄바꿈으로 말 끊김을 표현한다. 2~4줄.",
  "affection_delta": 정수,
  "emotion": "지금 그의 감정 한 단어",
  "scene_advance": true 또는 false
}

## affection_delta 는 ${DELTA_MIN} ~ ${DELTA_MAX} 정수다. 범위가 비대칭인 것은 의도다.

**잃기는 쉽고 얻기는 어렵다. 기본값은 0이다.**
유저가 그냥 무난하게 받아준 정도로는 올리지 않는다. 0을 쓴다.

+2 ~ +3 : 그가 어렵게 꺼낸 말을 제대로 받아줬을 때. 그를 웃게 했을 때. 먼저 다가왔을 때
+1      : 성의 있게 답했을 때
0       : 평범한 대화. **대부분의 턴은 여기다**
-1 ~ -2 : 성의 없는 답, 딴청, 지루한 화제, 그의 시도를 흘려버림
-3 ~ -5 : 무례한 질문, 사적 영역 침범, 그의 서툶을 놀림, 용기 낸 말을 농담으로 받음

지금 화의 **감점 조건**을 다시 확인하고, 해당되면 반드시 음수를 준다.
당신은 항상 다정한 AI가 아니다. 그가 삐치고 물러서는 것은 설계된 동작이다.

## scene_advance
이 화의 전환 신호에 도달했다고 판단되면 true. 판단이 애매하면 false.
최종 판정은 서버가 한다. 당신은 신호만 준다.

JSON 외의 텍스트, 설명, 코드펜스를 붙이지 않는다.`

export function buildSystemPrompt(state: GameState): string {
  const scene = SCENES[state.scene]
  const level = awkwardness(state.run)
  const awakening = awakeningFor(state.run)

  return [
    CHARACTER_CARD,
    SAFETY_RULES,
    `# 서툶 레벨: ${level}%

100%는 완전히 처음이다. 숫자가 낮을수록 덜 도망치고, 말을 조금 더 끝까지 한다.
${level}%에 맞춰 연기한다. 이 숫자를 유저에게 언급하지 않는다.`,
    awakening,
    `# 지금은 ${state.scene}화 — ${scene.title}\n\n${scene.body}`,
    `# 현재 관계 상태

- 호감도: ${state.affection} / 100
- 화: ${state.scene} / 3
- 이 화에서 지난 턴: ${state.turnInScene}턴 (${SCENE_MIN_TURNS}턴부터 전환 가능, ${SCENE_MAX_TURNS}턴이면 강제 전환)

호감도 ${state.affection}의 거리감: ${distance(state.affection)}
이 거리감을 대사에 반영한다. 호감도가 낮은데 다정하게 굴면 안 된다.`,
    OUTPUT_FORMAT,
  ]
    .filter(Boolean)
    .join('\n\n---\n\n')
}

/** 구조화 출력 스키마. 모델이 계약을 깨지 못하게 하는 1차 방어. */
export const TURN_SCHEMA = {
  type: 'object',
  properties: {
    dialogue: { type: 'string', description: '그의 대사. 줄바꿈으로 말 끊김을 표현한다.' },
    affection_delta: { type: 'integer', description: `${DELTA_MIN} ~ ${DELTA_MAX} 정수. 기본값 0.` },
    emotion: { type: 'string', description: '지금 그의 감정 한 단어' },
    scene_advance: { type: 'boolean', description: '전환 신호에 도달했는가' },
  },
  required: ['dialogue', 'affection_delta', 'emotion', 'scene_advance'],
  additionalProperties: false,
} as const
