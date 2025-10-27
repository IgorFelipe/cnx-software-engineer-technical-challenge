# ADICIONE ao README - Script de descoberta
# probe-rate-limit.sh
#!/bin/bash
echo "Discovering rate limit..."
for i in {1..100}; do
  echo "Request $i:"
  curl -v -X POST "https://email-test-api-475816.ue.r.appspot.com/send-email" \
    -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbnhfdGVzdCIsImV4cCI6MTc2MTEwMTUyOH0.SvegQzD8PQ_FV9etBlBYGVnsthUjUV08FBdaBkU883A" \
    -H "Content-Type: application/json" \
    -d '{"to":"test@test.com","subject":"test","body":"test"}' \
    2>&1 | grep -E "(X-RateLimit|429)"
  sleep 0.5
done