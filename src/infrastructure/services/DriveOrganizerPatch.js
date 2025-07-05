/**
 * Patch for DriveOrganizer to handle Drive imports
 * This extends DriveOrganizer to create shortcuts instead of uploading files
 */

class DriveOrganizerPatch {
  /**
   * Upload recording files for Drive imports (creates shortcuts instead)
   */
  static async uploadRecordingFilesForDriveImport(driveOrganizer, files, sessionFolder, recording) {
    const uploadedFiles = {};
    const uploadedTypes = new Set();
    
    driveOrganizer.logger.info(`[DEBUG] Creating shortcuts for Drive import recording: ${recording.id}`);
    
    for (const [type, fileId] of Object.entries(files)) {
      if (!fileId || typeof fileId !== 'string') continue;
      if (uploadedTypes.has(type)) continue;
      
      uploadedTypes.add(type);
      
      try {
        // For Drive imports, create a shortcut to the original file
        const originalFileName = recording.recording_files?.find(f => 
          f.file_type.toLowerCase().includes(type.toLowerCase())
        )?.file_name || `${type}.${driveOrganizer.getFileExtension(type)}`;
        
        driveOrganizer.logger.info(`[DEBUG] Creating shortcut for ${type}: ${originalFileName} -> ${fileId}`);
        
        const shortcut = await driveOrganizer.googleDriveService.createShortcut(
          fileId,
          sessionFolder.id,
          originalFileName
        );
        
        uploadedFiles[type] = {
          id: shortcut.id,
          name: originalFileName,
          webViewLink: shortcut.webViewLink
        };
        
        driveOrganizer.logger.info(`Shortcut created for ${type}`, {
          shortcutId: shortcut.id,
          targetId: fileId,
          fileName: originalFileName
        });
      } catch (error) {
        driveOrganizer.logger.error(`Failed to create shortcut for ${type}:`, error);
      }
    }
    
    return uploadedFiles;
  }
  
  /**
   * Get file extension based on type
   */
  static getFileExtension(type) {
    const extensions = {
      video: 'mp4',
      audio: 'm4a',
      transcript: 'vtt',
      chat: 'txt'
    };
    return extensions[type] || 'bin';
  }
}

module.exports = DriveOrganizerPatch;