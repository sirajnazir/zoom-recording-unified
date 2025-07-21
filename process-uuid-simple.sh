#!/bin/bash

# Simple script to process a specific UUID
UUID="43sNl0IVTvy3Xnp5+ydCog=="
echo "🎯 Processing UUID: $UUID"
echo "=================================================================================="

# Run the batch processor with a filter for this specific recording
echo "Running batch processor for December 2023..."
node process-zoom-batch.js --from "2023-12-28" --to "2023-12-29" --force

echo ""
echo "✅ Processing complete!"
echo ""
echo "📋 Check the following:"
echo "1. Google Drive for folder containing:"
echo "   - Audio file (jenny-minseo-*.m4a)"
echo "   - Timeline JSON"
echo "   - Summary JSON"
echo "   - AI Insights document"
echo ""
echo "2. Google Sheets 'Zoom API' tabs for the recording entry"
echo ""
echo "3. Search for 'Jenny' and 'Minseo' in the standardized name"