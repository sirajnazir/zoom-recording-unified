module.exports = {
  // S3-Ivylevel-GDrive-Session-Recordings folder
  rootFolderId: '1Dpq3rSZelQJJePkSi7K6xAY4q62xMiFA',
  
  // Scanning configuration
  scanning: {
    maxDepth: 7,
    minFileSize: 1024 * 1024, // 1MB minimum
    maxFilesPerBatch: 500,
    
    // Folders to exclude from scanning
    excludeFolders: [
      'Processed',
      'Archive',
      'Archived',
      'Old',
      'Backup',
      'Test',
      'Testing',
      'temp',
      'tmp',
      'Trash',
      'Delete',
      'Ignore',
      '_old',
      '_backup',
      '_archive'
    ],
    
    // Additional patterns to include in search
    includePatterns: [
      /S\d+[-_]?Ivylevel/i,
      /Ivylevel[-_]?S\d+/i,
      /coaching.*session/i,
      /mentoring.*session/i,
      /office.*hours/i,
      /check[-_]?in/i,
      /onboarding/i,
      /orientation/i,
      /workshop/i,
      /masterclass/i,
      /bootcamp/i,
      /cohort/i,
      /batch/i
    ]
  },
  
  // Known coaches/mentors for better identification
  knownCoaches: [
    'Sarah', 'John', 'Emily', 'Michael', 'Jessica', 'David', 'Lisa', 'James',
    'Jennifer', 'Robert', 'Maria', 'William', 'Linda', 'Richard', 'Patricia',
    'Charles', 'Barbara', 'Joseph', 'Susan', 'Thomas', 'Karen', 'Christopher',
    'Nancy', 'Daniel', 'Betty', 'Matthew', 'Helen', 'Anthony', 'Sandra'
  ],
  
  // Program keywords for categorization
  programKeywords: {
    'Data Science': ['data science', 'machine learning', 'ml', 'ai', 'python', 'statistics', 'analytics'],
    'Web Development': ['web dev', 'frontend', 'backend', 'fullstack', 'full stack', 'javascript', 'react', 'node'],
    'Software Engineering': ['software', 'engineering', 'algorithm', 'coding', 'programming'],
    'Product Management': ['product', 'pm', 'management', 'agile', 'scrum'],
    'Design': ['design', 'ux', 'ui', 'user experience', 'figma', 'sketch'],
    'Business': ['business', 'mba', 'strategy', 'finance', 'marketing']
  },
  
  // Session type categorization
  sessionTypes: {
    'Individual Coaching': ['1-on-1', 'one-on-one', '1on1', 'individual', 'personal'],
    'Group Session': ['group', 'team', 'cohort', 'batch', 'class'],
    'Office Hours': ['office hours', 'oh', 'open hours', 'drop-in'],
    'Workshop': ['workshop', 'masterclass', 'bootcamp', 'intensive'],
    'Check-in': ['check-in', 'checkin', 'follow-up', 'followup', 'review'],
    'Onboarding': ['onboarding', 'orientation', 'intro', 'introduction', 'welcome'],
    'Demo': ['demo', 'demonstration', 'presentation', 'showcase'],
    'Assessment': ['assessment', 'evaluation', 'test', 'exam', 'final', 'midterm']
  },
  
  // Naming convention priorities
  namingPriorities: {
    studentId: 100,
    date: 90,
    participants: 80,
    week: 70,
    sessionType: 60,
    program: 50,
    cohort: 40
  },
  
  // Confidence thresholds
  confidence: {
    high: 80,
    medium: 60,
    low: 40,
    veryLow: 20
  },
  
  // Processing options
  processing: {
    // Try to preserve original folder structure when possible
    preserveFolderHierarchy: true,
    
    // Create shortcuts in both coach and student folders
    createDualAccess: true,
    
    // Attempt to merge duplicate recordings
    mergeDuplicates: true,
    
    // Generate summary reports
    generateReports: true,
    
    // Batch size for processing
    batchSize: 10
  },
  
  // Output folder mapping
  folderMapping: {
    // Map S3-Ivylevel session types to standard folders
    'Individual Coaching': 'Coaches',
    'Group Session': 'Students',
    'Office Hours': 'Coaches',
    'Workshop': 'Students',
    'Check-in': 'Coaches',
    'Onboarding': 'Students',
    'Demo': 'MISC',
    'Assessment': 'Students'
  }
};