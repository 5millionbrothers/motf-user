# moTF 이용자 웹

대학생 MT 팀이 숙소 예약, 장보기, 커뮤니티, 모티프 주최 MT와 내 MT를 이용하는 서비스입니다.

## 저장소 역할

- 화면과 사용자 흐름: 정적 HTML/CSS/JavaScript
- 서버 API: Vercel Functions (`api/`)
- 인증·데이터: Supabase
- 결제: Toss Payments
- 휴대폰 본인확인: KCP 인증 어댑터
- DB 마이그레이션 원본: `motf-database/supabase`

DB SQL은 이 저장소에 복사하지 않습니다. 스키마 변경은 반드시 `motf-database`에 번호가 붙은 SQL로 추가합니다.

## 출시 준비 기능

- KCP 휴대폰 본인확인 기반 회원가입·비밀번호 재설정·카카오 가입정보 보완
- 카드·계좌이체 우선, 가상계좌를 나중에 열 수 있는 토스 결제 원장
- 숙소 객실 기본금 결제와 승인·거절·부분 환불
- 포인트·할인코드·캐시백 캠페인과 판매가 기준 사장님 정산
- 승인 숙소·마트·상품, 실시간 객실 공실과 성인 회원 주류 주문 제한
- 모티프 주최 MT, 운영 카드뉴스·팝업·Instagram 연결
- 내 MT 소유자/초대받은 동행/종료 구분과 동행 보기 전용 초대
- 실시간 채팅, 커뮤니티, 리뷰, 문의·분쟁, 예결산

숙소의 추가 인원·바베큐 등 부대시설 요금은 온라인 추가 결제를 만들지 않고 현장에서 사장님에게 직접 결제합니다. 과거 추가결제 DB 기록은 감사 목적으로만 유지됩니다.

## 필수 Vercel 환경변수

```text
SUPABASE_URL=https://프로젝트.supabase.co
SUPABASE_PUBLISHABLE_KEY=Supabase publishable key
SUPABASE_SERVICE_ROLE_KEY=Supabase service_role key

TOSS_CLIENT_KEY=숙소 MID의 주문서형·결제창형 클라이언트 키(기존 변수명, 계속 사용 가능)
TOSS_SECRET_KEY=숙소 MID의 클라이언트 키와 같은 쌍의 시크릿 키(기존 변수명, 계속 사용 가능)
TOSS_MARKET_CLIENT_KEY=장보기 MID의 주문서형·결제창형 클라이언트 키
TOSS_MARKET_SECRET_KEY=장보기 MID의 클라이언트 키와 같은 쌍의 시크릿 키

KCP_CERT_SITE_CODE=KCP 본인확인 사이트코드
KCP_CERT_WEB_SITE_ID=KCP 웹사이트 ID(발급된 경우)
KCP_CERT_ADAPTER_URL=https://별도-KCP-어댑터-주소
KCP_CERT_ADAPTER_SECRET=어댑터 간 통신용 긴 임의 비밀값
IDENTITY_HASH_PEPPER=CI/DI 해시에 추가할 긴 임의 비밀값

NAVER_MAP_KEY_ID=네이버 지도 API Key ID
```

`TOSS_SECRET_KEY`, `TOSS_MARKET_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `KCP_CERT_ADAPTER_SECRET`, `IDENTITY_HASH_PEPPER`는 브라우저 코드, `config.js`, GitHub에 넣지 않습니다.

가상계좌를 여는 시점에는 토스페이먼츠 어드민의 결제창 설정에서 가상계좌를 활성화하고 계약 상태를 확인합니다. 이용자는 moTF 화면이 아니라 토스 안전결제창에서 현재 가능한 결제수단을 선택합니다.

## 적용 순서

1. `motf-database/supabase/57`, `58`, `59` SQL을 번호순으로 Supabase SQL Editor에서 실행합니다.
2. Toss·KCP·Supabase 환경변수를 Vercel Production/Preview에 등록합니다.
3. 숙소 MID와 장보기 MID 양쪽의 토스 웹훅을 모두 `https://motf.co.kr/api/toss-webhook`으로 등록합니다.
4. KCP 어댑터를 준비하고 `docs/kcp-identity-adapter.md` 계약대로 연결합니다.
5. 이용자와 사장님 저장소를 배포한 뒤 아래 시나리오를 검증합니다.

국세청 사업자 진위확인 키는 사장님 앱 Vercel의 `DATA_GO_KR_SERVICE_KEY`에 등록합니다.

## 배포 전 핵심 확인

- KCP 인증 없이는 이메일·카카오 가입 완성이 차단되는가
- 같은 CI로 중복 계정이 생성되지 않는가
- 카드/계좌이체 성공 후 예약·주문이 정확히 한 건만 생성되는가
- 예약 거절 시 토스 전액 환불, 이용자 취소 시 기간별 부분 환불이 적용되는가
- 포인트를 써도 사장님 정산액은 판매가에서 수수료만 뺀 금액인가
- 주류 상품은 KCP 기준 성인 계정만 주문할 수 있는가
- 초대받은 내 MT는 읽기만 가능하고 수정할 수 없는가
- 일반 이용자가 다른 이용자의 예약·포인트·내 MT를 읽을 수 없는가

## 로컬 확인

정적 화면은 간단한 HTTP 서버로 볼 수 있지만, Vercel Functions까지 확인하려면 Vercel CLI 개발 서버가 필요합니다. 본인확인과 실제 결제는 등록 도메인 및 운영/테스트 키 설정이 완료된 환경에서 검증합니다.

## 모바일 시안 확인

- `mobile-shell.css`: 760px 이하에서만 적용되는 모바일 탐색·안전 영역·터치 영역 스타일
- `mobile-shell.js`: 상단 현재 화면명, 홈 둘러보기 메뉴, 하단 5개 탭
- `docs/mobile-refactor-notes.md`: 이번 변경 범위와 다음 리팩터링 순서
- `tools/sync-route-pages.sh`: 루트 `index.html`을 동일한 경로별 복사본에 동기화

루트 `index.html`의 공통 마크업이나 스크립트 참조를 수정한 뒤에는 아래 명령으로 경로별 복사본을 맞춥니다.

```sh
./tools/sync-route-pages.sh
```

새 모바일 탐색은 PC 화면을 바꾸지 않으며, 화면 폭 760px 이하에서만 표시됩니다.
