# moTF Aligo relay

Fly.io에서 고정 발신 IP로 알리고 API를 호출하는 전용 중계 서버입니다.
웹사이트와 Supabase는 기존 Vercel 구성을 유지합니다.

## 1. Fly CLI 설치 및 로그인

```bash
brew install flyctl
fly auth signup
```

이미 Fly.io 계정이 있으면 `fly auth login`을 사용합니다. 결제수단 등록이 필요합니다.

## 2. 앱 생성

이 폴더에서 실행합니다.

```bash
fly apps create motf-aligo-relay-5mb
```

이름이 이미 사용 중이면 `fly.toml`의 `app`과 이후 명령의 앱 이름을 같은 새 이름으로 변경합니다.

## 3. 중계 비밀키 생성

```bash
openssl rand -hex 32
```

출력된 값을 외부에 공개하지 말고 `RELAY_SECRET`로 사용합니다.

## 4. Fly 비밀변수 등록

```bash
fly secrets set \
  ALIGO_RELAY_SECRET='RELAY_SECRET' \
  ALIGO_USER_ID='알리고아이디' \
  ALIGO_API_KEY='알리고API키' \
  ALIGO_SENDER_KEY='알리고SenderKey' \
  ALIGO_SENDER_NUMBER='01033572537' \
  --app motf-aligo-relay-5mb
```

## 5. 배포 및 고정 발신 IP 할당

```bash
fly deploy --app motf-aligo-relay-5mb
fly ips allocate-egress --app motf-aligo-relay-5mb -r nrt
fly ips list --app motf-aligo-relay-5mb
```

`fly ips list`에 표시되는 **Egress IPv4**를 알리고의 `발송 서버 IP`에 등록합니다.
Ingress 또는 Shared IPv4가 아니라 Egress IPv4여야 합니다.

고정 Egress IPv4는 Fly.io 기준 월 약 3.60달러이며, IPv6는 함께 제공됩니다.

## 6. 상태 확인

```bash
curl https://motf-aligo-relay-5mb.fly.dev/health
```

정상 응답:

```json
{"ok":true,"service":"motf-aligo-relay","missing":[]}
```

## 7. Vercel 환경변수 추가

Production 환경에 다음 두 값을 추가합니다.

```text
ALIGO_RELAY_URL=https://motf-aligo-relay-5mb.fly.dev
ALIGO_RELAY_SECRET=RELAY_SECRET
```

`ALIGO_RELAY_SECRET`은 3단계에서 생성해 Fly에 등록한 값과 정확히 같아야 합니다.
저장한 뒤 Vercel Production을 재배포합니다.

기존 값은 유지합니다.

```text
ALIGO_LIVE_ENABLED=true
ALIGO_FAILOVER_ENABLED=false
ALIGO_TEST_MODE=false
```

`ALIGO_TEST_PHONE`은 더 이상 사용하지 않습니다. 기존 환경변수가 남아 있어도 수신번호를 바꾸지 않습니다.
실제 테스트는 운영자 예약 시연에서 역할별 수신번호를 확인한 후 진행합니다.

알리고 계정 비밀값은 Fly가 사용하므로 Vercel에서 제거해도 됩니다.

## 8. 테스트 순서

1. 알리고에 Fly Egress IPv4 등록
2. Vercel 재배포
3. 새 알림 대기열 행 생성
4. `status=sent`, `provider=aligo`, 숫자 `provider_message_id` 확인
5. 실제 카카오 알림톡 수신 확인

문제가 있으면 다음 로그를 확인합니다.

```bash
fly logs --app motf-aligo-relay-5mb
```
