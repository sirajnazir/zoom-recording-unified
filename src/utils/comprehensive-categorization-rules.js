/**
 * Comprehensive implementation of categorization rules
 * This creates a new categorization module that can be integrated
 */

const fs = require('fs').promises;
const path = require('path');

async function implementCategorizationRules() {
    console.log('📋 Implementing Comprehensive Categorization Rules\n');
    
    // Create a categorization rules module
    const categorizationModule = `/**
 * Categorization Rules for Zoom Recordings
 * 
 * Priority order:
 * 1. Coach AND Student identified → Coaching_
 * 2. MISC hosts (Ivylevel/Siraj/Ivy Mentor) without student → MISC_
 * 3. Other cases → contextual decision
 */

class RecordingCategorizer {
    constructor(logger) {
        this.logger = logger || console;
        
        // Define MISC hosts/indicators
        this.miscIndicators = [
            'ivylevel',
            'siraj',
            'siraj nazir',
            'ivy mentor',
            'ivymentor',
            'ivy mentors',
            'ivymentors'
        ];
    }
    
    /**
     * Main categorization method
     */
    categorize(components, recording = {}) {
        const { coach, student, sessionType } = components;
        const topic = recording.topic || '';
        const hostEmail = recording.host_email || '';
        const hostName = recording.host_name || '';
        
        this.logger.debug('Categorizing:', { coach, student, topic });
        
        // Rule 1: Both coach AND student identified → Coaching
        if (this.hasValidCoach(coach) && this.hasValidStudent(student)) {
            this.logger.info('Rule 1 matched: Coach AND Student → Coaching');
            return 'Coaching';
        }
        
        // Rule 2: Check if this is a MISC host/session
        if (this.isMiscSession(components, recording)) {
            this.logger.info('Rule 2 matched: MISC host without student → MISC');
            return 'MISC';
        }
        
        // Rule 3: Personal Meeting Room with valid coach → Coaching
        if (this.isPMR(topic) && this.hasValidCoach(coach)) {
            this.logger.info('Rule 3 matched: PMR with coach → Coaching');
            return 'Coaching';
        }
        
        // Rule 4: If we have a coach but no student, still Coaching
        if (this.hasValidCoach(coach)) {
            this.logger.info('Rule 4 matched: Coach identified → Coaching');
            return 'Coaching';
        }
        
        // Default: MISC
        this.logger.info('No rules matched → MISC');
        return 'MISC';
    }
    
    /**
     * Check if coach is valid (not unknown/empty)
     */
    hasValidCoach(coach) {
        return coach && 
               coach !== 'unknown' && 
               coach !== 'Unknown' && 
               coach.trim() !== '';
    }
    
    /**
     * Check if student is valid (not unknown/empty)
     */
    hasValidStudent(student) {
        return student && 
               student !== 'Unknown' && 
               student !== 'unknown' && 
               student.trim() !== '';
    }
    
    /**
     * Check if this is a MISC session based on host/topic
     */
    isMiscSession(components, recording) {
        const { coach, student } = components;
        const topic = (recording.topic || '').toLowerCase();
        const hostEmail = (recording.host_email || '').toLowerCase();
        const hostName = (recording.host_name || '').toLowerCase();
        const coachLower = (coach || '').toLowerCase();
        
        // Check if any MISC indicator is present
        const hasMiscIndicator = this.miscIndicators.some(indicator => 
            topic.includes(indicator) ||
            hostEmail.includes(indicator) ||
            hostName.includes(indicator) ||
            coachLower.includes(indicator)
        );
        
        // MISC if: has MISC indicator AND no valid student
        return hasMiscIndicator && !this.hasValidStudent(student);
    }
    
    /**
     * Check if topic indicates Personal Meeting Room
     */
    isPMR(topic) {
        return topic && topic.toLowerCase().includes('personal meeting room');
    }
    
    /**
     * Build the standardized folder name with correct prefix
     */
    buildFolderName(category, components, date) {
        const { coach = 'unknown', student = 'Unknown', week = 'WkUnknown' } = components;
        const prefix = category; // Coaching, MISC, or Session
        
        return \`\${prefix}_\${coach}_\${student}_\${week}_\${date}\`;
    }
}

module.exports = RecordingCategorizer;
`;

    // Save the categorization module
    const categorizerPath = path.join('src', 'utils', 'RecordingCategorizer.js');
    await fs.mkdir(path.dirname(categorizerPath), { recursive: true });
    await fs.writeFile(categorizerPath, categorizationModule);
    console.log('✅ Created RecordingCategorizer module\n');
    
    // Create integration patch for SmartDeepNameStandardizer
    const integrationPatch = `
// Integration patch for SmartDeepNameStandardizer
const fs = require('fs');
const path = require('path');

console.log('Integrating RecordingCategorizer...\\n');

const standardizerPath = path.join('src', 'infrastructure', 'services', 'SmartDeepNameStandardizer.js');
let content = fs.readFileSync(standardizerPath, 'utf8');

// Add import at the top
if (!content.includes('RecordingCategorizer')) {
    const importLocation = content.indexOf('class ');
    content = "const RecordingCategorizer = require('../../utils/RecordingCategorizer');\\n\\n" + content.substring(importLocation);
}

// Add categorizer initialization in constructor
const constructorMatch = content.match(/constructor\s*\([^)]*\)\s*{/);
if (constructorMatch && !content.includes('this.categorizer')) {
    const constructorEnd = content.indexOf('{', constructorMatch.index) + 1;
    const addition = '\n        this.categorizer = new RecordingCategorizer(this.logger);';
    content = content.substring(0, constructorEnd) + addition + content.substring(constructorEnd);
}

// Replace determineSessionType method
const determineMethod = content.match(/determineSessionType\\s*\\([^)]*\\)\\s*{[^}]*}/);
if (determineMethod) {
    const replacement = \`determineSessionType(components, recording) {
        // Use the new categorizer
        return this.categorizer.categorize(components, recording);
    }\`;
    content = content.replace(determineMethod[0], replacement);
}

// Update buildStandardizedFolderName to use categorizer
const buildMethod = content.match(/buildStandardizedFolderName\\s*\\([^)]*\\)\\s*{[^}]*}/);
if (buildMethod) {
    const replacement = \`buildStandardizedFolderName({ coach, student, weekNumber, sessionType, date }) {
        // Ensure sessionType is properly set
        const category = sessionType || 'MISC';
        return this.categorizer.buildFolderName(category, { coach, student, week: weekNumber }, date);
    }\`;
    content = content.replace(buildMethod[0], replacement);
}

fs.writeFileSync(standardizerPath, content);
console.log('✅ Integrated RecordingCategorizer');
`;
    
    await fs.writeFile('integrate-categorizer.js', integrationPatch);
    console.log('✅ Created integrate-categorizer.js\n');
    
    // Create comprehensive test
    const testScript = `
// Comprehensive categorization test
require('dotenv').config();
const RecordingCategorizer = require('./src/utils/RecordingCategorizer');

async function testComprehensiveCategorization() {
    console.log('🧪 Testing Comprehensive Categorization Rules\\n');
    
    const categorizer = new RecordingCategorizer(console);
    
    const testCases = [
        {
            name: "Ivylevel Jamie <> Zainab",
            components: { coach: 'jamie', student: 'Zainab' },
            recording: { topic: "Ivylevel Jamie <> Zainab | Session #2" },
            expected: 'Coaching',
            reason: 'Has both coach AND student'
        },
        {
            name: "Ivylevel's PMR",
            components: { coach: 'ivylevel', student: 'Unknown' },
            recording: { topic: "Ivylevel's Personal Meeting Room" },
            expected: 'MISC',
            reason: 'Ivylevel host without student'
        },
        {
            name: "Siraj meeting",
            components: { coach: 'siraj', student: 'Unknown' },
            recording: { topic: "Siraj's meeting", host_email: "siraj@ivymentors.co" },
            expected: 'MISC',
            reason: 'Siraj host without student'
        },
        {
            name: "Aditi's PMR",
            components: { coach: 'aditi', student: 'Unknown' },
            recording: { topic: "Aditi B's Personal Meeting Room" },
            expected: 'Coaching',
            reason: 'Non-MISC host PMR'
        },
        {
            name: "Kavya & Aditi",
            components: { coach: 'aditi', student: 'Kavya' },
            recording: { topic: "Kavya & Aditi - week 28" },
            expected: 'Coaching',
            reason: 'Has both names'
        },
        {
            name: "Ivy Mentor demo",
            components: { coach: 'unknown', student: 'Unknown' },
            recording: { topic: "Ivy Mentor product demo", host_email: "contact@ivymentors.co" },
            expected: 'MISC',
            reason: 'Ivy Mentor host without participants'
        }
    ];
    
    console.log('Testing categorization rules:\\n');
    
    let passed = 0;
    for (const test of testCases) {
        const result = categorizer.categorize(test.components, test.recording);
        const success = result === test.expected;
        
        console.log(\`\${success ? '✅' : '❌'} \${test.name}\`);
        console.log(\`   Result: \${result}\`);
        console.log(\`   Expected: \${test.expected}\`);
        console.log(\`   Reason: \${test.reason}\\n\`);
        
        if (success) passed++;
    }
    
    console.log(\`Passed: \${passed}/\${testCases.length} tests\`);
    
    // Now test with actual standardizer
    console.log('\\n' + '='.repeat(60));
    console.log('Testing with SmartDeepNameStandardizer:\\n');
    
    const { getContainer } = require('./src/container');
    const container = getContainer();
    const standardizer = container.cradle.nameStandardizer;
    
    const realTests = [
        "Ivylevel's Personal Meeting Room",
        "Ivylevel Jamie <> Zainab | Session #2",
        "Siraj's team meeting",
        "Aditi B's Personal Meeting Room"
    ];
    
    for (const test of realTests) {
        const result = await standardizer.standardizeName(test);
        const category = result.standardized.split('_')[0];
        console.log(\`"\${test}"\`);
        console.log(\`  → \${result.standardized}\`);
        console.log(\`  Category: \${category}\\n\`);
    }
}

testComprehensiveCategorization().catch(console.error);`;
    
    await fs.writeFile('test-comprehensive-categorization.js', testScript);
    console.log('✅ Created test-comprehensive-categorization.js\n');
    
    console.log('=' * 60);
    console.log('CATEGORIZATION RULES IMPLEMENTED');
    console.log('=' * 60);
    console.log('\nRules in priority order:');
    console.log('1. Coach AND Student → Coaching_');
    console.log('2. MISC hosts without student → MISC_');
    console.log('   MISC hosts: Ivylevel, Siraj, Ivy Mentor(s)');
    console.log('3. PMR with coach → Coaching_');
    console.log('4. Has coach → Coaching_');
    console.log('5. Default → MISC_');
    
    console.log('\nTo apply:');
    console.log('1. Quick fix (just Ivylevel PMR):');
    console.log('   node quick-categorization-fix.js\n');
    console.log('2. Full integration:');
    console.log('   node integrate-categorizer.js\n');
    console.log('3. Test categorization:');
    console.log('   node test-comprehensive-categorization.js');
}

// Run implementation
implementCategorizationRules().catch(console.error);