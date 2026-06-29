import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Setup local uploads dir
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Cloudinary config (if present)
const isCloudinaryConfigured = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export const uploadBase64 = async (base64String, resourceType = 'auto') => {
  if (!base64String) return null;

  if (isCloudinaryConfigured) {
    try {
      const result = await cloudinary.uploader.upload(base64String, {
        resource_type: resourceType,
        folder: 'digital_roots_xz',
      });
      return result.secure_url;
    } catch (error) {
      console.warn('Cloudinary upload failed, falling back to local storage:', error.message);
    }
  }

  // Fallback to local upload
  try {
    const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let mimeType = 'application/octet-stream';
    let base64Data = base64String;

    if (matches && matches.length === 3) {
      mimeType = matches[1];
      base64Data = matches[2];
    } else {
      // If it's a raw base64 string without data prefix, strip possible metadata manually
      if (base64String.includes(';base64,')) {
        const parts = base64String.split(';base64,');
        mimeType = parts[0].replace('data:', '');
        base64Data = parts[1];
      }
    }

    // Determine extension
    let ext = 'bin';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
    else if (mimeType.includes('png')) ext = 'png';
    else if (mimeType.includes('webp')) ext = 'webp';
    else if (mimeType.includes('mp4')) ext = 'mp4';
    else if (mimeType.includes('webm')) ext = 'webm';
    else if (mimeType.includes('ogg')) ext = 'ogg';
    else if (mimeType.includes('wav')) ext = 'wav';
    else if (mimeType.includes('mp3')) ext = 'mp3';

    const filename = `${crypto.randomUUID()}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    await fs.promises.writeFile(filePath, base64Data, 'base64');
    
    const port = process.env.PORT || 5000;
    return `http://localhost:${port}/uploads/${filename}`;
  } catch (error) {
    console.error('Local upload failed:', error);
    throw new Error('Upload failed: ' + error.message);
  }
};
