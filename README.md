# dueday-mcp

개인 할 일을 **ChatGPT / Claude 챗에서 MCP로** 관리하는 작은 서버입니다. 마감일과 함께 *준비 시작일*(`due - lead_days`)을 계산해서, 일 단위 예약 작업이 "지금부터 준비해야 하는 일"을 알려줄 수 있게 설계했습니다.

- **MCP 도구 6개**: `add_todo`, `list_todos`, `update_todo`, `complete_todo`, `upcoming`, `list_tags`
- **REST API**: 같은 서비스 계층을 `/api/*`로 노출 (웹 UI용)
- **저장소**: SQLite (`node:sqlite` 내장, 네이티브 빌드 불필요)
- **인증**: 내장 OAuth 2.1(PKCE, 사전 등록 공개 클라이언트, DCR 없음) 또는 정적 Bearer 토큰, 클라이언트별 요청 제한, 64KB 본문 제한
- **배포**: Docker Compose, 선택적으로 Cloudflare Tunnel 프로필
- **선택 기능**: [gbrain](https://github.com/garrytan/gbrain) 지식 브레인의 프로젝트 페이지에 항목을 선별 동기화

> 개인용으로 만든 도구라 시간대는 **Asia/Seoul 고정**이고, 도구 설명과 오류 메시지는 한국어입니다.

## 빠른 시작 (Docker)

```bash
cp .env.example .env
# .env 의 API_TOKEN 을 채웁니다: openssl rand -hex 32
mkdir -p data
docker compose up -d --build
curl localhost:3080/health
```

컨테이너는 3000번에서 듣고, 호스트에는 `HOST_PORT`(기본 3080)로 `127.0.0.1`에만 공개됩니다. Linux에서 bind mount 권한 문제가 나면 `chown 1000:1000 data`를 실행하세요(컨테이너는 `node` 사용자로 동작).

### 외부 공개 (ChatGPT 커넥터용)

ChatGPT 커스텀 커넥터는 공개 HTTPS 주소가 필요합니다. Cloudflare Zero Trust에서 터널을 만들고, 퍼블릭 호스트명을 `http://todo:3000`으로 연결한 뒤:

```bash
# .env 에 TUNNEL_TOKEN 추가
docker compose --profile tunnel up -d
```

ChatGPT의 커스텀 커넥터는 인증 방식으로 **OAuth**만 제공하므로(정적 키 옵션 없음) `.env`에 `PUBLIC_URL`과 `OWNER_PASSWORD`를 설정해 내장 OAuth 2.1 서버를 켭니다. 그 뒤 ChatGPT → 설정 → Apps & Connectors → 개발자 모드 → Create 에서:

- 연결: 서버 URL `https://<host>/mcp`
- 인증: OAuth. 메타데이터는 `/.well-known/oauth-authorization-server`에서 자동 발견됩니다. 클라이언트 ID는 `OAUTH_CLIENT_ID`(기본 `chatgpt`), 시크릿 없음(PKCE 공개 클라이언트).
- 연결 버튼을 누르면 `/authorize` 승인 페이지가 열리고 `OWNER_PASSWORD`를 입력하면 완료됩니다.

### Claude.ai / Claude Code

- **claude.ai 커스텀 커넥터**: `.env`의 `OAUTH_CLIENTS`에 confidential 클라이언트를 추가합니다(예: `claude|https://claude.ai/api/mcp/auth_callback,https://claude.com/api/mcp/auth_callback|<secret>`). claude.ai → 설정 → Connectors → Add custom connector에서 URL `https://<host>/mcp`, Advanced settings에 OAuth Client ID `claude`와 Client Secret을 입력합니다. 연결 시 `/authorize` 승인 페이지에서 `OWNER_PASSWORD`를 입력합니다.
- **Claude Code**: 헤더 방식이 가장 단순합니다.

```bash
claude mcp add --transport http -s user dueday https://<host>/mcp --header "Authorization: Bearer <API_TOKEN>"
```

Claude Code나 스크립트처럼 헤더를 직접 넣을 수 있는 클라이언트는 `Authorization: Bearer <API_TOKEN>`도 계속 쓸 수 있습니다.

## 환경 변수

| 변수 | 기본 | 설명 |
|---|---|---|
| `API_TOKEN` | 필수 | `/api`, `/mcp` 보호용 Bearer 토큰, 16자 이상 |
| `PORT` | 3000 | 컨테이너 내부 포트 |
| `HOST_PORT` | 3080 | compose가 호스트에 여는 포트 |
| `DB_PATH` | `./data/todo.db` | SQLite 파일 (WAL) |
| `RATE_LIMIT_PER_MIN` | 60 | 클라이언트(IP 또는 토큰)별 분당 요청 수 |
| `PUBLIC_URL` | 비움 | 터널이 노출하는 공개 origin. `OWNER_PASSWORD`와 함께 설정하면 OAuth 활성 |
| `OWNER_PASSWORD` | 비움 | `/authorize` 승인 페이지 비밀번호, 12자 이상. `WEB_PASSWORD`가 없으면 웹 로그인에도 사용 |
| `WEB_PASSWORD` | 비움 | 웹 UI 로그인 전용 비밀번호(4자 이상, PIN 가능). 실패 5회/15분 잠금, 전체 30회/15분 잠금 |
| `OAUTH_CLIENT_ID` | `chatgpt` | 사전 등록 공개 클라이언트 ID |
| `OAUTH_REDIRECT_URIS` | ChatGPT 기본 | 허용 리다이렉트 URI(쉼표 구분). `https://chatgpt.com/connector/oauth/<id>`는 항상 허용 |
| `OAUTH_CLIENTS` | 비움 | 여러 클라이언트: `id\|redirect1,redirect2[\|secret];...`. 설정 시 위 두 값을 대체 |
| `GBRAIN_URL` | 비움 | gbrain MCP 엔드포인트. 아래 자격증명 중 하나와 함께 설정하면 동기화 활성 |
| `GBRAIN_TOKEN` | 비움 | 정적 bearer 토큰 |
| `GBRAIN_CLIENT_ID`, `GBRAIN_CLIENT_SECRET` | 비움 | OAuth client_credentials (권장). 토큰은 자동 발급·캐시 |
| `TUNNEL_TOKEN` | 비움 | `tunnel` 프로필용 cloudflared 토큰 |

## MCP 도구

모든 응답은 `{ success, data, meta: { today, total? } }` 형태이고 `meta.today`는 Asia/Seoul 기준 오늘입니다. 상대 날짜("이번주 금요일")는 클라이언트(LLM)가 `meta.today`로 변환해서 `YYYY-MM-DD`로 보냅니다. 날짜만 오면 그날 18:00으로 저장됩니다.

| 도구 | 역할 |
|---|---|
| `add_todo` | 등록. `title`, `due?`, `tags?`, `lead_days?`(기본 3), `note?`, `brain_ref?` |
| `list_todos` | 조회. `status`, `tag`, `due_before`, `due_after`, `q`, `limit`, `offset` |
| `update_todo` | 부분 수정. 바꿀 필드만 최상위에. `due: null`이면 마감 제거 |
| `complete_todo` | 완료 / `reopen: true`로 되돌리기 |
| `upcoming` | 알림용. `overdue`, `start_now`, `later`, `no_due` 그룹 + 한 줄 `summary` |
| `list_tags` | 태그와 미완료 개수 |

상세 명세는 [`docs/mcp-tools.json`](docs/mcp-tools.json), 아키텍처는 [`docs/architecture.html`](docs/architecture.html)에 있습니다.

### ChatGPT 프로젝트 지침 예시

개발자 모드 커넥터는 대화마다 `+` 도구 메뉴에서 켜야 하고, 명시하지 않으면 ChatGPT가 자체 예약·메모 기능으로 처리해 버립니다. 전용 프로젝트를 만들어 아래 지침을 넣어 두면 안정적으로 동작합니다.

```text
너는 내 할 일 비서다. 할 일 저장소는 dueday 커넥터(MCP) 하나뿐이다.

[절대 규칙]
- 할 일 등록·조회·수정·완료는 반드시 dueday 도구(add_todo, list_todos, update_todo, complete_todo, upcoming, list_tags)로 처리한다.
- ChatGPT 자체 예약(리마인더)·메모·캔버스 기능으로 대신하지 않는다. 도구를 쓸 수 없으면 "dueday 커넥터가 이 대화에 켜져 있지 않다"고 알리고 멈춘다.
- 항목을 삭제하지 않는다. 완료 처리만 한다.

[날짜]
- 모든 날짜는 Asia/Seoul. 기준일은 도구 응답의 meta.today를 쓴다.
- 상대 표현은 YYYY-MM-DD로 바꿔 넘긴다. "이번주"는 오늘이 속한 월~일, "다음주"는 그 다음 월~일. 요일이 없으면 그 주 금요일로 잡고 답변에 요일을 같이 적어 확인받는다.
- 시각이 없으면 due에 날짜만 넘긴다.

[준비 기간 lead_days]
- 보고서·리서치·발표 자료: 5 / 신청·서류·예약: 3 / 구매·심부름·연락: 1. 사용자가 "며칠 전부터"라고 말하면 그 값을 쓴다.

[태그]
- add_todo 전에 list_tags를 먼저 보고 기존 태그를 재사용한다. 새 태그는 짧은 명사 하나.
- 한 메시지에 할 일이 여러 개면 각각 따로 등록한다.

[대화 처리]
- "뭐 남았어": upcoming(days=7) → 마감 지남 / 지금 준비 시작 / 예정 순으로 요약.
- "~했어": list_todos(q=키워드)로 찾아 complete_todo. 후보가 둘 이상이면 고르게 한다.
- "~미뤄줘": update_todo로 due 변경.
- 등록 후 답변은 한 줄: 제목 · 마감(요일) · 준비 시작일 · 태그.
```

### 예약 작업 프롬프트 예시 (매일 아침)

```text
dueday 커넥터의 upcoming 도구를 days=7로 호출해라. 결과를 이렇게 정리해서 알려줘:
1) 마감 지남 — 제목, 마감일 (있을 때만, 굵게)
2) 오늘 준비 시작 — 제목, 마감일, 남은 일수. 맨 위에 눈에 띄게.
3) 이번 주 예정 — 제목, 마감일, 준비 시작일
4) 마지막 줄에 도구 응답의 summary를 그대로 인용.
아무것도 없으면 "오늘은 준비 시작할 일이 없음" 한 줄만.
```

## 개발

```bash
pnpm install
API_TOKEN=devtokendevtokendevtoken pnpm dev   # tsx watch
pnpm test            # vitest
pnpm test:coverage   # 80% 이상 강제
pnpm typecheck && pnpm build
```

구조: `src/todos`(도메인·저장소·날짜), `src/mcp`(MCP 어댑터), `src/api`(REST), `src/auth`(Bearer·요청 제한), `src/oauth`(OAuth 2.1 서버), `src/brain`(gbrain 동기화), `src/db`(마이그레이션).

## gbrain 동기화 (선택)

`brain_ref`에 gbrain 프로젝트 페이지 슬러그를 주면 생성·완료 시 그 페이지의 `## 남은 일` 표에 `todo:<id>` 행을 추가·갱신합니다. 없는 페이지는 만들지 않으며 결과는 `brain_sync_log`에 남습니다. 시간 제한은 요청당 5초입니다.

gbrain 쪽에는 `projects/`만 쓸 수 있는 client_credentials 클라이언트를 하나 등록하는 것을 권합니다:

```bash
gbrain auth register-client dueday --grant-types client_credentials \
  --scopes "read write" --token-endpoint-auth-method client_secret_post \
  --bound-slug-prefixes projects/
```

## 라이선스

MIT
