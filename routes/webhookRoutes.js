const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Webhook route for order delivery status updates
router.post('/order-delivery-status', webhookController.handleOrderDeliveryStatus);

module.exports = router;


