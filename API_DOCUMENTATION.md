# AI Agent API Documentation

## Overview

The AI Agent API is a comprehensive e-commerce management system powered by AI, designed to help store operators manage their online stores efficiently. The system consists of two main components:

1. **FastAPI Server** (Port 8000) - Main API gateway for client interactions
2. **MCP Server** (Port 8001) - AI tools server using Model Context Protocol

## Architecture

```
Client Application → FastAPI Server (8000) → AI Service → MCP Server (8001) → Imweb API
                        ↓                         ↓
                   Supabase Database ← Thread Storage
```

## Base URL

- **Production**: `https://api.sitetopping.com`
- **Development**: `http://localhost:8000`

## Authentication

All protected endpoints require JWT Bearer token authentication.

**Header Format:**

```
Authorization: Bearer <your_jwt_token>
```

**Authentication Flow:**

1. User authenticates through Supabase
2. JWT token is provided
3. Token is validated on each request

---

## API Endpoints

### Core System

#### Health Check

- **GET** `/health`
- **Description**: Check system health status
- **Authentication**: None
- **Response**:

```json
{
  "success": true,
  "data": {
    "database": {
      "connected": true,
      "latency": "12ms"
    },
    "playwright_mcp_client": "connected",
    "timestamp": "2024-01-01T10:00:00Z",
    "version": "1.0.0",
    "environment": "production"
  },
  "message": "헬스 체크 성공"
}
```

#### API Status

- **GET** `/api/v1/status`
- **Description**: Get API version and feature information
- **Authentication**: None
- **Response**:

```json
{
  "success": true,
  "data": {
    "api_version": "v1",
    "service": "imweb-ai-agent-server",
    "environment": "production",
    "features": {
      "dependency_injection": true,
      "exception_handling": true,
      "structured_logging": true
    }
  },
  "message": "API 상태 정상"
}
```

---

### Site Management

#### Get User Sites

- **GET** `/api/v1/sites`
- **Description**: Retrieve user's connected Imweb sites
- **Authentication**: Required
- **Response**:

```json
{
  "success": true,
  "data": [
    {
      "site_id": "site123",
      "domain": "mystore.imweb.me",
      "site_name": "My Store",
      "created_at": "2024-01-01T10:00:00Z"
    }
  ],
  "message": "사이트 목록 조회 성공"
}
```

#### Add Website

- **POST** `/api/v1/websites`
- **Description**: Add new website via domain
- **Authentication**: Required
- **Request Body**:

```json
{
  "domain": "mystore.imweb.me"
}
```

- **Response**:

```json
{
  "success": true,
  "data": {
    "site_id": "site123",
    "domain": "mystore.imweb.me",
    "status": "connected"
  },
  "message": "웹사이트 추가 성공"
}
```

#### Update Website

- **PATCH** `/api/v1/websites/{site_id}`
- **Description**: Update website information
- **Authentication**: Required
- **Parameters**:
  - `site_id` (path): Site identifier
- **Request Body**:

```json
{
  "site_name": "Updated Store Name"
}
```

#### Delete Website

- **DELETE** `/api/v1/websites/{site_id}`
- **Description**: Remove website from user account
- **Authentication**: Required
- **Parameters**:
  - `site_id` (path): Site identifier

---

### Script Management

#### Get Site Scripts

- **GET** `/sites/{site_code}/scripts`
- **Description**: Retrieve current scripts for a specific site
- **Authentication**: Required
- **Parameters**:
  - `site_code` (path): Site code identifier
- **Response**:

```json
{
  "success": true,
  "data": {
    "script": "<script>console.log('Hello World');</script>",
    "version": 1,
    "last_updated": "2024-01-01T10:00:00Z"
  },
  "message": "스크립트 조회 성공"
}
```

#### Deploy Scripts

- **POST** `/sites/{site_code}/scripts/deploy`
- **Description**: Deploy scripts to a specific site
- **Authentication**: Required
- **Parameters**:
  - `site_code` (path): Site code identifier
- **Request Body**:

```json
{
  "script": "<script>console.log('Updated script');</script>"
}
```

- **Response**:

```json
{
  "success": true,
  "data": {
    "deployed_at": "2024-01-01T10:00:00Z",
    "site_code": "site123",
    "script_version": 2,
    "deployed_scripts": {
      "script": "<script>console.log('Updated script');</script>"
    }
  },
  "message": "스크립트 배포 성공"
}
```

#### Get Public Script Module

- **GET** `/api/v1/sites/{site_code}/script`
- **Description**: Serve site scripts as JavaScript modules (public access)
- **Authentication**: None
- **Parameters**:
  - `site_code` (path): Site code identifier
- **Headers**:
  - `Content-Type: application/javascript`
  - `Cache-Control: public, max-age=300`
- **Response**: Raw JavaScript content

---

### Thread & Message Management

#### Create Thread

- **POST** `/api/v1/threads`
- **Description**: Create new chat thread for AI interactions
- **Authentication**: Required
- **Request Body**:

```json
{
  "siteId": "site123"
}
```

- **Response**:

```json
{
  "success": true,
  "data": {
    "id": "thread_456",
    "user_id": "user123",
    "site_code": "site123",
    "title": null,
    "created_at": "2024-01-01T10:00:00Z"
  },
  "message": "스레드 생성 성공"
}
```

#### Get Threads

- **GET** `/api/v1/threads`
- **Description**: Retrieve user's thread list
- **Authentication**: Required
- **Response**:

```json
{
  "success": true,
  "data": [
    {
      "id": "thread_456",
      "title": "Store Analytics Discussion",
      "site_code": "site123",
      "created_at": "2024-01-01T10:00:00Z",
      "last_message_at": "2024-01-01T11:30:00Z"
    }
  ],
  "message": "스레드 목록 조회 성공"
}
```

#### Update Thread Title

- **PUT** `/api/v1/threads/{thread_id}/title`
- **Description**: Update thread title
- **Authentication**: Required
- **Parameters**:
  - `thread_id` (path): Thread identifier
- **Request Body**:

```json
{
  "title": "New Thread Title"
}
```

#### Delete Thread

- **DELETE** `/api/v1/threads/{thread_id}`
- **Description**: Delete a thread and all its messages
- **Authentication**: Required
- **Parameters**:
  - `thread_id` (path): Thread identifier

#### Create Message

- **POST** `/api/v1/messages`
- **Description**: Create new message with AI processing support
- **Authentication**: Required
- **Request Body**:

```json
{
  "message": "How can I improve my store's conversion rate?",
  "thread_id": "thread_456",
  "message_type": "user",
  "image_data": ["base64_encoded_image_data"],
  "metadata": {
    "context": "analytics_review"
  }
}
```

- **Response**:

```json
{
  "success": true,
  "data": {
    "id": "msg_789",
    "thread_id": "thread_456",
    "message": "How can I improve my store's conversion rate?",
    "message_type": "user",
    "status": "pending",
    "created_at": "2024-01-01T10:00:00Z"
  },
  "message": "메시지 생성 성공"
}
```

#### Get Thread Messages

- **GET** `/api/v1/messages/{thread_id}`
- **Description**: Retrieve all messages in a thread
- **Authentication**: Required
- **Parameters**:
  - `thread_id` (path): Thread identifier
- **Response**:

```json
{
  "success": true,
  "data": [
    {
      "id": "msg_789",
      "message": "How can I improve my store's conversion rate?",
      "message_type": "user",
      "status": "completed",
      "created_at": "2024-01-01T10:00:00Z"
    },
    {
      "id": "msg_790",
      "message": "Here are some strategies to improve conversion...",
      "message_type": "assistant",
      "status": "completed",
      "created_at": "2024-01-01T10:01:00Z"
    }
  ],
  "message": "메시지 목록 조회 성공"
}
```

#### Update Message Status

- **PATCH** `/api/v1/messages/{message_id}/status`
- **Description**: Update message processing status
- **Authentication**: Required
- **Parameters**:
  - `message_id` (path): Message identifier
- **Request Body**:

```json
{
  "status": "completed",
  "message": "Updated message content",
  "metadata": {
    "processing_time": 1500
  }
}
```

---

### Real-time Communication (SSE)

#### Message Status Stream

- **GET** `/api/v1/threads/{thread_id}/messages/status-stream`
- **Description**: Real-time message status updates via Server-Sent Events
- **Authentication**: JWT token via query parameter or Bearer header
- **Parameters**:
  - `thread_id` (path): Thread identifier
  - `token` (query, optional): JWT token for authentication
- **Headers**:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
- **Response Format**:

```
data: {"type": "status_update", "message_id": "msg_789", "status": "in_progress"}

data: {"type": "heartbeat", "timestamp": "2024-01-01T10:00:00Z"}

data: {"type": "message_complete", "message_id": "msg_789", "content": "AI response"}
```

#### Get Message Status

- **GET** `/api/v1/messages/{message_id}/status`
- **Description**: Get current message status (polling alternative to SSE)
- **Authentication**: Required
- **Parameters**:
  - `message_id` (path): Message identifier

---

### Membership Management

#### Get Membership Information

- **GET** `/api/v1/membership`
- **Description**: Get user's membership details
- **Authentication**: Required
- **Response**:

```json
{
  "status": "success",
  "data": {
    "id": "membership_123",
    "user_id": "user123",
    "membership_level": 1,
    "expires_at": "2024-12-31T23:59:59Z",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "message": "멤버십 정보 조회 성공"
}
```

#### Get Membership Status

- **GET** `/api/v1/membership/status`
- **Description**: Get detailed membership status with expiry information
- **Authentication**: Required
- **Response**:

```json
{
  "status": "success",
  "data": {
    "level": 1,
    "expires_at": "2024-12-31T23:59:59Z",
    "is_expired": false,
    "days_remaining": 30
  },
  "message": "멤버십 상태 조회 성공"
}
```

#### Upgrade Membership

- **POST** `/api/v1/membership/upgrade`
- **Description**: Upgrade membership level
- **Authentication**: Required
- **Request Body**:

```json
{
  "target_level": 2,
  "duration_days": 30
}
```

#### Extend Membership

- **POST** `/api/v1/membership/extend`
- **Description**: Extend membership duration
- **Authentication**: Required
- **Request Body**:

```json
{
  "extend_days": 30
}
```

#### Check Permission Level

- **GET** `/api/v1/membership/check/{required_level}`
- **Description**: Check if user has required membership level
- **Authentication**: Required
- **Parameters**:
  - `required_level` (path): Required membership level (0, 1, 2)

#### Check Feature Access

- **GET** `/api/v1/membership/features/{feature_name}`
- **Description**: Check access to specific feature
- **Authentication**: Required
- **Parameters**:
  - `feature_name` (path): Feature name to check

#### Get Usage Limits

- **GET** `/api/v1/membership/limits`
- **Description**: Get membership limits and current usage
- **Authentication**: Required
- **Response**:

```json
{
  "status": "success",
  "data": {
    "daily_requests_limit": 100,
    "daily_requests_used": 25,
    "monthly_tokens_limit": 10000,
    "monthly_tokens_used": 2500
  },
  "message": "사용 한도 조회 성공"
}
```

#### Get Membership Configuration

- **GET** `/api/v1/membership/config`
- **Description**: Get membership configuration and usage statistics
- **Authentication**: Required

#### Get Model Pricing

- **GET** `/api/v1/membership/pricing/models`
- **Description**: Get AI model pricing information
- **Authentication**: None
- **Response**:

```json
{
  "status": "success",
  "data": {
    "models": [
      {
        "name": "gemini-1.5-flash",
        "input_price_per_1k_tokens": 0.001,
        "output_price_per_1k_tokens": 0.002
      }
    ]
  },
  "message": "모델 가격 정보 조회 성공"
}
```

#### Estimate Costs

- **POST** `/api/v1/membership/pricing/estimate`
- **Description**: Estimate costs based on token usage
- **Authentication**: Required
- **Request Body**:

```json
{
  "input_tokens": 1000,
  "output_tokens": 500,
  "model_name": "gemini-1.5-flash"
}
```

#### Get Usage Statistics

- **GET** `/api/v1/membership/usage/models`
- **Description**: Get user's AI model usage statistics
- **Authentication**: Required
- **Query Parameters**:
  - `days` (optional): Number of days to look back (default: 30)

#### Admin Cleanup

- **POST** `/api/v1/membership/admin/cleanup`
- **Description**: Batch cleanup of expired memberships (Admin only)
- **Authentication**: Required (Admin permissions)

---

## MCP Server Tools

The MCP (Model Context Protocol) Server provides specialized AI tools for website analysis and automation.

### Session Management

#### Set Session Token

- **Function**: `set_session_token`
- **Parameters**:
  - `session_id`: String - Session identifier
  - `user_id`: String - User identifier
  - `site`: Object - Site information with `{site_name, site_code, domain}`
- **Returns**: Success/error message

#### Get Site Information

- **Function**: `site_info`
- **Parameters**:
  - `session_id`: String - Session identifier
- **Returns**: Site information dictionary or error message

### Website Analysis

#### Get HTML Structure

- **Function**: `get_site_html_structure`
- **Parameters**:
  - `url`: String - Website URL to analyze
- **Returns**:

```json
{
  "success": true,
  "structure": {
    "div.header": {
      "h1.title": "Store Name",
      "nav.menu": ["Home", "Products", "Contact"]
    },
    "main.content": {
      "div.product-list": [
        {
          "div.product": {
            "img.product-image": "product1.jpg",
            "h3.product-title": "Product Name",
            "span.price": "$99.99"
          }
        }
      ]
    }
  }
}
```

#### Execute Console Commands

- **Function**: `execute_console_log`
- **Parameters**:
  - `url`: String - Website URL
  - `console_command`: String - JavaScript command to execute
- **Returns**:

```json
{
  "success": true,
  "result": "Command execution result",
  "console_logs": ["log1", "log2"],
  "error": null
}
```

### Screenshot Capture

#### Viewport Screenshot

- **Function**: `capture_screenshot`
- **Parameters**:
  - `url`: String - Website URL
  - `width`: Integer - Viewport width (default: 1280)
  - `height`: Integer - Viewport height (default: 720)
  - `wait_seconds`: Integer - Wait time before capture (default: 2)
- **Returns**:

```json
{
  "success": true,
  "screenshot": "base64_encoded_jpeg_image",
  "timestamp": "2024-01-01T10:00:00Z",
  "original_size": "1280x720",
  "optimized_size": 89456
}
```

#### Full Page Screenshot

- **Function**: `capture_fullpage_screenshot`
- **Parameters**:
  - `url`: String - Website URL
  - `width`: Integer - Viewport width (default: 1280)
  - `wait_seconds`: Integer - Wait time before capture (default: 2)
- **Returns**: Same format as viewport screenshot

#### Element Screenshot

- **Function**: `capture_element_screenshot`
- **Parameters**:
  - `url`: String - Website URL
  - `selector`: String - CSS selector for target element
  - `width`: Integer - Viewport width (default: 1280)
  - `height`: Integer - Viewport height (default: 720)
  - `wait_seconds`: Integer - Wait time before capture (default: 2)
- **Returns**: Same format as viewport screenshot

---

## Data Models

### Core Models

#### ChatMessage

```typescript
interface ChatMessage {
  id: string;
  thread_id: string;
  user_id: string;
  message: string;
  message_type: "user" | "assistant" | "system";
  status: "pending" | "in_progress" | "completed" | "error";
  metadata?: Record<string, any>;
  image_data?: string[];
  created_at: string;
}
```

#### ChatThread

```typescript
interface ChatThread {
  id: string;
  user_id: string;
  site_code?: string;
  title?: string;
  created_at: string;
  updated_at: string;
  last_message_at?: string;
}
```

#### UserMembership

```typescript
interface UserMembership {
  id: string;
  user_id: string;
  membership_level: 0 | 1 | 2; // 0: Basic, 1: Premium, 2: Pro
  expires_at?: string;
  created_at: string;
  updated_at: string;
}
```

#### ScriptContent

```typescript
interface ScriptContent {
  content?: string;
  description?: string;
}
```

### Response Models

#### Standard API Response

```typescript
interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  error_code?: string;
}
```

#### Message Status Types

```typescript
type MessageStatus = "pending" | "in_progress" | "completed" | "error";
type MessageType = "user" | "assistant" | "system";
type MembershipLevel = 0 | 1 | 2;
```

---

## Error Handling

### HTTP Status Codes

- **200**: Success
- **201**: Created
- **400**: Bad Request
- **401**: Unauthorized
- **403**: Forbidden
- **404**: Not Found
- **422**: Validation Error
- **429**: Rate Limited
- **500**: Internal Server Error

### Error Response Format

```json
{
  "success": false,
  "message": "Error description",
  "error_code": "SPECIFIC_ERROR_CODE",
  "data": {
    "details": "Additional error details"
  }
}
```

### Common Error Codes

- `AUTH_FAILED`: Authentication failure
- `INVALID_TOKEN`: Invalid or expired token
- `PERMISSION_DENIED`: Insufficient permissions
- `VALIDATION_ERROR`: Request validation failed
- `RESOURCE_NOT_FOUND`: Requested resource not found
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `MEMBERSHIP_REQUIRED`: Higher membership level required
- `MCP_CONNECTION_FAILED`: MCP server connection failed

---

## Rate Limiting

Rate limiting is implemented per user and membership level:

- **Basic (Level 0)**: 50 requests per hour
- **Premium (Level 1)**: 200 requests per hour
- **Pro (Level 2)**: 1000 requests per hour

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 200
X-RateLimit-Remaining: 150
X-RateLimit-Reset: 1640995200
```

---

## CORS Configuration

The API supports cross-origin requests with the following configuration:

- **Allowed Origins**: All (`*`) in development, specific domains in production
- **Allowed Methods**: All HTTP methods
- **Allowed Headers**: All headers
- **Credentials**: Supported for authenticated requests

---

## Webhooks & Events

### SSE Event Types

#### Message Status Updates

```json
{
  "type": "status_update",
  "message_id": "msg_789",
  "status": "in_progress",
  "timestamp": "2024-01-01T10:00:00Z"
}
```

#### Heartbeat

```json
{
  "type": "heartbeat",
  "timestamp": "2024-01-01T10:00:00Z"
}
```

#### Message Complete

```json
{
  "type": "message_complete", 
  "message_id": "msg_789",
  "content": "AI response content",
  "timestamp": "2024-01-01T10:00:00Z"
}
```

---

## SDK & Integration

### JavaScript/TypeScript Example

```typescript
// Initialize API client
const apiClient = new ImwebAIClient({
  baseUrl: 'https://api.your-domain.com',
  token: 'your_jwt_token'
});

// Create a thread
const thread = await apiClient.threads.create({
  siteId: 'site123'
});

// Send a message
const message = await apiClient.messages.create({
  thread_id: thread.id,
  message: 'How can I improve my store?',
  message_type: 'user'
});

// Listen to real-time updates
const eventSource = apiClient.threads.streamStatus(thread.id);
eventSource.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  console.log('Status update:', data);
});
```

### Python Example

```python
import requests
from typing import Optional

class ImwebAIClient:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
  
    def create_thread(self, site_id: str) -> dict:
        response = requests.post(
            f'{self.base_url}/api/v1/threads',
            json={'siteId': site_id},
            headers=self.headers
        )
        return response.json()
  
    def send_message(self, thread_id: str, message: str, 
                    image_data: Optional[list] = None) -> dict:
        payload = {
            'message': message,
            'thread_id': thread_id,
            'message_type': 'user'
        }
        if image_data:
            payload['image_data'] = image_data
          
        response = requests.post(
            f'{self.base_url}/api/v1/messages',
            json=payload,
            headers=self.headers
        )
        return response.json()
```

---

## Performance & Optimization

### Caching Strategy

- **Script Modules**: 5-minute public cache
- **Static Assets**: Long-term caching with versioning
- **API Responses**: No cache for dynamic content
- **Database Queries**: Connection pooling and query optimization

### Image Optimization

- **Screenshots**: Automatic JPEG compression (target: 150-200KB)
- **User Images**: Progressive JPEG with quality optimization
- **Format Conversion**: PNG → JPEG for better compression

### Connection Management

- **Database**: Connection pooling with configurable limits
- **MCP Server**: Persistent connections with health checks
- **SSE**: Automatic cleanup of inactive connections
- **Browser**: Shared Playwright instances for efficiency

---

## Security

### Authentication Security

- **JWT Tokens**: RS256 signing with key rotation
- **Token Expiry**: Configurable expiration times
- **Refresh Tokens**: Secure token refresh mechanism
- **Session Management**: Server-side session validation

### Data Protection

- **Input Validation**: Pydantic schemas for all inputs
- **SQL Injection**: Parameterized queries only
- **XSS Prevention**: Content sanitization
- **CSRF Protection**: Same-site cookie policies

### API Security

- **HTTPS Only**: TLS 1.3 in production
- **Rate Limiting**: Per-user request limits
- **CORS Policy**: Restricted origins in production
- **Request Size Limits**: Maximum payload size enforcement

---

## Monitoring & Logging

### Logging Levels

- **DEBUG**: Detailed debugging information
- **INFO**: General operational messages
- **WARNING**: Warning conditions
- **ERROR**: Error conditions requiring attention

### Metrics & Monitoring

- **Request Metrics**: Response times, status codes, endpoints
- **System Metrics**: CPU, memory, database connections
- **Business Metrics**: User activity, feature usage, costs
- **Error Tracking**: Exception monitoring and alerting

### Health Checks

- **Database Connectivity**: Connection status and latency
- **MCP Server Status**: Tool availability and response times
- **External Services**: Imweb API, Supabase, Gemini AI status
- **System Resources**: Memory usage, disk space, CPU load

---

## Deployment & Infrastructure

### Environment Configuration

- **Development**: Local setup with hot reload
- **Staging**: Production-like environment for testing
- **Production**: Optimized for performance and reliability

### Docker Configuration

- **Multi-container Setup**: FastAPI + MCP Server + Database
- **Health Checks**: Container health monitoring
- **Resource Limits**: Memory and CPU constraints
- **Networking**: Internal container communication

### Environment Variables

```bash
# Database
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI Service  
GEMINI_API_KEY=your_gemini_api_key

# Server Configuration
HOST=0.0.0.0
PORT=8000
DEBUG=false
LOG_LEVEL=INFO
MCP_SERVER_URL=http://localhost:8001

# Security
JWT_SECRET_KEY=your_jwt_secret
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440
```

---

This documentation provides a complete reference for integrating with the Imweb AI Agent API. For additional support or questions, please refer to the source code or contact the development team.
