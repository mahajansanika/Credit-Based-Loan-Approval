/**
 * POST /api/upload — multipart file upload (PDF/CSV/Excel, ≤10MB) parsed
 * into applicant fields. Returns parsed fields, missing-field list and
 * parse errors so the form can pre-fill and highlight gaps.
 */
import { Router } from 'express';
import multer from 'multer';
import { parseFile, ACCEPTED_MIMETYPES, ACCEPTED_EXTENSIONS, fileExtension } from '../parsers/parserRouter.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = fileExtension(file.originalname);
    if (ACCEPTED_MIMETYPES.includes(file.mimetype) || ACCEPTED_EXTENSIONS.includes(ext)) {
      return cb(null, true);
    }
    const err = new Error('Only PDF, CSV, and Excel files accepted.');
    err.statusCode = 415;
    cb(err);
  },
});

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'NoFile', statusCode: 400, message: 'No file uploaded.' });
    }
    const parsed = await parseFile(req.file);
    res.json({ filename: req.file.originalname, ...parsed });
  } catch (err) {
    next(err);
  }
});

export default router;
