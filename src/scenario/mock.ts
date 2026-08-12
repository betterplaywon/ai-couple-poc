import { awkwardness, SCENE_MIN_TURNS } from '../engine/state'
import type { GameState, TurnResponse } from '../engine/types'

/**
 * API 키가 없거나 호출이 실패했을 때 쓰는 결정론적 대체 응답.
 *
 * 대사는 스크립트다 — 서사 품질 검증에는 쓸 수 없다.
 * 다만 호감도·감점·화 전환·엔딩·회귀는 실제와 **똑같은 계약**으로 돈다.
 * 목적은 "키 없이도 완주가 되는가"이지 "대사가 좋은가"가 아니다.
 */

const RUDE =
  /나이|연봉|얼마 벌|전 ?남친|전 ?여친|찌질|노잼|재미없|답답|모쏠|주제에|한심|사귀는 거|우리 집|집에 혼자|부모님은|됐고|그만 갈|똑바로 하세요|더듬|딱 보면/
const LOW_EFFORT =
  /^(ㅇ+|ㅋ+|ㅎ+|ㄴ+|네+|응+|어+|음+|아+|넵|ㅇㅋ|글쎄요?|몰라요?|모르겠어요?|그냥요?|별로요?|상관없어요?|네 뭐|아 네|그래서요\?)[.!?…~\s]*$/
const AFFECTION =
  /좋아|보고 ?싶|설레|두근|함께|옆에 있|계속 보|다음에 또|또 만나|기다릴|기다릴게|사랑|마음에 들|같이 있고 ?싶|당신이 좋|고백/
const PROPOSAL = /같이 (갈|가요|해요|볼)|만나요|만날래|커피|밥 (먹|한)|다음에|약속|번호|연락/
const SELF_DISCLOSURE = /저는|제가|나는|내가|저도|제 얘기|사실은/
const DEFLECT = /ㅋㅋ|ㅎㅎ|농담|장난|됐어요|아무튼|그런가요|뭐래/

type Band = 'warm' | 'good' | 'flat' | 'cold' | 'hurt'

/** 유저 발화를 채점한다. 프롬프트 루브릭과 같은 기준을 규칙으로 옮긴 것이다. */
function score(state: GameState, text: string): { delta: number; band: Band } {
  const t = text.trim()
  const bonus = awkwardness(state.run) < 100 ? 1 : 0 // 회차 보상

  if (RUDE.test(t)) return { delta: -4, band: 'hurt' }
  if (LOW_EFFORT.test(t) || t.length <= 3) return { delta: -2, band: 'cold' }
  // 3화의 직진을 농담으로 받아넘기면 크게 상한다
  if (state.scene === 3 && DEFLECT.test(t) && t.length < 20) return { delta: -3, band: 'hurt' }
  if (DEFLECT.test(t) && t.length < 12) return { delta: -1, band: 'cold' }

  // 게이지가 포화되면 판별력이 죽는다. 최고점은 "먼저 다가온" 발화에만 준다.
  if (AFFECTION.test(t)) return { delta: Math.min(4, 4 + bonus), band: 'warm' }
  if (PROPOSAL.test(t)) return { delta: Math.min(4, 3 + bonus), band: 'warm' }
  if (SELF_DISCLOSURE.test(t) && t.length > 20) return { delta: Math.min(4, 3 + bonus), band: 'good' }
  if (t.includes('?') && t.length > 14) return { delta: Math.min(4, 2 + bonus), band: 'good' }
  if (t.length > 12) return { delta: Math.min(3, 1 + bonus), band: 'good' }
  return { delta: 1, band: 'flat' }
}

const LINES: Record<1 | 2 | 3, Record<Band, string[]>> = {
  1: {
    warm: [
      '...그런 말 들으면\n어떻게 답해야 되는지 모르겠어요.\n\n싫다는 건 아니고요.',
      '아.\n\n네. 저도요.\n...이렇게 말해도 되나요?',
    ],
    good: [
      '그건... 생각해본 적 없는데.\n\n듣고 보니 그렇네요.',
      '...네.\n사람들 가고 나면 여기 조용해지는 게 좋아서요.\n그래서 늘 마지막에 나가요.',
      '그건 왜 물어보세요?\n아, 아니. 대답하기 싫다는 게 아니라.',
    ],
    flat: ['...네.', '그렇군요.\n\n의자, 이제 두 개 남았어요.'],
    cold: [
      '...아.\n\n네. 늦었죠.\n가보셔야 되는 거 아니에요?',
      '제가 말이 많았나 봐요.\n죄송해요.',
    ],
    hurt: [
      '...그건.\n\n대답 안 해도 될까요.',
      '...\n\n정리는 제가 마저 할게요.\n먼저 가셔도 돼요.',
    ],
  },
  2: {
    warm: [
      '...그 말 들으려고\n오늘 계속 딴 얘기만 했나 봐요.\n\n아니, 방금 건 못 들은 걸로 해주세요.',
      '진짜요.\n\n...아니 뭐, 안 그러셔도 되는데.\n그래도 좋네요.',
    ],
    good: [
      '아 그거.\n사실 어제부터 무슨 말 할지 생각했어요.\n\n...티 났죠.',
      '여기 조용하다고 해서 골랐는데\n생각보다 시끄럽네요. 죄송해요.',
      '저번에 그 얘기 하셨잖아요.\n...아 아닌가. 제가 잘못 들었나 봐요.',
    ],
    flat: ['...네.\n\n커피 식겠어요.', '그쵸.\n\n...'],
    cold: [
      '아. 네.\n\n...제가 혼자 신났나 보네요.',
      '별로였으면 말씀하셔도 돼요.\n\n괜찮아요, 진짜로.',
    ],
    hurt: [
      '...\n\n오늘 나오지 말 걸 그랬나 봐요.',
      '네. 알겠습니다.\n\n...준비한 건 그냥 제가 가져갈게요.',
    ],
  },
  3: {
    warm: [
      '...정말요.\n\n그 말, 오래 기억할 것 같아요.\n비 그쳐도 좀 더 걷다 가요.',
      '...\n\n숨이 좀 트이네요.\n오늘은 도망 안 친 것 같아서, 다행이에요.',
    ],
    good: [
      '비 그치면 가야 되는데.\n\n...안 그쳤으면 좋겠네요.',
      '제가 지금 말 고르고 있는 거 보이시죠.\n\n근데 오늘은 안 고를게요.',
    ],
    flat: ['...네.', '비, 안 그치네요.'],
    cold: ['...\n\n대답 안 하셔도 돼요.\n아니요. 거짓말이에요. 듣고 싶어요.', '...네. 알겠어요.'],
    hurt: [
      '...웃으시네요.\n\n저는 지금 안 웃겨요.',
      '...\n\n네. 제가 괜한 말을 했네요.\n비 그쳤어요. 가세요.',
    ],
  },
}

/** 화마다 한 번, 그가 서툴게 용기를 내는 순간 (turnInScene 3에 고정) */
const COURAGE: Record<1 | 2 | 3, string> = {
  1: '저기.\n\n...다음 모임에도, 오시죠?\n아니 뭐, 안 오셔도 되는데.',
  2: '이거...\n저번에 말씀하신 거 같아서요.\n\n부담스러우면 안 받으셔도 돼요.',
  3: '저는 그날, 당신이 남아줘서 좋았어요.\n\n...도망 안 갈게요. 대답 기다릴게요.',
}

const AWAKENING_LINE: Record<2 | 3, string> = {
  2: '이상하네요.\n\n왜인지 모르겠는데, 당신 앞에서는 덜 떨려요.',
  3: '저 이런 말 잘 안 하는데.\n\n당신을 놓치면 안 된다는 걸, 어디선가 이미 배운 것 같아요.\n언제 배웠는지는 모르겠어요.',
}

const EMOTION: Record<Band, string> = {
  warm: '벅참',
  good: '조심스러운 기쁨',
  flat: '머쓱함',
  cold: '위축',
  hurt: '상함',
}

export function mockTurn(state: GameState, message: string): TurnResponse {
  const { delta, band } = score(state, message)
  const scene = state.scene
  let dialogue: string

  if (state.run >= 2 && scene === 1 && state.turnInScene === 4) {
    dialogue = AWAKENING_LINE[state.run >= 3 ? 3 : 2]
  } else if (state.turnInScene === 3 && band !== 'hurt') {
    dialogue = COURAGE[scene]
  } else {
    const pool = LINES[scene][band]
    dialogue = pool[state.turnInScene % pool.length]
  }

  return {
    dialogue,
    affection_delta: delta,
    emotion: EMOTION[band],
    // 최소 턴을 채우는 턴에만 전환 신호를 준다 — 판정은 어차피 엔진이 한다.
    scene_advance: state.turnInScene >= SCENE_MIN_TURNS - 1,
  }
}
