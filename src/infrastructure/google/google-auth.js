const { google } = require('googleapis');
const config = require('../../shared/config');

let authClient = null;

/**
 * Get Google Auth client
 */
function getGoogleAuth() {
    if (authClient) {
        return authClient;
    }

    try {
        // Try different credential sources
        let credentials = null;
        
        // Option 1: Base64 encoded credentials
        if (process.env.GOOGLE_CREDENTIALS_BASE64) {
            const decoded = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString();
            credentials = JSON.parse(decoded);
        }
        // Option 2: JSON string
        else if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
            credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        }
        // Option 3: Use config
        else if (config.google?.credentials) {
            credentials = config.google.credentials;
        }
        // Option 4: File path
        else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            // GoogleAuth will read from file automatically
            authClient = new google.auth.GoogleAuth({
                keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
                scopes: [
                    'https://www.googleapis.com/auth/drive',
                    'https://www.googleapis.com/auth/spreadsheets'
                ]
            });
            return authClient;
        }

        if (!credentials) {
            throw new Error('No Google credentials found');
        }

        // Create auth client with credentials
        authClient = new google.auth.GoogleAuth({
            credentials: credentials,
            scopes: [
                'https://www.googleapis.com/auth/drive',
                'https://www.googleapis.com/auth/spreadsheets'
            ]
        });

        return authClient;

    } catch (error) {
        console.error('Failed to initialize Google Auth:', error);
        throw new Error(`Google Auth initialization failed: ${error.message}`);
    }
}

/**
 * Reset auth client (useful for testing)
 */
function resetGoogleAuth() {
    authClient = null;
}

/**
 * Validate Google credentials
 */
async function validateGoogleCredentials() {
    try {
        const auth = getGoogleAuth();
        const client = await auth.getClient();
        
        // Try a simple API call to verify credentials work
        const drive = google.drive({ version: 'v3', auth: client });
        await drive.files.list({
            pageSize: 1,
            fields: 'files(id)'
        });
        
        return true;
    } catch (error) {
        console.error('Google credentials validation failed:', error);
        return false;
    }
}

/**
 * Get authenticated client for specific service
 */
async function getAuthenticatedClient(serviceName) {
    try {
        const auth = getGoogleAuth();
        const client = await auth.getClient();
        
        switch (serviceName.toLowerCase()) {
            case 'drive':
                return google.drive({ version: 'v3', auth: client });
            case 'sheets':
            case 'spreadsheets':
                return google.sheets({ version: 'v4', auth: client });
            case 'docs':
                return google.docs({ version: 'v1', auth: client });
            case 'gmail':
                return google.gmail({ version: 'v1', auth: client });
            default:
                throw new Error(`Unsupported service: ${serviceName}`);
        }
    } catch (error) {
        console.error(`Failed to get authenticated client for ${serviceName}:`, error);
        throw error;
    }
}

/**
 * Get access token
 */
async function getAccessToken() {
    try {
        const auth = getGoogleAuth();
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        return token.token;
    } catch (error) {
        console.error('Failed to get access token:', error);
        throw error;
    }
}

/**
 * Check if credentials are available
 */
function hasCredentials() {
    try {
        return !!(
            process.env.GOOGLE_CREDENTIALS_BASE64 ||
            process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
            config.google?.credentials ||
            process.env.GOOGLE_APPLICATION_CREDENTIALS
        );
    } catch (error) {
        return false;
    }
}

/**
 * Get credential source info
 */
function getCredentialSource() {
    if (process.env.GOOGLE_CREDENTIALS_BASE64) {
        return 'GOOGLE_CREDENTIALS_BASE64';
    }
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        return 'GOOGLE_SERVICE_ACCOUNT_JSON';
    }
    if (config.google?.credentials) {
        return 'config.google.credentials';
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        return 'GOOGLE_APPLICATION_CREDENTIALS';
    }
    return 'none';
}

/**
 * Get scopes for current auth client
 */
function getScopes() {
    return [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets'
    ];
}

/**
 * Add additional scopes
 */
function addScopes(newScopes) {
    if (!Array.isArray(newScopes)) {
        newScopes = [newScopes];
    }
    
    const currentScopes = getScopes();
    const allScopes = [...new Set([...currentScopes, ...newScopes])];
    
    // Reset auth client to use new scopes
    resetGoogleAuth();
    
    // Update config with new scopes
    if (config.google) {
        config.google.scopes = allScopes;
    }
    
    return allScopes;
}

/**
 * Test Google API connectivity
 */
async function testConnectivity() {
    try {
        const auth = getGoogleAuth();
        const client = await auth.getClient();
        
        // Test Drive API
        const drive = google.drive({ version: 'v3', auth: client });
        await drive.about.get({ fields: 'user' });
        
        return {
            success: true,
            message: 'Google API connectivity test passed',
            services: ['drive']
        };
    } catch (error) {
        return {
            success: false,
            message: `Google API connectivity test failed: ${error.message}`,
            error: error
        };
    }
}

/**
 * Get auth client info
 */
function getAuthInfo() {
    return {
        hasCredentials: hasCredentials(),
        credentialSource: getCredentialSource(),
        scopes: getScopes(),
        isInitialized: !!authClient
    };
}

module.exports = {
    getGoogleAuth,
    resetGoogleAuth,
    validateGoogleCredentials,
    getAuthenticatedClient,
    getAccessToken,
    hasCredentials,
    getCredentialSource,
    getScopes,
    addScopes,
    testConnectivity,
    getAuthInfo
}; 