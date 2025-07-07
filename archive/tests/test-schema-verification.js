const { DualTabGoogleSheetsService } = require('./src/infrastructure/services/DualTabGoogleSheetsService');
const { SmartServicesInitializer } = require('./src/infrastructure/helpers/SmartServicesInitializer');
const { Logger } = require('./src/shared/Logger');
const config = require('./src/shared/config/smart-config');

async function testSchemaVerification() {
    console.log('🔍 Testing Google Sheets Schema Verification');
    console.log('===========================================');
    
    try {
        // Initialize services
        const initializer = new SmartServicesInitializer(config);
        const services = await initializer.initializeServices();
        
        const sheetsService = services.sheetsService;
        
        // Test 1: Check column schema
        console.log('\n📋 Test 1: Column Schema Verification');
        console.log('--------------------------------------');
        
        const columns = sheetsService.tabs.standardized.columns;
        console.log('Total columns defined:', Object.keys(columns).length);
        
        // Check if driveLink is in schema
        if (columns.driveLink) {
            console.log('✅ driveLink column found:', columns.driveLink);
        } else {
            console.log('❌ driveLink column missing from schema');
        }
        
        // Check column positions
        const driveFolderIndex = Object.values(columns).indexOf('AQ');
        const driveLinkColumnIndex = Object.values(columns).indexOf('AY');
        
        console.log('driveFolder column position:', driveFolderIndex >= 0 ? driveFolderIndex : 'Not found');
        console.log('driveLink column position:', driveLinkColumnIndex >= 0 ? driveLinkColumnIndex : 'Not found');
        
        // Test 2: Check row data preparation
        console.log('\n📊 Test 2: Row Data Preparation');
        console.log('--------------------------------');
        
        // Create mock data
        const mockSmartData = {
            uuid: 'test-uuid-123',
            fingerprint: 'test-fingerprint',
            recordingDate: '2025-01-01',
            rawName: 'Test Recording',
            standardizedName: 'Test_Recording_Wk1_2025-01-01',
            nameConfidence: 80,
            nameResolutionMethod: 'test',
            familyAccount: false,
            weekNumber: 1,
            weekConfidence: 90,
            weekInferenceMethod: 'test',
            hostEmail: 'test@example.com',
            hostName: 'Test Coach',
            meetingTopic: 'Test Meeting',
            participants: ['Coach', 'Student'],
            participantCount: 2,
            meetingId: '123456789',
            duration: 60,
            startTime: '2025-01-01T10:00:00Z',
            endTime: '2025-01-01T11:00:00Z',
            recordingType: 'cloud_recording',
            fileSize: 100,
            hasTranscript: true,
            transcriptQuality: 'Good',
            speakerCount: 2,
            primarySpeaker: 'Coach',
            speakingTimeDistribution: {},
            emotionalJourney: [],
            engagementScore: 85,
            keyMoments: [],
            coachingTopics: ['Test Topic'],
            coachingStyle: 'Supportive',
            studentResponsePattern: 'Engaged',
            interactionQuality: 90,
            keyThemes: ['Theme 1'],
            actionItems: ['Action 1'],
            challengesIdentified: ['Challenge 1'],
            breakthroughs: ['Breakthrough 1'],
            goalsSet: ['Goal 1'],
            progressTracked: 'Good progress',
            nextSteps: ['Next Step 1'],
            followUpRequired: false,
            driveFolder: 'Test_Folder',
            driveFolderId: 'folder123',
            videoFileId: 'video123',
            transcriptFileId: 'transcript123',
            driveLink: 'https://drive.google.com/drive/folders/folder123',
            processedDate: '2025-01-01T12:00:00Z',
            processingVersion: '2.0-smart',
            dataSource: 'test',
            lastUpdated: '2025-01-01T12:00:00Z'
        };
        
        const rowData = sheetsService._prepareStandardizedRowData(mockSmartData);
        console.log('Row data length:', rowData.length);
        
        // Find driveLink in row data
        const driveLinkIndex = rowData.indexOf('https://drive.google.com/drive/folders/folder123');
        if (driveLinkIndex >= 0) {
            console.log('✅ driveLink found in row data at index:', driveLinkIndex);
            console.log('Expected position (AY = 50):', 50);
            console.log('Position matches:', driveLinkIndex === 50 ? 'Yes' : 'No');
        } else {
            console.log('❌ driveLink not found in row data');
        }
        
        // Test 3: Check actual spreadsheet headers
        console.log('\n📈 Test 3: Actual Spreadsheet Headers');
        console.log('--------------------------------------');
        
        try {
            const response = await sheetsService.sheets.spreadsheets.values.get({
                spreadsheetId: sheetsService.spreadsheetId,
                range: `${sheetsService.tabs.standardized.name}!A1:AY1`
            });
            
            const headers = response.data.values?.[0] || [];
            console.log('Total headers in sheet:', headers.length);
            
            // Find driveLink header
            const driveLinkHeaderIndex = headers.findIndex(header => 
                header && header.toLowerCase().includes('drivelink')
            );
            
            if (driveLinkHeaderIndex >= 0) {
                console.log('✅ driveLink header found at position:', driveLinkHeaderIndex);
                console.log('Header value:', headers[driveLinkHeaderIndex]);
            } else {
                console.log('❌ driveLink header not found in spreadsheet');
                console.log('Available headers:', headers.slice(0, 10).join(', '), '...');
            }
            
        } catch (error) {
            console.log('❌ Could not read spreadsheet headers:', error.message);
        }
        
        // Test 4: Update header rows in both tabs
        console.log('\n📝 Test 4: Update Header Rows');
        console.log('--------------------------------');
        async function updateSheetHeaders(tab, columns) {
            // columns: object mapping fieldName -> columnLetter
            // We want the keys in the order of their column letters
            const colEntries = Object.entries(columns);
            // Sort by column letter (A, B, C, ...)
            colEntries.sort((a, b) => {
                // Compare by column letter (e.g., 'A', 'B', ... 'AA', 'AB', ...)
                const colA = a[1];
                const colB = b[1];
                // Convert to numbers for sorting (A=1, B=2, ... Z=26, AA=27, AB=28, ...)
                function colToNum(col) {
                    let num = 0;
                    for (let i = 0; i < col.length; i++) {
                        num = num * 26 + (col.charCodeAt(i) - 64);
                    }
                    return num;
                }
                return colToNum(colA) - colToNum(colB);
            });
            const headerRow = colEntries.map(([field, _]) => field);
            // Write to A1:...1
            const lastCol = colEntries[colEntries.length - 1][1];
            const range = `${tab.name}!A1:${lastCol}1`;
            await sheetsService.sheets.spreadsheets.values.update({
                spreadsheetId: sheetsService.spreadsheetId,
                range,
                valueInputOption: 'RAW',
                requestBody: { values: [headerRow] }
            });
            return { range, headerRow };
        }
        // Update Raw tab
        try {
            const rawResult = await updateSheetHeaders(sheetsService.tabs.raw, sheetsService.tabs.raw.columns);
            console.log('✅ Raw tab header updated:', rawResult.range);
        } catch (err) {
            console.log('❌ Failed to update Raw tab header:', err.message);
        }
        // Update Standardized tab
        try {
            const stdResult = await updateSheetHeaders(sheetsService.tabs.standardized, sheetsService.tabs.standardized.columns);
            console.log('✅ Standardized tab header updated:', stdResult.range);
        } catch (err) {
            console.log('❌ Failed to update Standardized tab header:', err.message);
        }
        console.log('\n✅ Header update complete!');
        
        console.log('\n✅ Schema verification complete!');
        
    } catch (error) {
        console.error('❌ Schema verification failed:', error);
    }
}

// Run the test
testSchemaVerification().catch(console.error); 