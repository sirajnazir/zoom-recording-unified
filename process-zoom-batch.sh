#!/bin/bash

# Start from recording 223 (Katie Round 1 Interview)
START_UUID="vnWkXiYoQdyMW9dwB0PUAQ=="

echo "🚀 Processing Zoom recordings starting from UUID: $START_UUID"
echo "📊 This will process recordings 226-329 (Katie's recording onwards)"
echo ""

# Process the specific recordings we know need processing
# Starting with Katie's recording (226) which we know was already processed successfully
# So we'll start with recording 227

# Recording 227: Omar Siraj: 1:1 Coach Call
echo "🔄 Processing Recording 227: Omar Siraj: 1:1 Coach Call"
node complete-production-processor.js --mode=single --recording="4iBmeFlaQei6JJwpNpfU5w==" --auto-approve --parallel-downloads=true --download-concurrency=8

sleep 2

# Recording 228: Siraj IvyLevel Planning Meeting
echo "🔄 Processing Recording 228: Siraj IvyLevel Planning Meeting"
node complete-production-processor.js --mode=single --recording="nI3T3MqCR2a1a7K4XOiAdA==" --auto-approve --parallel-downloads=true --download-concurrency=8

sleep 2

# Recording 229: Daivya - Daivya weekly check in
echo "🔄 Processing Recording 229: Daivya weekly check in"
node complete-production-processor.js --mode=single --recording="oPH0K72RRgKiZ6VrBaZMHg==" --auto-approve --parallel-downloads=true --download-concurrency=8

echo ""
echo "✅ Batch processing complete!"
echo "📊 Check Google Sheets for results"