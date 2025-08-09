# Site Topping MVP 백엔드 API 요구사항

## 핵심 개념
- **실시간 미리보기**: 편집 중인 코드를 메모리(Redis)에 저장하고 실시간 반영
- **데이터베이스**: 최종 배포된 코드만 영구 저장
- **3가지 사이트 상태**:
  1. 원래 상태 (미리보기 OFF): 연동 스크립트 차단
  2. 미리보기 상태 (미리보기 ON): 실시간 편집 코드 적용  
  3. 배포 상태: 배포된 코드 적용

---

## 필요한 API 엔드포인트

### 1. 실시간 임시 코드 저장 (메모리/Redis)

```http
PUT /api/v1/sites/{site_code}/live-preview
Content-Type: application/json
Authorization: Bearer <token>

{
  "javascript": "console.log('실시간 수정 중');",
  "css": "body { color: red; }"
}

Response:
{
  "success": true,
  "message": "실시간 코드 업데이트 성공"
}
```

**구현 요구사항:**
- Redis 키: `live-preview:{site_code}:{user_id}`
- 값: `{javascript: string, css: string, timestamp: string}`
- TTL: 1시간 (편집 안 하면 자동 삭제)
- 응답 시간: 50ms 이내

### 2. 실시간 코드 조회 (미리보기용)

```http
GET /api/v1/sites/{site_code}/live-preview
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "javascript": "console.log('실시간 수정 중');",
    "css": "body { color: red; }",
    "updated_at": "2024-01-01T10:00:00Z"
  }
}
```

### 3. 미리보기 스크립트 제공 (Public Access)

```http
GET /api/v1/sites/{site_code}/preview-script.js
Content-Type: application/javascript
Cache-Control: no-cache
Access-Control-Allow-Origin: *
```

**반환할 JavaScript 코드:**
```javascript
(function() {
  const SITE_CODE = '{SITE_CODE}';
  const API_BASE = 'https://api.sitetopping.com';
  
  // 기존 미리보기 코드 제거
  const existingStyle = document.getElementById('site-topping-preview-css');
  if (existingStyle) existingStyle.remove();
  
  const existingScript = document.getElementById('site-topping-preview-js');
  if (existingScript) existingScript.remove();
  
  // 실시간 코드 가져와서 적용
  fetch(`${API_BASE}/api/v1/sites/${SITE_CODE}/live-preview`)
    .then(response => response.json())
    .then(data => {
      if (data.success && data.data) {
        // CSS 적용
        if (data.data.css) {
          const style = document.createElement('style');
          style.id = 'site-topping-preview-css';
          // CSS 스코핑: 익스텐션 UI 제외
          const scopedCSS = data.data.css.replace(/([^{}]+){/g, (match, selector) => {
            return selector.split(',').map(s => 
              `${s.trim()}:not(#site-topping-root):not(#site-topping-root *)`
            ).join(',') + '{';
          });
          style.textContent = scopedCSS;
          document.head.appendChild(style);
        }
        
        // JavaScript 실행
        if (data.data.javascript) {
          try {
            const script = document.createElement('script');
            script.id = 'site-topping-preview-js';
            script.textContent = data.data.javascript;
            document.head.appendChild(script);
          } catch (error) {
            console.warn('[Site Topping] JS execution failed:', error);
          }
        }
      }
    })
    .catch(error => {
      console.warn('[Site Topping] Preview load failed:', error);
    });
})();
```

### 4. 연동 스크립트 정보 조회

```http
GET /api/v1/sites/{site_code}/integration-info
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "integration_script_url": "https://api.sitetopping.com/api/v1/sites/ABC123/script",
    "preview_script_url": "https://api.sitetopping.com/api/v1/sites/ABC123/preview-script.js",
    "site_domain": "example.com",
    "site_code": "ABC123"
  }
}
```

---

## 기존 API 수정 요구사항

### 최종 배포 API 개선

**기존:**
```http
POST /sites/{site_code}/scripts/deploy
{
  "script": "<script>console.log('code');</script>"
}
```

**변경 요청:**
```http
POST /sites/{site_code}/scripts/deploy
{
  "javascript": "console.log('code');",
  "css": "body { color: blue; }",
  "from_live_preview": true
}
```

**동작:**
1. `from_live_preview: true`인 경우: Redis의 실시간 코드를 DB에 영구 저장
2. `from_live_preview: false`인 경우: 요청 바디의 코드를 DB에 저장

---

## CORS 및 캐싱 정책

### CORS 설정
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, PUT, POST, OPTIONS  
Access-Control-Allow-Headers: Content-Type, Authorization
```

### 캐싱 정책
- **실시간 코드 API**: `Cache-Control: no-cache` (실시간 반영 필요)
- **미리보기 스크립트**: `Cache-Control: no-cache` (실시간 반영 필요)
- **배포 스크립트**: `Cache-Control: public, max-age=300` (5분 캐싱)

---

## 성능 요구사항

- **실시간 코드 저장**: 응답 시간 50ms 이내
- **미리보기 스크립트**: 응답 시간 100ms 이내  
- **동시 사용자**: 1000명 기준 설계
- **Redis TTL**: 1시간 (메모리 절약)

---

## 우선순위

1. **최고**: 실시간 코드 저장/조회 API
2. **높음**: 미리보기 스크립트 제공 API
3. **중간**: 배포 API 수정
4. **낮음**: 연동 스크립트 정보 API

---

## 참고사항

- 모든 인증된 API는 기존 JWT 토큰 시스템 사용
- 에러 응답 형식은 기존과 동일
- 실시간 코드는 사용자별·사이트별 1개씩만 저장
- CSP 정책 고려한 안전한 스크립트 실행