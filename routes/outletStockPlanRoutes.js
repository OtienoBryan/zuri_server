const express = require('express');
const router = express.Router();
const outletStockPlanController = require('../controllers/outletStockPlanController');

// Get all outlet stock plans
router.get('/', outletStockPlanController.getAllOutletStockPlans);

// Get outlet stock plan by ID
router.get('/:id', outletStockPlanController.getOutletStockPlan);

// Create new outlet stock plan
router.post('/', outletStockPlanController.createOutletStockPlan);

// Update outlet stock plan
router.put('/:id', outletStockPlanController.updateOutletStockPlan);

// Delete outlet stock plan
router.delete('/:id', outletStockPlanController.deleteOutletStockPlan);

module.exports = router;

