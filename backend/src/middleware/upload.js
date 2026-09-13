const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Ensure upload directories exist
const uploadDirs = ['uploads/results', 'uploads/documents', 'uploads/evidence', 'uploads/profiles'];
uploadDirs.forEach(dir => {
  const fullPath = path.join(__dirname, '..', '..', dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

const MIME_EXT_MAP = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);

// Storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let dest = 'uploads/documents';
    if (req._uploadType === 'result') dest = 'uploads/results';
    else if (req._uploadType === 'evidence') dest = 'uploads/evidence';
    else if (req._uploadType === 'profile') dest = 'uploads/profiles';
    
    const fullPath = path.join(__dirname, '..', '..', dest);
    cb(null, fullPath);
  },
  filename: (req, file, cb) => {
    const rawExt = path.extname(file.originalname || '').toLowerCase();
    const ext = ALLOWED_EXTENSIONS.has(rawExt) ? (rawExt === '.jpeg' ? '.jpg' : rawExt) : (MIME_EXT_MAP[file.mimetype] || '.bin');
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedImages = ['image/jpeg', 'image/png', 'image/webp'];
  const allowedDocs = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  const ext = path.extname(file.originalname || '').toLowerCase();
  
  if (req._uploadType === 'result' || req._uploadType === 'profile') {
    if (allowedImages.includes(file.mimetype) && ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
    }
  } else {
    if (allowedDocs.includes(file.mimetype) && ['.pdf', '.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and image files are allowed'), false);
    }
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
    files: 5
  }
});

// Middleware wrappers
const uploadResultImages = (req, res, next) => {
  req._uploadType = 'result';
  upload.array('images', 5)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

const uploadDocument = (req, res, next) => {
  req._uploadType = 'document';
  upload.single('document')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

const uploadEvidence = (req, res, next) => {
  req._uploadType = 'evidence';
  upload.array('files', 5)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

const uploadProfilePhoto = (req, res, next) => {
  req._uploadType = 'profile';
  upload.single('photo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

module.exports = { uploadResultImages, uploadDocument, uploadEvidence, uploadProfilePhoto };
