const fs = require('fs').promises;
const path = require('path');
const Papa = require('papaparse');

class DataConverter {
    async convertStudentsToCSV() {
        console.log('📋 Converting students.json to CSV...');
        
        // Read JSON file from data directory
        const jsonData = JSON.parse(
            await fs.readFile(path.join(__dirname, '../data/students.json'), 'utf8')
        );
        
        // Transform data for CSV
        const csvData = jsonData.map(student => ({
            student_id: student.id,
            name: student.name,
            first_name: student.firstName,
            last_name: student.lastName,
            email: student.email || '',
            alternate_names: (student.alternateNames || []).join('|'),
            parent_name: student.parentName || '',
            parent_email: student.parentEmail || '',
            parent_alternate_names: (student.parentAlternateNames || []).join('|'),
            grade: student.grade || '',
            program: student.program || '',
            coach: student.coach || '',
            status: student.status || 'active',
            start_date: student.startDate || '',
            interests: student.interests ? student.interests.join('|') : '',
            target_colleges: student.targetColleges ? student.targetColleges.join('|') : '',
            target_sat: student.targetSAT || '',
            notes: student.notes || ''
        }));
        
        // Convert to CSV
        const csv = Papa.unparse(csvData, {
            header: true,
            delimiter: ',',
            newline: '\n'
        });
        
        // Create data directory if it doesn't exist
        await fs.mkdir('./data', { recursive: true });
        
        // Write CSV file
        await fs.writeFile('./data/students-comprehensive.csv', csv);
        console.log(`✅ Created students-comprehensive.csv with ${csvData.length} students`);
        
        return csvData.length;
    }
    
    async convertCoachesToCSV() {
        console.log('📋 Converting coaches.json to CSV...');
        
        // Read JSON file from data directory
        const jsonData = JSON.parse(
            await fs.readFile(path.join(__dirname, '../data/coaches.json'), 'utf8')
        );
        
        // Transform data for CSV
        const csvData = jsonData.map(coach => ({
            coach_id: coach.id,
            name: coach.name,
            first_name: coach.firstName,
            last_name: coach.lastName || '',
            email: coach.email || '',
            alternate_names: (coach.alternateNames || []).join('|'),
            role: coach.role || 'coach',
            status: coach.status || 'active',
            expertise: '', // Add if available
            years_experience: '', // Add if available
            certifications: '', // Add if available
            availability: '', // Add if available
            timezone: 'America/Los_Angeles', // Default
            rating: '' // Add if available
        }));
        
        // Convert to CSV
        const csv = Papa.unparse(csvData, {
            header: true,
            delimiter: ',',
            newline: '\n'
        });
        
        // Write CSV file
        await fs.writeFile('./data/coaches.csv', csv);
        console.log(`✅ Created coaches.csv with ${csvData.length} coaches`);
        
        return csvData.length;
    }
    
    async createProgramsCSV() {
        console.log('📋 Creating programs.csv from extracted data...');
        
        // Extract unique programs from students data in data directory
        const studentsJson = JSON.parse(
            await fs.readFile(path.join(__dirname, '../data/students.json'), 'utf8')
        );
        
        const programSet = new Set();
        const programMap = new Map();
        
        // Extract programs
        studentsJson.forEach(student => {
            if (student.program && student.program.trim()) {
                programSet.add(student.program);
                
                // Count students per program
                if (programMap.has(student.program)) {
                    programMap.get(student.program).count++;
                } else {
                    programMap.set(student.program, {
                        name: student.program,
                        count: 1
                    });
                }
            }
        });
        
        // Create program data
        const programData = Array.from(programMap.values()).map((prog, index) => ({
            program_id: `prog_${String(index + 1).padStart(3, '0')}`,
            program_name: prog.name,
            description: this.getProgramDescription(prog.name),
            program_type: this.getProgramType(prog.name),
            duration: this.getProgramDuration(prog.name),
            focus_areas: this.getProgramFocusAreas(prog.name),
            objectives: 'College preparation|Application support|Academic development',
            target_grades: '11|12',
            max_students: 50,
            current_students: prog.count,
            start_date: '',
            end_date: '',
            action_planning: prog.name.toLowerCase().includes('game plan') ? 'true' : 'false',
            status: 'active'
        }));
        
        // Convert to CSV
        const csv = Papa.unparse(programData, {
            header: true,
            delimiter: ',',
            newline: '\n'
        });
        
        // Write CSV file
        await fs.writeFile('./data/programs.csv', csv);
        console.log(`✅ Created programs.csv with ${programData.length} programs`);
        
        return programData.length;
    }
    
    getProgramDescription(programName) {
        const name = programName.toLowerCase();
        
        if (name.includes('ultimate prep')) {
            return 'Comprehensive college preparation program with intensive application support';
        }
        if (name.includes('ivy') || name.includes('ivylevel')) {
            return 'Elite college preparation focused on Ivy League and top-tier universities';
        }
        if (name.includes('essay')) {
            return 'Specialized program focusing on college application essays';
        }
        if (name.includes('game plan')) {
            return 'Strategic planning and goal-setting program for college applications';
        }
        if (name.includes('research')) {
            return 'Research-focused program for developing academic projects';
        }
        if (name.includes('360 assessment')) {
            return 'Comprehensive evaluation and planning program';
        }
        if (name.includes('internship')) {
            return 'Career preparation and internship placement program';
        }
        
        return 'Customized college preparation program';
    }
    
    getProgramType(programName) {
        const name = programName.toLowerCase();
        
        if (name.includes('prep')) return 'College Prep';
        if (name.includes('essay')) return 'Essay Writing';
        if (name.includes('research')) return 'Research';
        if (name.includes('assessment')) return 'Assessment';
        if (name.includes('game plan')) return 'Strategic Planning';
        if (name.includes('internship')) return 'Career Prep';
        
        return 'General';
    }
    
    getProgramDuration(programName) {
        const matches = programName.match(/(\d+)[x\s-]*(?:week|hr)/i);
        if (matches) {
            return `${matches[1]} weeks`;
        }
        
        if (programName.toLowerCase().includes('24')) return '24 weeks';
        if (programName.toLowerCase().includes('48')) return '48 weeks';
        if (programName.toLowerCase().includes('12')) return '12 weeks';
        if (programName.toLowerCase().includes('9')) return '9 weeks';
        
        return '12 weeks'; // Default
    }
    
    getProgramFocusAreas(programName) {
        const name = programName.toLowerCase();
        const areas = [];
        
        if (name.includes('essay')) areas.push('Essay Writing');
        if (name.includes('prep')) areas.push('Test Preparation');
        if (name.includes('app')) areas.push('Application Strategy');
        if (name.includes('research')) areas.push('Academic Research');
        if (name.includes('game plan')) areas.push('Strategic Planning');
        if (name.includes('internship')) areas.push('Career Development');
        
        if (areas.length === 0) {
            areas.push('College Preparation', 'Application Support');
        }
        
        return areas.join('|');
    }
    
    async convertAll() {
        console.log('\n🚀 Starting data conversion...\n');
        
        try {
            const studentsCount = await this.convertStudentsToCSV();
            const coachesCount = await this.convertCoachesToCSV();
            const programsCount = await this.createProgramsCSV();
            
            console.log('\n✅ Data conversion complete!');
            console.log(`   - Students: ${studentsCount}`);
            console.log(`   - Coaches: ${coachesCount}`);
            console.log(`   - Programs: ${programsCount}`);
            
            console.log('\n📁 CSV files created in ./data directory');
            
        } catch (error) {
            console.error('\n❌ Conversion failed:', error);
            throw error;
        }
    }
}

// Run converter
if (require.main === module) {
    const converter = new DataConverter();
    converter.convertAll().catch(console.error);
}

module.exports = { DataConverter }; 