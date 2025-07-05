require('dotenv').config();
const { google } = require('googleapis');
const config = require('../../config');

console.log('Testing Google Authentication...\n');

// Debug credentials
console.log('Client Email:', config.google.clientEmail);
console.log('Has Private Key:', !!config.google.privateKey);
console.log('Private Key starts with:', config.google.privateKey?.substring(0, 50) + '...');

// Test creating auth client
try {
  const auth = new google.auth.JWT(
    config.google.clientEmail,
    null,
    config.google.privateKey,
    ['https://www.googleapis.com/auth/drive']
  );

  console.log('\n✅ Created JWT client successfully');

  // Test authentication
  auth.authorize((err, tokens) => {
    if (err) {
      console.error('\n❌ Authentication failed:', err.message);
      console.error('Error details:', err);
      
      // Try with properly formatted private key
      console.log('\nTrying with reformatted private key...');
      const reformattedKey = config.google.privateKey.replace(/\\n/g, '\n');
      
      const auth2 = new google.auth.JWT(
        config.google.clientEmail,
        null,
        reformattedKey,
        ['https://www.googleapis.com/auth/drive']
      );
      
      auth2.authorize((err2, tokens2) => {
        if (err2) {
          console.error('❌ Still failed:', err2.message);
        } else {
          console.log('✅ Authentication successful with reformatted key!');
          console.log('Access token received:', !!tokens2.access_token);
        }
      });
    } else {
      console.log('\n✅ Authentication successful!');
      console.log('Access token received:', !!tokens.access_token);
    }
  });

} catch (error) {
  console.error('\n❌ Failed to create auth client:', error.message);
}