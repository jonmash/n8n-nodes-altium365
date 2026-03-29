#!/bin/bash

set -e  # Exit on error

echo "🚀 Update and Test n8n Plugin"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Get directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run update script
echo "📦 Step 1: Updating plugin..."
"$SCRIPT_DIR/update-n8n-plugin.sh"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "⏳ Waiting 10 seconds for n8n to fully restart..."
sleep 10

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📋 Step 2: Recent logs (last 50 lines)..."
"$SCRIPT_DIR/view-n8n-logs.sh" 50

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🎯 Now test your workflow in n8n and run:"
echo "   ./view-n8n-logs.sh 100 altium"
echo ""
echo "   Or watch logs live:"
echo "   docker logs -f \$(docker ps --filter 'name=n8n' -q | head -n1)"
