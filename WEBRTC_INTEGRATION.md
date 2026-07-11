# WebRTC Integration Guide

## Integration Steps

### 1. Add CallManager Initialization to `server.js`

```javascript
import { initializeCallManager } from './src/services/CallManager.js';
import { setupCallSignaling } from './src/websocket/callSignaling.js';
import { createServer } from 'http';
import { Server as IOServer } from 'socket.io';

// Initialize Redis client (you already have this)
const redis = createClient({ ... });

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO
const io = new IOServer(httpServer, {
  cors: { origin: process.env.CLIENT_URL },
  transports: ['websocket', 'polling'],
});

// Initialize Call Manager
initializeCallManager(redis);

// Setup WebSocket signaling
setupCallSignaling(io);

// Replace app.listen() with:
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
```

### 2. Register Routes in `server.js`

```javascript
import callRoutes from './src/routes/calls.js';

// Add this after other routes
app.use('/api/calls', callRoutes);
```

### 3. Environment Variables

Add to `.env`:

```
# WebRTC
STUN_SERVERS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
TURN_SERVER=turn:your-turn-server.com
TURN_USERNAME=username
TURN_PASSWORD=password
ICE_TIMEOUT=30000
```

### 4. Test the Endpoints

```bash
# 1. Initiate a call
curl -X POST http://localhost:5000/api/calls/initiate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"receiverId":"user123","callType":"video"}'

# Response:
# {
#   "success": true,
#   "call": {
#     "callId": "uuid",
#     "status": "pending",
#     "callerId": "...",
#     "receiverId": "..."
#   }
# }

# 2. Answer a call
curl -X POST http://localhost:5000/api/calls/CALL_ID/answer \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Send SDP
curl -X POST http://localhost:5000/api/calls/CALL_ID/sdp \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "offer",
    "sdp": "{... SDP content ...}"
  }'
```

## Socket Events

### From Frontend:

```javascript
socket.emit('user:register', userId);
socket.emit('call:incoming', { callId, callerId, receiverId, callType });
socket.emit('call:answered', { callId, receiverId, callerId });
socket.emit('call:rejected', { callId, receiverId, callerId, reason });
socket.emit('sdp:offer', { callId, callerId, receiverId, offer });
socket.emit('sdp:answer', { callId, receiverId, callerId, answer });
socket.emit('ice:candidate', { callId, fromUserId, toUserId, candidate });
socket.emit('call:ended', { callId, userId, otherUserId });
```

### From Backend:

```javascript
socket.on('call:incoming', (data) => { ... });
socket.on('call:answered', (data) => { ... });
socket.on('call:rejected', (data) => { ... });
socket.on('sdp:offer', (data) => { ... });
socket.on('sdp:answer', (data) => { ... });
socket.on('ice:candidate', (data) => { ... });
socket.on('call:ended', (data) => { ... });
```

## Database Schema (Redis)

```
call:{callId}
  - callId: string
  - callerId: string
  - receiverId: string
  - callType: string (audio/video)
  - status: string (pending/connecting/active/ended)
  - sdpOffer: string (SDP)
  - sdpAnswer: string (SDP)
  - iceCandidates: object
  - createdAt: timestamp
  - answeredAt: timestamp
  - endedAt: timestamp

calls:pending:{userId}
  - List of pending call IDs
```

## Call Flow Diagram

```
Caller                              Receiver
  |                                    |
  |--1. POST /api/calls/initiate----->|
  |                                    |
  |--2. emit 'call:incoming'--------->| (WebSocket)
  |    (ring notification)             |
  |                                    |
  |                          [User accepts]
  |                                    |
  |<--3. emit 'call:answered'---------|
  |                                    |
  |--4. emit 'sdp:offer'------------->| (WebSocket)
  |    (WebRTC offer)                  |
  |                                    |
  |<--5. emit 'sdp:answer'------------|
  |     (WebRTC answer)                |
  |                                    |
  |<-->6. emit 'ice:candidate'<------->| (Both ways)
  |                                    |
  |     [WebRTC connection established]|
  |      <===== Audio/Video Stream ====>
  |                                    |
  |--7. POST /api/calls/:id/end------->|
  |                                    |
```

## Error Handling

All errors should follow this format:

```json
{
  "error": "Error message",
  "callId": "uuid",
  "code": "SPECIFIC_ERROR_CODE"
}
```

## Performance Notes

- In-memory `Map` for fast access (<1ms)
- Redis for persistence and clustering
- ICE candidates are optimized (minimal logging)
- Automatic cleanup every 30 minutes
- Call expiry: 1 hour

## STUN/TURN Setup (Optional)

For better connectivity in restrictive networks:

1. **Free STUN (Google)** - Already configured
2. **Self-hosted TURN** - Use coturn or similar
3. **Commercial TURN** - Twilio, AWS etc.

```javascript
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: 'turn:your-turn-server.com',
    username: 'user',
    credential: 'pass',
  },
];
```

## Next Steps

1. Update your `server.js` with CallManager integration
2. Test with the provided cURL commands
3. Integrate frontend WebRTC client
4. Add call history logging to database
