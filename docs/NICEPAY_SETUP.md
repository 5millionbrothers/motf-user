# NICEPAY 전환 배포 안내

2026-10-29 작성. 첨부된 인증결제 2.1.5 규격의 MID/MerchantKey 방식입니다.
별도 REST API의 clientId/secretKey 방식과 혼용하지 않습니다.

## 현재 완료 범위

- 숙소와 공판장 신규 결제: 인증창 → 서버 서명 검증 → 승인 → 기존 예약/주문 원장 저장.
- 개인/단체 포인트, 할인코드, 객실 방막기, 상품 재고 보관 연계 유지.
- 카드 결제 완료와 가상계좌 발급/입금 완료 상태 구분.
- 이용자 취소, 사장님 거절, 운영팀 취소를 공통 환불 API로 통합.
- 원거래 PG를 보고 환불하므로 과거 토스 결제는 토스로 환불.
- 같은 승인/취소를 중복 실행하지 않는 서버 작업 원장 추가.
- 불명확한 결과는 확인 필요로 남기고 재결제를 유도하지 않음.
- 지급대행 송금과 에스크로는 미활성. 기존 수수료율은 변경하지 않음.
- 숙소는 객실 기본금만 선결제. 현장 추가인원/시설 요금 처리 방식은 변경하지 않음.

코드와 로컬 테스트 완료는 실거래 검증 완료를 뜻하지 않습니다. 아래 설정 후 반드시 실제 개통된 테스트 환경에서 검수해야 합니다.

## 1. DB 적용

최신 DB가 기존 83번까지 적용된 상태인지 확인하고 백업합니다.
`motf-database/supabase`의 다음 두 파일만 순서대로 Supabase SQL Editor에서 실행합니다.

1. `84_nicepay_operation_foundation.sql`
2. `85_nicepay_checkout_and_refunds.sql`

기존 테이블/데이터를 지우지 않습니다. 예전 1~83번 SQL을 다시 실행하지 않습니다.
새 결제 원장 테이블과 서버 RPC는 일반 이용자가 직접 수정할 수 없도록 제한했습니다.

## 2. 이용자 저장소 업로드

제공된 `motf-user` 안의 변경 파일을 이용자 GitHub 저장소의 같은 상대 경로에 덮어씁니다.
새 `package.json`, `pnpm-lock.yaml`, API 파일, `nicepay.js`도 포함해야 합니다.
Vercel의 Root Directory는 저장소 루트, Framework Preset은 기존 정적 사이트 설정인 Other를 유지합니다.
별도 빌드 명령은 필요하지 않으며 의존성 설치는 자동으로 진행됩니다.

처음에는 `PAYMENT_PROVIDER`를 바꾸지 않은 채 배포합니다. 미설정 또는 `toss`이면 기존 토스 신규 결제가 유지됩니다.
새 코드가 배포되었다는 이유만으로 나이스 결제로 전환되지 않습니다.

## 3. 이용자 Vercel 환경변수

이용자 프로젝트 → Settings → Environment Variables에서 입력합니다.
실제 운영용 값은 Production에, 별도 검수용 값은 Preview에 구분하여 넣고 재배포합니다.
키 값은 GitHub, `config.js`, 채팅에 올리지 않습니다.

| 이름 | 값/설명 |
| --- | --- |
| `NICEPAY_STAY_MID` | 숙소 결제에 사용하도록 승인된 10자리 MID |
| `NICEPAY_STAY_MERCHANT_KEY` | 해당 MID의 MerchantKey |
| `NICEPAY_MARKET_MID` | 공판장 결제에 사용하도록 승인된 10자리 MID |
| `NICEPAY_MARKET_MERCHANT_KEY` | 해당 MID의 MerchantKey |
| `MOTF_PUBLIC_ORIGIN` | `https://motf.co.kr` |
| `NICEPAY_STAY_METHODS` | 우선 `CARD` |
| `NICEPAY_MARKET_METHODS` | 우선 `CARD` |
| `NICEPAY_PARTIAL_CANCEL_ENABLED` | 부분취소 사용 승인 확인 전 `false` |
| `NICEPAY_MARKET_NON_ESCROW_APPROVED` | 정당한 비에스크로 현금결제 적용을 확인하기 전 `false` |
| `PAYMENT_PROVIDER` | 전환 직전까지 `toss`, 검수 준비 후 `nicepay` |

기존 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`는 정상 값을 유지합니다.
과거 토스 거래 처리를 위해 기존 `TOSS_STAY_*`, `TOSS_MARKET_*` 값도 삭제하지 않습니다.
사장님 프로젝트에는 나이스 키를 넣지 않아도 됩니다. 실제 승인/환불은 이용자 서버에서만 실행합니다.
한 MID로 두 업종을 처리해도 되는지 나이스가 승인한 경우에만 두 항목에 같은 값을 넣습니다. 임의로 다른 업종 키를 대신 쓰지 않습니다.

나중에 승인된 수단만 `CARD,BANK,VBANK,CELLPHONE` 중 쉼표로 추가할 수 있습니다.
환경변수 추가만으로 PG 계약/에스크로 요건이 충족되는 것은 아닙니다.
공판장 계좌이체·가상계좌는 에스크로가 미구현된 상태에서 무심코 열리지 않도록 차단했습니다.
휴대폰 결제도 별도 개통 확인이 필요합니다.

## 4. 나이스 관리자 등록

- 모바일/PC 인증 결과 처리: `https://motf.co.kr/api/nicepay-return`
- 결제 통보 URL: `https://motf.co.kr/api/nicepay-webhook`
- www 도메인에서도 결제를 허용한다면 `https://www.motf.co.kr/api/nicepay-return` 복귀도 허용되어야 합니다.
- 관리자 화면의 정확한 메뉴 이름/통보 제공 범위는 MID 설정에 따라 나이스 담당자에게 확인합니다.
- Vercel Deployment Protection이 PG 서버의 콜백/통보 접근을 막지 않는지 확인합니다.

복귀 URL은 브라우저 로그인 쿠키나 토큰 없이도 검증할 수 있도록 주문별 서버 nonce와 PG 서명을 확인합니다.
통보는 전송된 금액만 믿지 않고, 서버에서 원거래를 다시 조회하여 처리합니다.
실제 키는 서버에만 있고 브라우저에는 서명 결과와 결제창 요청 필드만 전달합니다.

## 5. 사장님/운영자 저장소 업로드

이용자 서버의 신규 API 배포를 먼저 마치고 `motf-owner` 변경 파일을 같은 경로에 덮어씁니다.
필요하다면 사장님 Vercel에 `MOTF_PAYMENT_API_ORIGIN=https://motf.co.kr`를 설정합니다. 기본값도 같은 주소입니다.
사장님 서버가 이용자 서버로 로그인 토큰을 전달하고, 이용자 서버가 실제 업장/운영자 권한을 다시 검증합니다.

입금 대기와 결제 확인 필요는 예약 확정과 다릅니다. 확인 필요 거래는 주문번호로 운영팀 결제 복구에서 확인합니다.

## 6. 개통 검수 체크리스트

실제 결제/환불의 최종 실행은 계정 소유자가 직접 진행합니다.

- 숙소와 공판장 각각 PC/모바일 카드 결제창 호출.
- 쿠폰/포인트 적용 후 PG 금액, DB 결제액, 이용자 화면이 같은지 확인.
- 결제 완료 후 이용 내역과 사장님/운영자 승인 대기 목록에 동일 거래가 보이는지 확인.
- 동일 주문의 결과 URL을 다시 열어도 중복 결제/중복 예약이 생기지 않는지 확인.
- 사장님 거절 시 전액 취소, 객실 해제, 포인트 복구가 한 번만 반영되는지 확인.
- 운영팀 취소와 이용자 취소의 권한/환불 규정 확인.
- 부분취소 개통 확인 뒤 `NICEPAY_PARTIAL_CANCEL_ENABLED=true`로 바꾸고 소액으로 검수.
- 과거 토스 거래는 토스 키로 조회/취소되는지 확인.
- 가상계좌 개통 후에는 발급 화면에 은행/계좌/기한 표시, 입금 전 방막기, 입금 통보 후 예약 생성 검수.
- 승인 결과가 불명확한 거래는 결제 확인 필요로 남고 재결제 버튼이 나오지 않는지 확인.

환불 API 성공은 PG 취소 처리 결과이며 고객 계좌/카드에 실제 반영되는 시점은 결제수단에 따라 다릅니다.
접수/처리 중 응답은 환불 완료로 표시하지 않습니다.
나이스 통신 오류 시 승인 재시도를 반복하지 않고 한 번의 망취소 및 확인 필요 처리로 넘깁니다.

## 복구와 전환 보류

새 결제 접수를 토스로 되돌리려면 `PAYMENT_PROVIDER=toss` 후 재배포합니다. DB를 되돌리거나 원장을 삭제하지 않습니다.
이미 진행한 나이스 거래는 나이스 원거래로 계속 조회/환불해야 하므로 나이스 키와 API도 유지합니다.
환불 결과 불명확/DB 저장 실패 거래는 운영팀 결제 복구를 사용합니다.
금액을 확인할 수 없는 외부 수동 취소는 단순히 PG 상태가 취소라는 이유로 전액 환불 완료 처리하지 않습니다.
보관 기한이 지난 승인 건은 객실/재고가 이미 풀렸을 수 있으므로 자동으로 새 예약을 만들지 않고 운영팀 확인이 필요합니다.

## 아직 미구현 또는 계약 확인 필요

- 지급대행: 별도 계약/MID/출금 정책을 확인한 뒤 실제 송금 API와 운영 화면을 연결해야 합니다. 현재 기반 모듈만 있으며 송금은 실행되지 않습니다.
- 에스크로: 별도 신청 후 구매확인/배송·수령 정보/취소 흐름까지 추가 구현해야 합니다. 현재 일반 결제는 에스크로 결제가 아닙니다.
- 일반 상점 MID와 키 발급만으로 위 두 기능이 개통되었다고 간주하지 않습니다.
- 60초 함수와 기존 5분 Cron 사용은 Vercel 요금제에 따라 업그레이드가 필요할 수 있습니다.

## 검증 결과

- Node 자동 테스트 56개 통과: 서명, 금액/권한 검증, 중복 승인·환불 차단, 망취소, 웹훅, 과거 토스 경로 등.
- 로컬 PGlite 격리 DB 검증 32개 통과. 운영 Supabase 전체 스키마를 복제한 통합 테스트는 아닙니다.
- JavaScript 문법 검사 53개 파일과 HTML 31개 진입점 확인.
- 사장님 Next.js 프로덕션 빌드/타입 검사 통과. lint 오류 없음, 기존 미사용 변수 경고 1개 유지.
- PC/모바일 로컬 결제 컴포넌트 검수 진행. 외부 PG 승인 자체는 모의 응답만 테스트했습니다.
- 프로덕션 SQL 실행, 실제 MID 결제/환불, GitHub 업로드, Vercel 배포는 이 작업에서 하지 않았습니다.

## 공식 규격

- [인증 결제창](https://developers.nicepay.co.kr/docs/pg/auth/payment-window/)
- [승인](https://developers.nicepay.co.kr/docs/pg/auth/authorization/)
- [망취소](https://developers.nicepay.co.kr/docs/pg/auth/net-cancel/)
- [취소/환불](https://developers.nicepay.co.kr/docs/pg/auth/payment-cancel/)
- [거래 조회](https://developers.nicepay.co.kr/docs/pg/inquiry/trans-inquiry/)
- [결제 통보](https://developers.nicepay.co.kr/docs/pg/add/noti/)
