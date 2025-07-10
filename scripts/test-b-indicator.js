#!/usr/bin/env node

const { CompleteSmartNameStandardizer } = require('../src/infrastructure/services/CompleteSmartNameStandardizer');

// Create an instance
const standardizer = new CompleteSmartNameStandardizer();

// Test the buildStandardizedFolderName method with dataSource
const testData = {
    coach: 'Jenny',
    student: 'Arshiya',
    weekNumber: '16',
    sessionType: 'Coaching',
    date: '2025-01-07',
    meetingId: '12345',
    uuid: 'abc-123',
    topic: 'Test Session',
    dataSource: 'google-drive'
};

console.log('Testing CompleteSmartNameStandardizer with Google Drive data source:');
console.log('Input:', JSON.stringify(testData, null, 2));

const standardizedName = standardizer.buildStandardizedFolderName(testData);
console.log('\nStandardized Name:', standardizedName);
console.log('Contains _B_ indicator:', standardizedName.includes('_B_') ? '✅ YES' : '❌ NO');