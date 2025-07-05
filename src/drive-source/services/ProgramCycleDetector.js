/**
 * Program Cycle Detector
 * Detects and tracks program renewal cycles for long-term students
 * Used primarily for Huda and Anoushka who have multiple program renewals
 */

class ProgramCycleDetector {
  constructor() {
    // Define renewal students and their program history
    this.renewalStudents = {
      'Huda': {
        coach: 'Jenny',
        programLengths: [24, 48], // Can have 24 or 48 week programs
        startDate: '2023-06-26', // First program start
        knownPrograms: [
          { cycle: 1, weeks: 24, startWeek: 1, endWeek: 24 },
          { cycle: 2, weeks: 24, startWeek: 25, endWeek: 48 },
          { cycle: 3, weeks: 48, startWeek: 49, endWeek: 96 }
        ]
      },
      'Anoushka': {
        coach: 'Jenny',
        programLengths: [24, 48],
        startDate: '2023-01-01', // Approximate
        knownPrograms: [
          { cycle: 1, weeks: 48, startWeek: 1, endWeek: 48 },
          { cycle: 2, weeks: 48, startWeek: 49, endWeek: 96 }
        ]
      }
    };

    // Standard program lengths
    this.standardProgramLengths = [12, 24, 48];
  }

  /**
   * Detect program cycle based on week number and student
   * @param {string} studentName - Student name
   * @param {number|string} weekNumber - Week number (can be like "47", "00A", etc.)
   * @param {string} sessionDate - Session date in YYYY-MM-DD format
   * @returns {Object} { programCycle: number, isRenewal: boolean, cycleWeek: number }
   */
  detectProgramCycle(studentName, weekNumber, sessionDate) {
    // Normalize student name
    const student = this.normalizeStudentName(studentName);
    
    // Check if this is a renewal student
    if (!this.renewalStudents[student]) {
      return {
        programCycle: null,
        isRenewal: false,
        cycleWeek: weekNumber
      };
    }

    // Parse week number (handle special cases like "00A", "00B")
    const weekNum = this.parseWeekNumber(weekNumber);
    
    // For known renewal students, determine which program cycle
    const studentInfo = this.renewalStudents[student];
    let programCycle = 1;
    let cycleWeek = weekNum;

    // Check against known programs
    for (const program of studentInfo.knownPrograms) {
      if (weekNum >= program.startWeek && weekNum <= program.endWeek) {
        programCycle = program.cycle;
        cycleWeek = weekNum - program.startWeek + 1;
        break;
      }
    }

    // If week number exceeds all known programs, calculate based on standard lengths
    if (weekNum > Math.max(...studentInfo.knownPrograms.map(p => p.endWeek))) {
      const standardLength = studentInfo.programLengths[0] || 48;
      programCycle = Math.ceil(weekNum / standardLength);
      cycleWeek = ((weekNum - 1) % standardLength) + 1;
    }

    return {
      programCycle: programCycle,
      isRenewal: programCycle > 1,
      cycleWeek: cycleWeek,
      absoluteWeek: weekNum
    };
  }

  /**
   * Parse week number handling special cases
   * @param {string} weekStr - Week string like "47", "00A", "00B"
   * @returns {number} Numeric week number
   */
  parseWeekNumber(weekStr) {
    if (!weekStr) return 1;
    
    // Handle special week 0 cases (GamePlan sessions)
    if (weekStr === '00' || weekStr === '0') return 0;
    if (weekStr === '00A') return 0.1;
    if (weekStr === '00B') return 0.2;
    
    // Extract numeric part
    const match = weekStr.toString().match(/\d+/);
    return match ? parseInt(match[0]) : 1;
  }

  /**
   * Normalize student name for matching
   * @param {string} name - Student name
   * @returns {string} Normalized name
   */
  normalizeStudentName(name) {
    if (!name) return '';
    
    // Extract first name and normalize
    const firstName = name.trim().split(/\s+/)[0];
    
    // Handle known variations
    const nameMap = {
      'huda': 'Huda',
      'anoushka': 'Anoushka',
      'anushka': 'Anoushka' // Common misspelling
    };
    
    const normalized = firstName.toLowerCase();
    return nameMap[normalized] || firstName;
  }

  /**
   * Detect if a folder represents a program boundary
   * @param {Array} sessions - Array of sessions sorted by date
   * @returns {Array} Program boundaries with cycle information
   */
  detectProgramBoundaries(sessions) {
    const boundaries = [];
    let currentCycle = 1;
    let lastWeek = 0;
    
    sessions.forEach((session, index) => {
      const weekNum = this.parseWeekNumber(session.weekNumber);
      
      // Detect program boundary conditions:
      // 1. Week number resets (e.g., from 48 to 1)
      // 2. Large date gap (> 4 weeks)
      // 3. Week number jumps backward significantly
      
      if (index > 0) {
        const dateGap = this.calculateDateGap(
          sessions[index - 1].date,
          session.date
        );
        
        if (weekNum < lastWeek - 5 || dateGap > 28) {
          currentCycle++;
          boundaries.push({
            index: index,
            fromWeek: lastWeek,
            toWeek: weekNum,
            cycle: currentCycle,
            dateGap: dateGap
          });
        }
      }
      
      lastWeek = weekNum;
    });
    
    return boundaries;
  }

  /**
   * Calculate date gap in days
   * @param {string} date1 - First date
   * @param {string} date2 - Second date
   * @returns {number} Days between dates
   */
  calculateDateGap(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2 - d1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  /**
   * Generate folder name with program cycle
   * @param {Object} components - Name components
   * @param {number} programCycle - Program cycle number
   * @returns {string} Folder name with PC attribute
   */
  generateFolderNameWithCycle(components, programCycle) {
    const { sessionType, coach, student, week, date, uuid } = components;
    
    // Only add PC for renewal students and cycle > 1
    if (programCycle && programCycle > 1 && this.renewalStudents[student]) {
      return `${sessionType}_${coach}_${student}_PC${programCycle}_Wk${week}_${date}_${uuid}`;
    }
    
    // Standard format for first program or non-renewal students
    return `${sessionType}_${coach}_${student}_Wk${week}_${date}_${uuid}`;
  }

  /**
   * Check if student is a renewal student
   * @param {string} studentName - Student name
   * @returns {boolean} True if renewal student
   */
  isRenewalStudent(studentName) {
    const normalized = this.normalizeStudentName(studentName);
    return !!this.renewalStudents[normalized];
  }

  /**
   * Get program info for a student
   * @param {string} studentName - Student name
   * @returns {Object|null} Student program info
   */
  getStudentProgramInfo(studentName) {
    const normalized = this.normalizeStudentName(studentName);
    return this.renewalStudents[normalized] || null;
  }
}

module.exports = ProgramCycleDetector;