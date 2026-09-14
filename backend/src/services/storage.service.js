const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const logger = require('../utils/logger');

/**
 * Parses Cloudinary configuration from environment variables.
 * Supports both CLOUDINARY_URL format and individual keys.
 */
function getCloudinaryConfig() {
  if (process.env.CLOUDINARY_URL) {
    const match = process.env.CLOUDINARY_URL.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
    if (match) {
      return {
        apiKey: match[1],
        apiSecret: match[2],
        cloudName: match[3]
      };
    }
  }

  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    return {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME.trim(),
      apiKey: process.env.CLOUDINARY_API_KEY.trim(),
      apiSecret: process.env.CLOUDINARY_API_SECRET.trim()
    };
  }

  return null;
}

/**
 * Generates official Cloudinary SHA-1 authentication signature.
 */
function generateSignature(params, apiSecret) {
  const sortedKeys = Object.keys(params).sort();
  const serialized = sortedKeys
    .filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map(k => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(serialized + apiSecret).digest('hex');
}

/**
 * Upload a file to Cloudinary with automatic fallback to local disk storage.
 * @param {Object} file Multer file object (.path, .filename, .size, .mimetype)
 * @param {string} folder Destination folder ('results', 'evidence', 'profiles', 'documents')
 * @returns {Promise<{ url: string, storage: 'cloudinary' | 'local', size: number }>}
 */
async function uploadFile(file, folder = 'results') {
  if (!file) return null;

  const localRelativeUrl = `/uploads/${folder}/${file.filename}`;
  const config = getCloudinaryConfig();

  // If Cloudinary credentials are not configured, use local disk storage immediately
  if (!config) {
    return {
      url: localRelativeUrl,
      storage: 'local',
      size: file.size
    };
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const targetFolder = `jisems/${folder}`;

    const signParams = {
      folder: targetFolder,
      timestamp: timestamp
    };

    const signature = generateSignature(signParams, config.apiSecret);

    const form = new FormData();
    form.append('file', fs.createReadStream(file.path));
    form.append('api_key', config.apiKey);
    form.append('timestamp', String(timestamp));
    form.append('folder', targetFolder);
    form.append('signature', signature);

    const uploadUrl = `https://api.cloudinary.com/v1_1/${config.cloudName}/auto/upload`;
    const response = await axios.post(uploadUrl, form, {
      headers: form.getHeaders(),
      timeout: 30000
    });

    if (response.data && response.data.secure_url) {
      logger.info(`[Cloudinary] Successfully uploaded ${file.filename} -> ${response.data.secure_url}`);

      // Delete temporary local file to keep container storage lean
      try {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (cleanupErr) {
        logger.warn('[Cloudinary] Failed to delete temp local upload file:', cleanupErr.message);
      }

      return {
        url: response.data.secure_url,
        publicId: response.data.public_id,
        storage: 'cloudinary',
        size: response.data.bytes || file.size
      };
    }

    logger.warn('[Cloudinary] Unexpected response format, falling back to local storage');
    return {
      url: localRelativeUrl,
      storage: 'local',
      size: file.size
    };
  } catch (err) {
    logger.error('[Cloudinary] Upload failed, falling back to local storage:', {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data
    });
    return {
      url: localRelativeUrl,
      storage: 'local',
      size: file.size
    };
  }
}

module.exports = {
  uploadFile,
  getCloudinaryConfig
};
