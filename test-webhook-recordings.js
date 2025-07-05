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
}

// Run the test
testWebhookRecordings().catch(console.error);