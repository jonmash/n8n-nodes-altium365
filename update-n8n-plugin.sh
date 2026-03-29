#!/bin/bash

set -e  # Exit on error

echo "🔍 Finding n8n Docker container..."

# Find n8n container ID
CONTAINER_ID=$(docker ps --filter "ancestor=n8nio/n8n" --format "{{.ID}}" | head -n 1)

if [ -z "$CONTAINER_ID" ]; then
    # Try alternative search by name
    CONTAINER_ID=$(docker ps --filter "name=n8n" --format "{{.ID}}" | head -n 1)
fi

if [ -z "$CONTAINER_ID" ]; then
    echo "❌ Error: Could not find running n8n Docker container"
    echo "💡 Make sure n8n is running with: docker ps"
    exit 1
fi

CONTAINER_NAME=$(docker ps --filter "id=$CONTAINER_ID" --format "{{.Names}}")
echo "✅ Found n8n container: $CONTAINER_NAME ($CONTAINER_ID)"

echo ""
echo "📦 Updating @jonmash/n8n-nodes-altium365..."

# Update the npm package inside the container
docker exec -it "$CONTAINER_ID" sh -c "cd /home/node/.n8n/nodes && npm update @jonmash/n8n-nodes-altium365"

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to update npm package"
    exit 1
fi

echo "✅ Package updated successfully"

echo ""
echo "🔄 Restarting n8n container..."

# Restart the container
docker restart "$CONTAINER_ID"

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to restart container"
    exit 1
fi

echo "✅ Container restarted successfully"

echo ""
echo "⏳ Waiting for n8n to be ready..."
sleep 5

echo ""
echo "🎉 Done! n8n should be ready at your usual URL"
echo "📝 Check the version with: docker exec $CONTAINER_ID npm list @jonmash/n8n-nodes-altium365"
