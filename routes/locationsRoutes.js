const express = require('express');
const router = express.Router();
const locationsController = require('../controllers/locationsController');

// Authentication middleware (you may need to adjust this based on your auth setup)
const authenticateToken = (req, res, next) => {
  // Add your authentication logic here
  // For now, we'll skip authentication for development
  next();
};

// Apply authentication to all routes
router.use(authenticateToken);

// Locations endpoints
router.get('/', locationsController.getAllLocations);
router.get('/:id', locationsController.getLocationById);
router.post('/', locationsController.createLocation);
router.put('/:id', locationsController.updateLocation);
router.delete('/:id', locationsController.deleteLocation);

module.exports = router;
