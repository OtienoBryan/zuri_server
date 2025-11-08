const db = require('../database/db');

const journeyPlanController = {
  // Get all journey plans
  getAllJourneyPlans: async (req, res) => {
    try {
      const [plans] = await db.query(`
        SELECT jp.id,
               jp.date,
               jp.time,
               jp.userId,
               jp.clientId,
               jp.status,
               jp.checkInTime as checkInTime,
               jp.checkoutTime as checkoutTime,
               jp.latitude,
               jp.longitude,
               jp.imageUrl,
               jp.notes,
               jp.checkoutLatitude,
               jp.checkoutLongitude,
               jp.showUpdateLocation,
               jp.routeId,
               jp.createdAt,
               jp.updatedAt,
               s.name as user_name,
               c.name as client_name,
               c.name as client_company_name,
               r.name as route_name
        FROM JourneyPlan jp
        LEFT JOIN SalesRep s ON jp.userId = s.id
        LEFT JOIN Clients c ON jp.clientId = c.id
        LEFT JOIN routes r ON jp.routeId = r.id
        ORDER BY jp.date DESC, jp.time ASC
      `);
      
      // Normalize field names to camelCase (MySQL might return in different cases)
      const normalizedPlans = plans.map(plan => {
        const normalized = { ...plan };
        
        // Normalize checkInTime (handle case variations)
        if (plan.checkInTime !== undefined) {
          normalized.checkInTime = plan.checkInTime;
        } else if (plan.checkinTime !== undefined) {
          normalized.checkInTime = plan.checkinTime;
          delete normalized.checkinTime;
        } else if (plan.check_in_time !== undefined) {
          normalized.checkInTime = plan.check_in_time;
          delete normalized.check_in_time;
        } else if (plan.CheckInTime !== undefined) {
          normalized.checkInTime = plan.CheckInTime;
          delete normalized.CheckInTime;
        }
        
        // Normalize checkoutTime (handle case variations)
        if (plan.checkoutTime !== undefined) {
          normalized.checkoutTime = plan.checkoutTime;
        } else if (plan.checkout_time !== undefined) {
          normalized.checkoutTime = plan.checkout_time;
          delete normalized.checkout_time;
        } else if (plan.CheckoutTime !== undefined) {
          normalized.checkoutTime = plan.CheckoutTime;
          delete normalized.CheckoutTime;
        }
        
        return normalized;
      });
      
      // Debug: Log sample data to see what's being returned
      if (normalizedPlans && normalizedPlans.length > 0) {
        console.log('Sample journey plan (first record):', JSON.stringify(normalizedPlans[0], null, 2));
        console.log('Sample journey plan keys:', Object.keys(normalizedPlans[0]));
        // Count how many have checkInTime
        const withCheckIn = normalizedPlans.filter(p => p.checkInTime).length;
        const withCheckOut = normalizedPlans.filter(p => p.checkoutTime).length;
        console.log(`Total plans: ${normalizedPlans.length}, Plans with checkInTime: ${withCheckIn}, Plans with checkoutTime: ${withCheckOut}`);
        
        // Log a sample that has checkInTime if available
        const sampleWithCheckIn = normalizedPlans.find(p => p.checkInTime);
        if (sampleWithCheckIn) {
          console.log('Sample plan with checkInTime:', {
            id: sampleWithCheckIn.id,
            clientId: sampleWithCheckIn.clientId,
            checkInTime: sampleWithCheckIn.checkInTime,
            checkoutTime: sampleWithCheckIn.checkoutTime,
            checkInTimeType: typeof sampleWithCheckIn.checkInTime
          });
        }
      }
      
      res.json({ success: true, data: normalizedPlans });
    } catch (error) {
      console.error('Get all journey plans error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch journey plans', error: error.message });
    }
  },

  // Get journey plans by user ID
  getJourneyPlansByUser: async (req, res) => {
    try {
      const { userId } = req.params;
      const [plans] = await db.query(`
        SELECT jp.*, 
               c.name as client_name,
               c.name as client_company_name,
               c.address as client_address,
               r.name as route_name
        FROM JourneyPlan jp
        LEFT JOIN Clients c ON jp.clientId = c.id
        LEFT JOIN routes r ON jp.routeId = r.id
        WHERE jp.userId = ?
        ORDER BY jp.date ASC, jp.time ASC
      `, [userId]);
      
      res.json({ success: true, data: plans });
    } catch (error) {
      console.error('Get journey plans by user error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch journey plans', error: error.message });
    }
  },

  // Get journey plan by ID
  getJourneyPlan: async (req, res) => {
    try {
      const { id } = req.params;
      const [plans] = await db.query(`
        SELECT jp.*, 
               s.name as user_name,
               c.name as client_name,
               c.name as client_company_name,
               c.address as client_address,
               c.email as client_email,
               c.contact as client_contact,
               r.name as route_name
        FROM JourneyPlan jp
        LEFT JOIN SalesRep s ON jp.userId = s.id
        LEFT JOIN Clients c ON jp.clientId = c.id
        LEFT JOIN routes r ON jp.routeId = r.id
        WHERE jp.id = ?
      `, [id]);
      
      if (plans.length === 0) {
        return res.status(404).json({ success: false, message: 'Journey plan not found' });
      }
      res.json({ success: true, data: plans[0] });
    } catch (error) {
      console.error('Get journey plan error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch journey plans', error: error.message });
    }
  },

  // Create new journey plan
  createJourneyPlan: async (req, res) => {
    try {
      const {
        date,
        time,
        userId,
        clientId,
        status = 0,
        notes,
        showUpdateLocation = true,
        routeId,
        latitude,
        longitude
      } = req.body;

      if (!date || !time || !userId || !clientId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Required fields missing: date, time, userId, clientId' 
        });
      }

      // Combine date and time into datetime
      const dateTime = `${date} ${time}:00`;

      const [result] = await db.query(`
        INSERT INTO JourneyPlan (
          date, time, userId, clientId, status, notes, 
          showUpdateLocation, routeId, latitude, longitude, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, [dateTime, time, userId, clientId, status, notes, showUpdateLocation, routeId, latitude, longitude]);

      // Fetch the created journey plan
      const [newPlan] = await db.query(`
        SELECT jp.*, 
               u.name as user_name,
               c.name as client_name,
               c.company_name as client_company_name
        FROM JourneyPlan jp
        LEFT JOIN users u ON jp.userId = u.id
        LEFT JOIN Clients c ON jp.clientId = c.id
        WHERE jp.id = ?
      `, [result.insertId]);

      res.status(201).json({ 
        success: true, 
        message: 'Journey plan created successfully',
        data: newPlan[0]
      });
    } catch (error) {
      console.error('Create journey plan error:', error);
      res.status(500).json({ success: false, message: 'Failed to create journey plan', error: error.message });
    }
  },

  // Update journey plan
  updateJourneyPlan: async (req, res) => {
    try {
      const { id } = req.params;
      const {
        date,
        time,
        status,
        notes,
        checkInTime,
        latitude,
        longitude,
        imageUrl,
        checkoutLatitude,
        checkoutLongitude,
        checkoutTime,
        showUpdateLocation,
        routeId
      } = req.body;

      // Build dynamic UPDATE query
      const updates = [];
      const values = [];

      if (date !== undefined) { updates.push('date = ?'); values.push(date); }
      if (time !== undefined) { updates.push('time = ?'); values.push(time); }
      if (status !== undefined) { updates.push('status = ?'); values.push(status); }
      if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }
      if (checkInTime !== undefined) { updates.push('checkInTime = ?'); values.push(checkInTime); }
      if (latitude !== undefined) { updates.push('latitude = ?'); values.push(latitude); }
      if (longitude !== undefined) { updates.push('longitude = ?'); values.push(longitude); }
      if (imageUrl !== undefined) { updates.push('imageUrl = ?'); values.push(imageUrl); }
      if (checkoutLatitude !== undefined) { updates.push('checkoutLatitude = ?'); values.push(checkoutLatitude); }
      if (checkoutLongitude !== undefined) { updates.push('checkoutLongitude = ?'); values.push(checkoutLongitude); }
      if (checkoutTime !== undefined) { updates.push('checkoutTime = ?'); values.push(checkoutTime); }
      if (showUpdateLocation !== undefined) { updates.push('showUpdateLocation = ?'); values.push(showUpdateLocation); }
      if (routeId !== undefined) { updates.push('routeId = ?'); values.push(routeId); }

      if (updates.length === 0) {
        return res.status(400).json({ success: false, message: 'No fields provided for update' });
      }

      updates.push('updatedAt = NOW()');
      values.push(id);

      await db.query(
        `UPDATE JourneyPlan SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      // Fetch the updated journey plan
      const [updatedPlan] = await db.query(`
        SELECT jp.*, 
               u.name as user_name,
               c.name as client_name,
               c.company_name as client_company_name
        FROM JourneyPlan jp
        LEFT JOIN users u ON jp.userId = u.id
        LEFT JOIN Clients c ON jp.clientId = c.id
        WHERE jp.id = ?
      `, [id]);

      res.json({ 
        success: true, 
        message: 'Journey plan updated successfully',
        data: updatedPlan[0]
      });
    } catch (error) {
      console.error('Update journey plan error:', error);
      res.status(500).json({ success: false, message: 'Failed to update journey plan', error: error.message });
    }
  },

  // Delete journey plan
  deleteJourneyPlan: async (req, res) => {
    try {
      const { id } = req.params;
      
      const [result] = await db.query('DELETE FROM JourneyPlan WHERE id = ?', [id]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Journey plan not found' });
      }
      
      res.json({ success: true, message: 'Journey plan deleted successfully' });
    } catch (error) {
      console.error('Delete journey plan error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete journey plan', error: error.message });
    }
  },

  // Check in to a journey plan
  checkIn: async (req, res) => {
    try {
      const { id } = req.params;
      const { latitude, longitude, imageUrl, notes } = req.body;

      const updateData = {
        checkInTime: new Date().toISOString(),
        status: 1, // In Progress
        updatedAt: new Date().toISOString()
      };

      if (latitude !== undefined) updateData.latitude = latitude;
      if (longitude !== undefined) updateData.longitude = longitude;
      if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
      if (notes !== undefined) updateData.notes = notes;

      const updates = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
      const values = [...Object.values(updateData), id];

      await db.query(
        `UPDATE JourneyPlan SET ${updates} WHERE id = ?`,
        values
      );

      res.json({ success: true, message: 'Check-in successful' });
    } catch (error) {
      console.error('Check-in error:', error);
      res.status(500).json({ success: false, message: 'Failed to check-in', error: error.message });
    }
  },

  // Check out from a journey plan
  checkOut: async (req, res) => {
    try {
      const { id } = req.params;
      const { latitude, longitude, notes } = req.body;

      const updateData = {
        checkoutTime: new Date().toISOString(),
        status: 2, // Completed
        updatedAt: new Date().toISOString()
      };

      if (latitude !== undefined) updateData.checkoutLatitude = latitude;
      if (longitude !== undefined) updateData.checkoutLongitude = longitude;
      if (notes !== undefined) updateData.notes = notes;

      const updates = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
      const values = [...Object.values(updateData), id];

      await db.query(
        `UPDATE JourneyPlan SET ${updates} WHERE id = ?`,
        values
      );

      res.json({ success: true, message: 'Check-out successful' });
    } catch (error) {
      console.error('Check-out error:', error);
      res.status(500).json({ success: false, message: 'Failed to check-out', error: error.message });
    }
  }
};

module.exports = journeyPlanController; 