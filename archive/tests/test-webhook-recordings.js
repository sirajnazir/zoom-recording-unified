/**
 * Test script to debug webhook recording issues
 */

const { CompleteSmartNameStandardizer } = require('./src/infrastructure/services/CompleteSmartNameStandardizer');
const { RecordingCategorizer } = require('./src/utils/RecordingCategorizer');
const config = require('./config');

async function testWebhookRecordings() {
  console.log('🧪 Testing Webhook Recording Name Standardization\n');
  
  const nameStandardizer = new CompleteSmartNameStandardizer({ logger: console });
  const categorizer = new RecordingCategorizer(console);
  
  // Test Recording 1: Jamie JudahBram's Personal Meeting Room
  console.log('1️⃣ Testing: Jamie JudahBram\'s Personal Meeting Room');
  const recording1 = {
    uuid: 'SsXeFZHsSCe99P1kAbOz5Q==',
    id: '8390038905',
    meeting_id: '8390038905',
    topic: "Jamie JudahBram's Personal Meeting Room",
    start_time: '2025-07-04T02:00:13Z',
    duration: 4291, // 71.5 minutes
    host_email: 'jamie@ivymentors.co',
    host_name: 'Jamie',
    participant_count: 2
  };
  
  const result1 = await nameStandardizer.standardizeName(recording1.topic, {
    duration: recording1.duration,
    uuid: recording1.uuid,
    id: recording1.id,
    meeting_id: recording1.meeting_id,
    start_time: recording1.start_time,
    host_email: recording1.host_email,
    participants: ['Jamie', 'JudahBram']
  });
  
  console.log('Result:', result1);
  console.log('  Standardized:', result1.standardizedName);
  console.log('  Coach:', result1.components?.coach);
  console.log('  Student:', result1.components?.student);
  console.log('  Session Type:', result1.components?.sessionType);
  console.log('  Week:', result1.components?.week);
  console.log('  Duration:', recording1.duration, 'seconds =', (recording1.duration/60).toFixed(1), 'minutes');
  
  // Test categorization directly
  const category1 = categorizer.categorize(result1.components, recording1);
  console.log('  Category:', category1);
  
  // Test Recording 2: Hiba | IvyLevel Week 4
  console.log('\n2️⃣ Testing: Hiba | IvyLevel Week 4');
  const recording2 = {
    uuid: 'mOjpJueTSx6FAMuHis3GxQ==',
    id: '3242527137',
    meeting_id: '3242527137',
    topic: 'Hiba | IvyLevel Week 4',
    start_time: '2025-07-04T23:29:44Z',
    duration: 3886, // 64.8 minutes
    host_email: 'noor@ivymentors.co',
    host_name: 'Noor',
    participant_count: 2
  };
  
  const result2 = await nameStandardizer.standardizeName(recording2.topic, {
    duration: recording2.duration,
    uuid: recording2.uuid,
    id: recording2.id,
    meeting_id: recording2.meeting_id,
    start_time: recording2.start_time,
    host_email: recording2.host_email,
    participants: ['Noor', 'Hiba']
  });
  
  console.log('Result:', result2);
  console.log('  Standardized:', result2.standardizedName);
  console.log('  Coach:', result2.components?.coach);
  console.log('  Student:', result2.components?.student);
  console.log('  Session Type:', result2.components?.sessionType);
  console.log('  Week:', result2.components?.week);
  console.log('  Duration:', recording2.duration, 'seconds =', (recording2.duration/60).toFixed(1), 'minutes');
  
  // Test categorization directly
  const category2 = categorizer.categorize(result2.components, recording2);
  console.log('  Category:', category2);
  
  // Debug categorization logic
  console.log('\n🔍 Debug Categorization Logic:');
  console.log('  TRIVIAL threshold:', 15 * 60, 'seconds (15 minutes)');
  console.log('  Recording 1 duration:', recording1.duration, '>', 15 * 60, '?', recording1.duration > 15 * 60);
  console.log('  Recording 2 duration:', recording2.duration, '>', 15 * 60, '?', recording2.duration > 15 * 60);
  
  // Test Recording 3: Aditi's Recording
  console.log('\n3️⃣ Testing: Aditi Bhaskar\'s Personal Meeting Room');
  const recording3 = {
    uuid: 'pP9T6kSQTjSLiMnQT9h7dA==',
    id: '4762651206',
    meeting_id: '4762651206',
    topic: 'Aditi Bhaskar\'s Personal Meeting Room',
    start_time: '2025-07-05T23:48:16Z',
    duration: 658, // 10.97 minutes - under 15 minutes
    host_email: 'aditi@ivymentors.co',
    host_name: 'Aditi Bhaskar',
    participant_count: 1,
    total_size: 3549859 // 3.5MB - under 5MB threshold
  };
  
  const result3 = await nameStandardizer.standardizeName(recording3.topic, {
    duration: recording3.duration,
    uuid: recording3.uuid,
    id: recording3.id,
    meeting_id: recording3.meeting_id,
    start_time: recording3.start_time,
    host_email: recording3.host_email,
    participants: ['Aditi Bhaskar']
  });
  
  console.log('Result:', result3);
  console.log('  Standardized:', result3.standardizedName);
  console.log('  Coach:', result3.components?.coach);
  console.log('  Student:', result3.components?.student);
  console.log('  Session Type:', result3.components?.sessionType);
  console.log('  Week:', result3.components?.week);
  console.log('  Duration:', recording3.duration, 'seconds =', (recording3.duration/60).toFixed(1), 'minutes');
  console.log('  File Size:', recording3.total_size, 'bytes =', (recording3.total_size/1024/1024).toFixed(1), 'MB');
  
  // Test categorization directly
  const category3 = categorizer.categorize(result3.components, recording3);
  console.log('  Category:', category3);
}

// Run the test
testWebhookRecordings().catch(console.error);