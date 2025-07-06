#!/bin/bash
# Test script for reprocessing Aditi's recording

echo "🔄 Testing Reprocess Script with Aditi's Recording"
echo "================================================"
echo ""
echo "Recording ID: 4762651206"
echo "Topic: Aditi Bhaskar's Personal Meeting Room"
echo "Expected Issues:"
echo "  - Zoom API duration: 658 seconds (11 minutes)"
echo "  - Actual duration: ~4300 seconds (72 minutes)"
echo "  - Should be categorized as MISC, not TRIVIAL"
echo ""

# First, do a dry run to see what will happen
echo "📋 Step 1: Dry run (download only, no processing)"
echo "-------------------------------------------------"
node download-and-reprocess-zoom-recording.js 4762651206 --dry-run

echo ""
echo "📋 Step 2: Full reprocessing (if dry run looks good)"
echo "----------------------------------------------------"
echo "Press Enter to continue with full reprocessing, or Ctrl+C to cancel..."
read

# Full reprocessing
node download-and-reprocess-zoom-recording.js 4762651206

echo ""
echo "✅ Test completed! Check the output above for:"
echo "  - Correct duration calculation"
echo "  - Proper categorization (MISC not TRIVIAL)"
echo "  - Successful Google Drive upload"
echo "  - Google Sheets update"