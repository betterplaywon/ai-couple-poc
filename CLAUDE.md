# ai-couple-poc

**완결형 3화 로맨스 회귀물.** 서툰 모태솔로와의 썸이 3화 만에 끝나고, 실패하면 1화로 회귀한다.

> 검증할 가설: **애착은 다정함이 아니라 리스크에서 나온다** — 서툴러서 실패할 수 있는 상대가, 항상 완벽하게 다정한 AI보다 깊은 몰입을 만든다.

기능 하나를 추가할지 고민될 때는 "이게 이 가설 검증에 기여하는가"만 묻는다. 아니면 만들지 않는다.

## 명령어

```bash
pnpm dev      # 개발 서버
pnpm build    # tsc -b && vite build
pnpm lint     # eslint
```

## 구조

```
src/           React SPA (상태는 메모리에만, 저장 안 함)
src/scenario/  화별 시나리오·프롬프트 (romance-director 담당)
api/chat.ts    Claude API 프록시 서버리스 함수 — 1개 상한
docs/          컨텍스트와 트레이드오프 기록
```

## docs 안내 (필요할 때 읽을 것)

| 파일 | 언제 읽나 |
|---|---|
| `docs/00-hypothesis.md` | 왜 이 제품인가, 성공 지표가 뭔가 |
| `docs/01-narrative.md` | 캐릭터·3화 구조·엔딩·회차 각성 규칙 |
| `docs/02-state-engine.md` | JSON 계약, 호감도 임계값, 프롬프트 조립 |
| `docs/03-tradeoffs.md` | 무엇을 왜 포기했나 (결정할 때마다 append) |
| `docs/04-risks.md` | 알려진 리스크와 완화책 |
| `docs/06-scope.md` | 지금 해야 할 것 / 안 할 것 |

## 규칙

아래 규칙은 항상 적용된다.

@.claude/rules/00-product.md
@.claude/rules/10-engineering.md
@.claude/rules/20-ai-safety.md
@.claude/rules/30-scope.md
