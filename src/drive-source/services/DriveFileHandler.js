/**
 * Drive File Handler
 * Fixes for Drive import file handling
 */

class DriveFileHandler {
  /**
   * Convert Drive file objects to proper format for DriveOrganizer
   * For Drive imports, we create shortcuts instead of uploading files
   */
  static prepareFilesForOrganization(files) {
    const preparedFiles = {};
    
    // For Drive imports, we pass the file IDs instead of paths
    // Process ALL files, not just known types
    for (const [key, file] of Object.entries(files)) {
      if (file && file.id) {
        preparedFiles[key] = file.id;
      }
    }
    
    return preparedFiles;
  }
  
  /**
   * Check if AI insights were actually generated
   */
  static validateAIInsights(insights) {
    if (!insights || typeof insights !== 'object') {
      return false;
    }
    
    // Check for combinedInsights structure
    if (insights.combinedInsights) {
      const combined = insights.combinedInsights;
      return !!(
        combined.executiveSummary ||
        combined.keyThemes?.length > 0 ||
        combined.mainDiscussionPoints?.length > 0 ||
        combined.actionItems?.length > 0
      );
    }
    
    // Check for any meaningful content
    return Object.keys(insights).length > 0 && 
           Object.values(insights).some(value => 
             value && (typeof value === 'string' ? value.trim().length > 0 : true)
           );
  }
}

module.exports = DriveFileHandler;