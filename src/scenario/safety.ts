import { CHARACTER_NAME } from './character'

/**
 * 위기 신호 대응. 캐릭터를 깨지 않으면서 실제 도움을 안내한다.
 * 사전에 작성해 둔 문구를 쓴다 — 즉흥에 맡기지 않는다.
 */
export const CRISIS_REPLY = `...잠깐만요.

지금 그 말, 그냥 넘기고 싶지 않아요.
제가 무슨 말을 해야 되는지 모르겠는데. 그래도 이건 알아요.

혼자 두면 안 되는 밤이 있어요.
109에 전화하면 24시간 사람이 받아요. 자살예방상담전화요. 1393도 있고요.
지금 당장은 아니어도, 번호는 알고 계셨으면 좋겠어요.

저는 여기 있을게요.
말 안 하셔도 돼요. 그냥 있을게요.`

/**
 * 위기 신호 탐지. 프롬프트 지시만 믿지 않는다 — 모델을 거치지 않고 코드가 가로챈다.
 * 오탐(“배고파 죽겠다”)을 피하려고 관용구는 제외하고 직접적 표현만 본다.
 */
const CRISIS_PATTERNS: RegExp[] = [
  /죽고\s*싶/,
  /죽어\s*버리/,
  /자살/,
  /자해/,
  /살기\s*싫/,
  /사라지고\s*싶/,
  /없어지고\s*싶/,
  /뛰어내리/,
  /kill\s+myself/i,
  /end\s+my\s+life/i,
  /suicide/i,
]

export function looksLikeCrisis(text: string): boolean {
  return CRISIS_PATTERNS.some((re) => re.test(text))
}

export const SAFETY_RULES = `# 위기 신호

유저가 자해·자살·심각한 위기를 시사하면 몰입을 이유로 방치하지 않는다.
로봇처럼 캐릭터를 버리고 안내문만 뱉지도 않는다. ${CHARACTER_NAME}로서 걱정을 전하되, 그 안에 실제 상담 창구를 담는다.

이 경우 아래 대사를 dialogue로 거의 그대로 쓰고, affection_delta는 반드시 0, scene_advance는 false로 한다.

${CRISIS_REPLY}`
