#!/bin/bash

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Finding n8n Docker container...${NC}"

# Find n8n container ID
CONTAINER_ID=$(docker ps --filter "ancestor=n8nio/n8n" --format "{{.ID}}" | head -n 1)

if [ -z "$CONTAINER_ID" ]; then
    # Try alternative search by name
    CONTAINER_ID=$(docker ps --filter "name=n8n" --format "{{.ID}}" | head -n 1)
fi

if [ -z "$CONTAINER_ID" ]; then
    echo -e "${RED}❌ Error: Could not find running n8n Docker container${NC}"
    echo "💡 Make sure n8n is running with: docker ps"
    exit 1
fi

CONTAINER_NAME=$(docker ps --filter "id=$CONTAINER_ID" --format "{{.Names}}")
echo -e "${GREEN}✅ Found n8n container: $CONTAINER_NAME ($CONTAINER_ID)${NC}"
echo ""

# Default number of lines
LINES=${1:-100}

# Check if filtering for Altium365 logs
if [ "$2" == "altium" ] || [ "$2" == "plugin" ]; then
    echo -e "${YELLOW}📋 Filtering for [Altium365] logs (last $LINES lines):${NC}"
    echo "────────────────────────────────────────────────────────────────"
    docker logs --tail "$LINES" "$CONTAINER_ID" 2>&1 | grep -i "\[Altium365\]" || echo "No [Altium365] logs found in last $LINES lines"
else
    echo -e "${YELLOW}📋 Showing last $LINES lines of n8n logs:${NC}"
    echo "────────────────────────────────────────────────────────────────"
    docker logs --tail "$LINES" "$CONTAINER_ID" 2>&1
fi

echo ""
echo "────────────────────────────────────────────────────────────────"
echo ""
echo -e "${BLUE}💡 Usage tips:${NC}"
echo "  ./view-n8n-logs.sh              # Show last 100 lines (default)"
echo "  ./view-n8n-logs.sh 200          # Show last 200 lines"
echo "  ./view-n8n-logs.sh 100 altium   # Show only [Altium365] logs"
echo "  ./view-n8n-logs.sh 500 altium   # Show last 500 lines, filtered for plugin"
echo ""
echo -e "${BLUE}📡 To follow logs in real-time:${NC}"
echo "  docker logs -f $CONTAINER_ID"
echo ""
echo -e "${BLUE}📁 To save logs to a file:${NC}"
echo "  docker logs --tail 1000 $CONTAINER_ID > n8n-logs.txt 2>&1"
