const db = require('../database/db');
const path = require('path');
const fs = require('fs');
// Uncomment if using cloudinary
const cloudinary = require('../config/cloudinary');

const documentController = {
  uploadDocument: async (req, res) => {
    try {
      console.log('📤 Document upload request received');
      console.log('📤 Request body:', req.body);
      console.log('📤 Request file:', req.file ? 'File present' : 'No file');
      
      const { title, category, description } = req.body;
      if (!title || !category || !req.file) {
        console.log('❌ Missing required fields:', { title: !!title, category: !!category, file: !!req.file });
        return res.status(400).json({ message: 'Title, category, and file are required.' });
      }
      
      const { originalname, buffer, mimetype } = req.file;
      console.log('📤 Uploading document:', { title, category, originalname, mimetype, bufferSize: buffer.length });
      
      // Check if Cloudinary is properly configured
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;
      const fileStorageType = process.env.FILE_STORAGE_TYPE || 'cloudinary';
      
      console.log('🔧 Environment check:', {
        cloudName: !!cloudName,
        apiKey: !!apiKey,
        apiSecret: !!apiSecret,
        fileStorageType
      });
      
      let fileUrl;
      
      if (fileStorageType === 'local' || !cloudName || !apiKey || !apiSecret) {
        // Use local file storage
        console.log('Using local file storage for document...');
        
        // Create uploads directory if it doesn't exist
        const uploadsDir = path.join(__dirname, '../uploads/documents');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        
        // Generate unique filename
        const timestamp = Date.now();
        const sanitizedName = originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `doc_${timestamp}_${sanitizedName}`;
        const filePath = path.join(uploadsDir, filename);
        
        // Save file locally
        fs.writeFileSync(filePath, buffer);
        
        // Create URL for local file
        fileUrl = `/uploads/documents/${filename}`;
        console.log('Local document saved:', filePath);
      } else {
        // Use Cloudinary with buffer
        console.log('Using Cloudinary upload for document...');
        const stream = require('stream');
        
        // Create a promise to handle the async upload
        const uploadPromise = new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: 'documents',
              resource_type: 'auto',
              public_id: `${Date.now()}_${originalname}`.replace(/\s+/g, '_'),
            },
            (error, result) => {
              if (error) {
                console.error('❌ Cloudinary upload error:', error);
                reject(error);
              } else {
                console.log('✅ File uploaded successfully:', result.secure_url);
                fileUrl = result.secure_url;
                resolve(result);
              }
            }
          );

          const bufferStream = new stream.PassThrough();
          bufferStream.end(buffer);
          bufferStream.pipe(uploadStream);
        });

        // Wait for upload to complete
        await uploadPromise;
      }
      
      // Save metadata to DB
      console.log('💾 Saving to database:', { title, category, fileUrl, description });
      await db.query(
        'INSERT INTO documents (title, category, file_url, description, uploaded_at) VALUES (?, ?, ?, ?, NOW())',
        [title, category, fileUrl, description || null]
      );
      
      console.log('✅ Document saved to database successfully');
      res.status(201).json({ message: 'Document uploaded successfully', file_url: fileUrl });
    } catch (error) {
      console.error('Document upload error:', error);
      res.status(500).json({ message: 'Failed to upload document', error: error.message });
    }
  },
  getAllDocuments: async (req, res) => {
    try {
      const [rows] = await db.query('SELECT id, title, category, file_url, description, uploaded_at FROM documents ORDER BY uploaded_at DESC');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch documents', error: error.message });
    }
  },

  deleteDocument: async (req, res) => {
    try {
      const { id } = req.params;
      
      // First, get the document to retrieve the file URL for cleanup
      const [rows] = await db.query('SELECT file_url FROM documents WHERE id = ?', [id]);
      
      if (rows.length === 0) {
        return res.status(404).json({ message: 'Document not found' });
      }
      
      const document = rows[0];
      
      // Delete from database
      await db.query('DELETE FROM documents WHERE id = ?', [id]);
      
      // Optional: Delete from Cloudinary (uncomment if you want to remove files from cloud storage)
      // try {
      //   const publicId = document.file_url.split('/').pop().split('.')[0];
      //   await cloudinary.uploader.destroy(`documents/${publicId}`);
      // } catch (cloudinaryError) {
      //   console.warn('Failed to delete file from Cloudinary:', cloudinaryError.message);
      // }
      
      res.json({ message: 'Document deleted successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to delete document', error: error.message });
    }
  },
};

module.exports = documentController; 