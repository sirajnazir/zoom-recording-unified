/**
 * Enhanced Webhook File Downloader with Authentication
 * Handles Zoom webhook download URLs with proper authentication
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);

class WebhookFileDownloader {
  constructor({ config, logger }) {
    this.config = config;
    this.logger = logger || console;
    this.downloadTimeout = config.downloadTimeout || 300000; // 5 minutes
    this.maxRetries = config.maxRetries || 3;
  }

  /**
   * Download file from webhook URL with authentication
   */
  async downloadFile(downloadUrl, outputPath, options = {}) {
    const { 
      fileName = 'file',
      fileType = 'unknown',
      retryCount = 0,
      accessToken = null 
    } = options;

    try {
      this.logger.info(`📥 Downloading ${fileType}: ${fileName}`);
      
      // Ensure output directory exists
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

      // Parse the download URL to check if it needs authentication
      const urlObj = new URL(downloadUrl);
      const needsAuth = urlObj.searchParams.get('access_token') || accessToken;

      // Configure axios with authentication
      const axiosConfig = {
        url: downloadUrl,
        method: 'GET',
        responseType: 'stream',
        timeout: this.downloadTimeout,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: {
          'User-Agent': 'zoom-recording-processor/1.0'
        }
      };

      // Add authentication if needed
      if (needsAuth) {
        // If access_token is in URL, axios will handle it
        // If provided separately, add as Bearer token
        if (accessToken && !urlObj.searchParams.get('access_token')) {
          axiosConfig.headers['Authorization'] = `Bearer ${accessToken}`;
        }
      }

      // Log request details (without sensitive token)
      this.logger.debug('Download request config:', {
        url: downloadUrl.replace(/access_token=[^&]+/, 'access_token=***'),
        method: axiosConfig.method,
        hasAuth: !!needsAuth
      });

      const response = await axios(axiosConfig);

      // Check response status
      if (response.status !== 200) {
        throw new Error(`Unexpected status code: ${response.status}`);
      }

      // Save the file
      await pipeline(response.data, fs.createWriteStream(outputPath));
      
      // Verify file was saved
      const stats = await fs.promises.stat(outputPath);
      this.logger.info(`✅ Downloaded ${fileName} (${this.formatBytes(stats.size)})`);
      
      return {
        success: true,
        path: outputPath,
        size: stats.size
      };

    } catch (error) {
      this.logger.error(`❌ Download failed for ${fileName}:`, error.message);
      
      // Check if it's an authentication error
      if (error.response && error.response.status === 401) {
        this.logger.error('🔐 Authentication failed. Possible causes:');
        this.logger.error('  - Expired access token');
        this.logger.error('  - Missing access token in URL');
        this.logger.error('  - Invalid webhook signature');
        
        // Don't retry auth errors
        return {
          success: false,
          error: 'Authentication failed',
          statusCode: 401
        };
      }

      // Retry logic for other errors
      if (retryCount < this.maxRetries) {
        this.logger.info(`🔄 Retrying download (${retryCount + 1}/${this.maxRetries})...`);
        await this.delay(2000 * (retryCount + 1)); // Exponential backoff
        
        return this.downloadFile(downloadUrl, outputPath, {
          ...options,
          retryCount: retryCount + 1
        });
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Extract access token from webhook download URL
   */
  extractAccessToken(downloadUrl) {
    try {
      const urlObj = new URL(downloadUrl);
      return urlObj.searchParams.get('access_token');
    } catch (error) {
      this.logger.error('Failed to parse download URL:', error.message);
      return null;
    }
  }

  /**
   * Validate webhook download URL
   */
  validateDownloadUrl(downloadUrl) {
    try {
      const urlObj = new URL(downloadUrl);
      
      // Check if it's a Zoom download URL
      const isZoomUrl = urlObj.hostname.includes('zoom.us') || 
                       urlObj.hostname.includes('zoom.com');
      
      // Check if it has authentication
      const hasToken = urlObj.searchParams.has('access_token');
      
      return {
        valid: isZoomUrl,
        hasAuthentication: hasToken,
        hostname: urlObj.hostname
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = WebhookFileDownloader;