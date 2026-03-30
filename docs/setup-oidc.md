# OIDC Provider Setup Guide

Evidence Browser는 Generic OIDC provider를 사용하여 인증합니다.

## 환경변수

```bash
OIDC_ISSUER=https://auth.example.com/application/o/evidence-browser/
OIDC_CLIENT_ID=<your-client-id>
OIDC_CLIENT_SECRET=<your-client-secret>
OIDC_PROVIDER_NAME=Authentik   # 로그인 페이지에 표시될 이름
NEXTAUTH_SECRET=<random-secret>  # openssl rand -base64 32
NEXTAUTH_URL=https://evidence.example.com
AUTH_SECRET=<same-as-nextauth-secret>
```

## Authentik 설정

1. Authentik Admin > Applications > Providers > Create
2. Provider type: **OAuth2/OpenID Provider**
3. 설정:
   - Name: `evidence-browser`
   - Authorization flow: implicit consent
   - Client type: Confidential
   - Redirect URIs: `https://evidence.example.com/api/auth/callback/oidc`
4. Client ID와 Client Secret를 복사하여 환경변수에 설정
5. Issuer URL: `https://auth.example.com/application/o/evidence-browser/`

## Keycloak 설정

1. Keycloak Admin > Clients > Create Client
2. 설정:
   - Client ID: `evidence-browser`
   - Client authentication: On
   - Valid redirect URIs: `https://evidence.example.com/api/auth/callback/oidc`
3. Credentials 탭에서 Client Secret 복사
4. Issuer URL: `https://keycloak.example.com/realms/<realm-name>`

## Redirect URI

모든 OIDC provider에 등록해야 하는 Redirect URI:

```
https://<your-domain>/api/auth/callback/oidc
```

로컬 개발: `http://localhost:3000/api/auth/callback/oidc`

## Troubleshooting

- **Discovery endpoint 오류**: Issuer URL + `/.well-known/openid-configuration`에 접근 가능한지 확인
- **Redirect URI 불일치**: provider에 등록된 URI와 NEXTAUTH_URL이 일치하는지 확인
- **HTTPS 필요**: 프로덕션에서는 반드시 HTTPS 사용
