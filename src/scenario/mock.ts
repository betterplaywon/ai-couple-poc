import { awkwardness, effortCeiling, SCENE_MIN_TURNS } from '../engine/state.js'
import type { GameState, TurnResponse } from '../engine/types.js'

/**
 * API 키가 없거나 호출이 실패했을 때 쓰는 결정론적 대체 응답.
 *
 * 대사는 스크립트다 — 서사 품질 검증에는 쓸 수 없다.
 * 다만 호감도·감점·화 전환·엔딩·재도전은 실제와 **똑같은 계약**으로 돈다.
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
  const bonus = awkwardness(state.run) < 100 ? 1 : 0 // 재도전 보상

  if (RUDE.test(t)) return { delta: -2, band: 'hurt' }
  if (state.scene === 3 && DEFLECT.test(t) && t.length < 20) return { delta: -2, band: 'hurt' }
  // 무성의는 깎지 않는다. 올려주지 않는 것으로 충분하다.
  if (LOW_EFFORT.test(t) || t.length <= 3) return { delta: 0, band: 'cold' }
  if (DEFLECT.test(t) && t.length < 12) return { delta: 0, band: 'cold' }

  // 최고점은 "먼저 다가온" 발화에만 준다.
  if (AFFECTION.test(t)) return { delta: Math.min(8, 8 + bonus), band: 'warm' }
  if (PROPOSAL.test(t)) return { delta: Math.min(8, 7 + bonus), band: 'warm' }
  if (SELF_DISCLOSURE.test(t) && t.length > 20) return { delta: Math.min(8, 5 + bonus), band: 'good' }
  if (t.includes('?') && t.length > 14) return { delta: Math.min(8, 4 + bonus), band: 'good' }
  if (t.length > 12) return { delta: Math.min(8, 3 + bonus), band: 'good' }
  return { delta: 1, band: 'flat' }
}

const LINES: Record<1 | 2 | 3, Record<Band, string[]>> = {
  1: {
    warm: [
      '그런 말 들으면\n어떻게 답해야 되는지... 모르겠어요.\n\n싫다는 건 아니고요.',
      '아.\n\n네. 저도요.\n...이렇게 말해도 되나요?',
    ],
    good: [
      '그건... 생각해본 적 없는데.\n\n듣고 보니 그렇네요.',
      '네.\n\n사람들 가고 나면 여기 조용해지는 게 좋아서요.\n그래서 늘 마지막에 나가요.',
      '그건 왜 물어보세요?\n아, 아니. 대답하기 싫다는 게 아니라.',
    ],
    flat: ['네.\n\n조금 있다 정리 시작할 거예요.', '그렇군요.\n\n의자, 이제 두 개 남았어요.'],
    cold: [
      '아.\n\n네. 늦었죠.\n가보셔야 되는 거 아니에요?',
      // 1화의 서툶은 회피(스스로 대화를 닫는 것)다. 자책은 2화 이후의 동작이라 여기 오면 안 된다.
      '아니에요. 그냥 해본 말이에요.\n\n의자, 다 됐네요.',
    ],
    hurt: [
      '...그건.\n\n대답 안 해도 될까요.',
      '...\n\n정리는 제가 마저 할게요.\n먼저 가셔도 돼요.',
    ],
  },
  2: {
    warm: [
      '그 말 들으려고\n오늘 계속 딴 얘기만 했나 봐요.\n\n아니, 방금 건 못 들은 걸로 해주세요.',
      '진짜요.\n\n...아니 뭐, 안 그러셔도 되는데.\n그래도 좋네요.',
    ],
    good: [
      '아 그거.\n사실 어제부터 무슨 말 할지 생각했어요.\n\n...티 났죠.',
      '여기 조용하다고 해서 골랐는데\n생각보다 시끄럽네요. 죄송해요.',
      '저번에 그 얘기 하셨잖아요.\n...아 아닌가. 제가 잘못 들었나 봐요.',
    ],
    // flat은 무난형이 가장 자주 보는 밴드다. 여기가 비면 "역시 챗봇이네"가 나온다.
    flat: ['네.\n\n커피 식겠어요.', '그러네요.\n\n할 말은 많은데, 왜 이러죠.'],
    cold: [
      // '신났다'는 이 캐릭터의 어휘가 아니고, 자기 상태에 코믹한 라벨을 붙이는 자학 개그 구조다.
      '아. 네.\n\n...저 혼자 얘기했네요, 계속.',
      '별로였으면 말씀하셔도 돼요.\n\n괜찮아요, 진짜로.',
    ],
    hurt: [
      '...\n\n오늘 나오지 말 걸 그랬나 봐요.',
      '네. 알겠습니다.\n\n...준비한 건 그냥 제가 가져갈게요.',
    ],
  },
  3: {
    warm: [
      '정말요.\n\n그 말, 오래 기억할 것 같아요.\n비 그쳐도 좀 더 걷다 가요.',
      '...\n\n숨이 좀 트이네요.\n오늘은 도망 안 친 것 같아서, 다행이에요.',
    ],
    good: [
      '비 그치면 가야 되는데.\n\n...안 그쳤으면 좋겠네요.',
      '제가 지금 말 고르고 있는 거 보이시죠.\n\n근데 오늘은 안 고를게요.',
      // cold(무성의)에 있던 대사. 성의를 판별하는 게 게이지의 존재 이유인데
      // 최고의 대사가 무성의 응답에 배정돼 있으면 그 이유가 흐려진다.
      '...\n\n대답 안 하셔도 돼요.\n아니요. 거짓말이에요. 듣고 싶어요.',
    ],
    flat: ['네.\n\n비 소리 때문에 잘 안 들렸어요.', '비, 안 그치네요.\n\n괜찮아요. 저는.'],
    // 무성의에도 물러서지 않는 게 3화의 그다. 다만 보상을 주지는 않는다.
    cold: ['...\n\n제 말 듣고 계세요?\n\n아니요, 됐어요. 계속할게요.', '네. 알겠어요.'],
    hurt: [
      // '안 웃겨요'는 "나는 재미없는 사람이다"로도 읽혀 의도와 정반대가 된다.
      '웃으시네요.\n\n저는 웃음이 안 나요.',
      '...\n\n네. 제가 괜한 말을 했네요.\n비 그쳤어요. 가세요.',
    ],
  },
}

/** 화마다 한 번, 그가 서툴게 용기를 내는 순간 (화당 4턴이므로 3번째 턴에 고정) */
const COURAGE: Record<1 | 2 | 3, string> = {
  1: '저기.\n\n...다음 모임에도, 오시죠?\n아니 뭐, 안 오셔도 되는데.',
  2: '이거...\n저번에 말씀하신 거 같아서요.\n\n부담스러우면 안 받으셔도 돼요.',
  3: '저는 그날, 당신이 남아줘서 좋았어요.\n\n...도망 안 갈게요. 대답 기다릴게요.',
}

const AWAKENING_LINE: Record<2 | 3, string> = {
  2: '이상하네요.\n\n왜인지 모르겠는데, 당신 앞에서는 덜 떨려요.',
  // 1화 호감도 30에서 나오는 대사다. 준고백이면 관계를 거저 준 것처럼 읽혀
  // 재도전이 진행 단축이 된다. 선언이 아니라 본인도 당황한 반사 행동으로 쓴다.
  3: '...가지 말라고 할 뻔했어요. 방금.\n\n아직 아무 얘기도 안 했는데.\n제가 왜 이러죠.',
}

const EMOTION: Record<Band, string> = {
  warm: '벅참',
  good: '조심스러운 기쁨',
  flat: '망설임', // '머쓱함'은 코믹 레지스터의 단어다. UI에 상시 노출되므로 희화화 감시 대상.
  cold: '위축',
  hurt: '상함',
}

export function mockTurn(state: GameState, message: string): TurnResponse {
  const { delta, band } = score(state, message)
  // 실제 경로와 같은 상한을 태워서 두 경로의 거동이 어긋나지 않게 한다.
  const capped = Math.min(delta, effortCeiling(message))
  const scene = state.scene
  let dialogue: string

  if (state.run >= 2 && scene === 1 && state.turnInScene === 1) {
    dialogue = AWAKENING_LINE[state.run >= 3 ? 3 : 2]
  } else if (state.turnInScene === 2 && band !== 'hurt') {
    dialogue = COURAGE[scene]
  } else {
    const pool = LINES[scene][band]
    dialogue = pool[state.turnInScene % pool.length]
  }

  return {
    dialogue,
    affection_delta: capped,
    emotion: EMOTION[band],
    // 최소 턴을 채우는 턴에만 전환 신호를 준다 — 판정은 어차피 엔진이 한다.
    scene_advance: state.turnInScene >= SCENE_MIN_TURNS - 1,
  }
}
