const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Try to require database and other modules, but don't crash if they fail
let db, staffController, roleController, multer, upload, uploadController, teamController, clientController, branchController, serviceChargeController, journeyPlanController, payrollRoutes, financialRoutes, staffRoutes, chatRoutes, clientRoutes, salesRoutes, managerRoutes, noticeRoutes, salesRepLeaveRoutes, calendarTaskRoutes, userRoutes, loginHistoryRoutes, journeyPlanRoutes, riderRoutes, myVisibilityReportRoutes, feedbackReportRoutes, availabilityReportRoutes, leaveRequestRoutes, supplierRoutes, receiptRoutes, myAssetsRoutes, faultyProductsRoutes, storeRoutes, authRoutes, routesRoutes, webhookRoutes, competitorRoutes;

try {
  db = require('../database/db');
  staffController = require('../controllers/staffController');
  roleController = require('../controllers/roleController');
  multer = require('multer');
  upload = multer({ dest: 'uploads/' });
  uploadController = require('../controllers/uploadController');
  teamController = require('../controllers/teamController');
  clientController = require('../controllers/clientController');
  branchController = require('../controllers/branchController');
  serviceChargeController = require('../controllers/serviceChargeController');
  journeyPlanController = require('../controllers/journeyPlanController');
  payrollRoutes = require('../routes/payrollRoutes');
  financialRoutes = require('../routes/financialRoutes');
  staffRoutes = require('../routes/staffRoutes');
  chatRoutes = require('../routes/chatRoutes');
  clientRoutes = require('../routes/clientRoutes');
  salesRoutes = require('../routes/salesRoutes');
  managerRoutes = require('../routes/managerRoutes');
  noticeRoutes = require('../routes/noticeRoutes');
  salesRepLeaveRoutes = require('../routes/leaveRoutes');
  calendarTaskRoutes = require('../routes/calendarTaskRoutes');
  userRoutes = require('../routes/userRoutes');
  loginHistoryRoutes = require('../routes/loginHistoryRoutes');
  journeyPlanRoutes = require('../routes/journeyPlanRoutes');
  riderRoutes = require('../routes/riderRoutes');
  myVisibilityReportRoutes = require('../routes/myVisibilityReportRoutes');
  feedbackReportRoutes = require('../routes/feedbackReportRoutes');
  availabilityReportRoutes = require('../routes/availabilityReportRoutes');
  leaveRequestRoutes = require('../routes/leaveRequestRoutes');
  supplierRoutes = require('../routes/supplierRoutes');
  receiptRoutes = require('../routes/receiptRoutes');
  myAssetsRoutes = require('../routes/myAssetsRoutes');
  faultyProductsRoutes = require('../routes/faultyProductsRoutes');
  storeRoutes = require('../routes/storeRoutes');
  authRoutes = require('../routes/authRoutes');
  routesRoutes = require('../routes/routesRoutes');
  webhookRoutes = require('../routes/webhookRoutes');
  competitorRoutes = require('../routes/competitorRoutes');
} catch (error) {
  console.log('Some modules failed to load:', error.message);
}

const app = express();

// CORS configuration for Vercel
const corsOptions = {
  origin: [
    'https://moonsun-xi.vercel.app',
    'https://woosh-client.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running on Vercel', 
    timestamp: new Date().toISOString() 
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working on Vercel!', timestamp: new Date().toISOString() });
});

// Simple auth test endpoint
app.post('/api/auth/test', (req, res) => {
  res.json({ message: 'Auth test endpoint working!', timestamp: new Date().toISOString() });
});

// Inline login route (fallback if authRoutes fails to load)
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('Login attempt received:', req.body);
    const { username, password } = req.body;

    if (!username || !password) {
      console.log('Missing username or password');
      return res.status(400).json({ message: 'Username and password are required' });
    }

    if (!db) {
      console.error('Database not available');
      return res.status(500).json({ message: 'Database connection not available' });
    }

    // Get staff from database by name
    console.log('Querying database for staff by name:', username);
    const [staff] = await db.query('SELECT * FROM staff WHERE name = ?', [username]);

    console.log('Database query result:', staff);

    if (staff.length === 0) {
      console.log('No staff found with name:', username);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = staff[0];

    if (!user.password) {
      console.log('No password set for this staff member:', username);
      return res.status(401).json({ message: 'No password set for this staff member' });
    }

    // Compare password
    console.log('Comparing passwords...');
    const isValidPassword = await bcrypt.compare(password, user.password);
    console.log('Password comparison result:', isValidPassword);

    if (!isValidPassword) {
      console.log('Invalid password for staff:', username);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Create JWT token
    console.log('Creating JWT token for staff:', username);
    const token = jwt.sign(
      { 
        userId: user.id,
        name: user.name,
        role: user.role 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    console.log('Login successful for staff:', username);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.business_email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Debug: Log which routes are loaded
console.log('Loading routes...');
console.log('authRoutes:', !!authRoutes);
console.log('financialRoutes:', !!financialRoutes);
console.log('staffRoutes:', !!staffRoutes);
console.log('clientRoutes:', !!clientRoutes);
console.log('salesRoutes:', !!salesRoutes);
console.log('managerRoutes:', !!managerRoutes);
console.log('availabilityReportRoutes:', !!availabilityReportRoutes);
console.log('myAssetsRoutes:', !!myAssetsRoutes);
console.log('faultyProductsRoutes:', !!faultyProductsRoutes);
console.log('receiptRoutes:', !!receiptRoutes);
console.log('storeRoutes:', !!storeRoutes);
console.log('supplierRoutes:', !!supplierRoutes);
console.log('webhookRoutes:', !!webhookRoutes);
console.log('competitorRoutes:', !!competitorRoutes);

// Import and use all routes
// Note: Don't register authRoutes to avoid conflicts with inline login route
// The inline login route above serves as the main auth endpoint
// if (authRoutes) {
//   console.log('Using authRoutes');
//   app.use('/api/auth', authRoutes);
// }
if (financialRoutes) app.use('/api/financial', financialRoutes);
if (staffRoutes) app.use('/api/staff', staffRoutes);
if (routesRoutes) app.use('/api/routes', routesRoutes);
if (clientRoutes) app.use('/api/clients', clientRoutes);
if (salesRoutes) app.use('/api/sales', salesRoutes);
if (managerRoutes) app.use('/api/managers', managerRoutes);
if (availabilityReportRoutes) app.use('/api', availabilityReportRoutes);
if (myAssetsRoutes) app.use('/api/my-assets', myAssetsRoutes);
if (faultyProductsRoutes) app.use('/api/faulty-products', faultyProductsRoutes);
if (receiptRoutes) app.use('/api/receipts', receiptRoutes);
if (storeRoutes) app.use('/api/stores', storeRoutes);
if (supplierRoutes) app.use('/api/suppliers', supplierRoutes);
if (chatRoutes) app.use('/api/chat', chatRoutes);
if (webhookRoutes) app.use('/api/webhooks', webhookRoutes);
if (competitorRoutes) app.use('/api/competitors', competitorRoutes);
if (riderRoutes) app.use('/api/riders', riderRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found', 
    path: req.originalUrl,
    timestamp: new Date().toISOString() 
  });
});

module.exports = app; 