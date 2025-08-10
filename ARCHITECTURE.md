# Site Topping Architecture

## 🏗️ 프로젝트 생태계

Site Topping은 3개의 연관된 프로젝트로 구성됩니다:

### 1. chrome-site-topping (Chrome Extension)
- **역할**: Chrome 브라우저 확장 프로그램
- **기술스택**: React + TypeScript + Vite + CRXJS
- **기능**: 웹사이트 연동, 스크립트 관리, 사용자 인터페이스
- **서버 연결**: imweb-mcp-server와 REST API 통신

### 2. imweb-mcp-server (Backend Server)
- **역할**: 백엔드 API 서버
- **기술스택**: Python + FastAPI + Supabase
- **기능**: 사용자 인증, 사이트 관리, 스크립트 배포, 데이터베이스 관리
- **포트**: 8000 (기본값)
- **클라이언트**: chrome-site-topping, ai-shop-assistant

### 3. ai-shop-assistant (Web Version)
- **역할**: 웹 브라우저용 버전
- **기술스택**: React + TypeScript + Vite
- **기능**: Chrome Extension과 유사한 기능을 웹에서 제공
- **서버 연결**: imweb-mcp-server와 REST API 통신

## 🔗 연결 관계

```
┌─────────────────────┐    HTTP/REST API    ┌─────────────────────┐
│                     │◄──────────────────► │                     │
│  chrome-site-topping│                     │  imweb-mcp-server   │
│  (Chrome Extension) │                     │  (Backend Server)   │
│                     │                     │                     │
└─────────────────────┘                     └─────────────────────┘
                                                      ▲
                                                      │
                                                      │ HTTP/REST API
                                                      │
                                            ┌─────────────────────┐
                                            │                     │
                                            │  ai-shop-assistant  │
                                            │  (Web Version)      │
                                            │                     │
                                            └─────────────────────┘
```

## 🚀 개발 환경 설정

1. **서버 실행**: `imweb-mcp-server` 먼저 실행 (http://localhost:8000)
2. **Chrome Extension**: 이 프로젝트에서 `npm run dev`
3. **Web Version**: `ai-shop-assistant`에서 `npm run dev`

## 📡 API 엔드포인트

주요 API 경로:
- `/api/v1/sites` - 사이트 목록 관리
- `/api/v1/websites` - 웹사이트 추가/삭제
- `/api/v1/sites/{site_code}/script` - 동적 스크립트 제공
- `/sites/{site_code}/scripts` - 스크립트 관리

## 🔑 환경 변수

### chrome-site-topping
```env
VITE_API_BASE_URL=http://localhost:8000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### ai-shop-assistant
```env
VITE_API_BASE_URL=http://localhost:8000
# 기타 환경 변수들...
```
