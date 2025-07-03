require('dotenv').config();

const { DualTabGoogleSheetsService } = require('./src/infrastructure/services/DualTabGoogleSheetsService');
const { Logger } = require('./src/shared/Logger');
const { EventBus } = require('./src/shared/EventBus');
const { Cache } = require('./src/shared/Cache');
const { MetricsCollector } = require('./src/shared/MetricsCollector');
const configInstance = require('./src/shared/config/smart-config');
const config = configInstance.config;

async function testSheetsOnly() {
    console.log('🔍 Testing Google Sheets Service Only');
    console.log('=====================================');
    
    try {
        // Create minimal dependencies
        const logger = new Logger('TestSheets');
        const eventBus = new EventBus();
        const cache = new Cache();
        const metricsCollector = new MetricsCollector();
        
        // Create fallback services
        const fallbackServices = {
            nameStandardizer: {
                standardizeName: () => ({ name: 'Test', confidence: 80, method: 'fallback' }),
                resolveNames: () => ({ coach: 'Test Coach', student: 'Test Student', confidence: 80 })
            },
            weekInferencer: {
                inferWeek: () => ({ weekNumber: 1, confidence: 90, method: 'fallback' })
            },
            metadataExtractor: {
                extractMetadata: () => ({})
            },
            transcriptionAnalyzer: {
                analyzeTranscript: () => ({})
            }
        };
        
        // Initialize Google Sheets Service directly
        console.log('\n📋 Initializing Google Sheets Service...');
        
        // Check config structure
        console.log('Config structure check:');
        console.log('- config.google exists:', !!config.google);
        console.log('- config.google.sheets exists:', !!config.google?.sheets);
        console.log('- config.google.sheets.masterIndexSheetId:', config.google?.sheets?.masterIndexSheetId);
        
        const sheetsService = new DualTabGoogleSheetsService({
            config,
            eventBus,
            logger,
            cache,
            metricsCollector,
            nameStandardizer: fallbackServices.nameStandardizer,
            weekInferencer: fallbackServices.weekInferencer,
            metadataExtractor: fallbackServices.metadataExtractor,
            transcriptionAnalyzer: fallbackServices.transcriptionAnalyzer
        });
        // Await async initialization
        await sheetsService._initialize();
        
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
        
        // Test 2: Update header rows
        console.log('\n📝 Test 2: Update Header Rows');
        console.log('--------------------------------');
        
        async function updateSheetHeaders(tab, columns) {
            const colEntries = Object.entries(columns);
            colEntries.sort((a, b) => {
                const colA = a[1];
                const colB = b[1];
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
            console.log('Headers:', rawResult.headerRow.slice(0, 10).join(', '), '...');
        } catch (err) {
            console.log('❌ Failed to update Raw tab header:', err.message);
        }
        
        // Update Standardized tab
        try {
            const stdResult = await updateSheetHeaders(sheetsService.tabs.standardized, sheetsService.tabs.standardized.columns);
            console.log('✅ Standardized tab header updated:', stdResult.range);
            console.log('Headers:', stdResult.headerRow.slice(0, 10).join(', '), '...');
            
            // Check if driveLink is in the headers
            const driveLinkIndex = stdResult.headerRow.indexOf('driveLink');
            if (driveLinkIndex >= 0) {
                console.log(`✅ driveLink found at position ${driveLinkIndex} in headers`);
            } else {
                console.log('❌ driveLink not found in headers');
            }
        } catch (err) {
            console.log('❌ Failed to update Standardized tab header:', err.message);
        }
        
        console.log('\n✅ Sheets-only test complete!');
        
    } catch (error) {
        console.error('❌ Sheets-only test failed:', error);
    }
}

// Run the test
testSheetsOnly().catch(console.error); 