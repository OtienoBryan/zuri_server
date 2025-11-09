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
               jp.checkInTime,
               jp.checkoutTime,
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
      
      // Debug: Check what MySQL actually returns
      if (plans && plans.length > 0) {
        console.log('=== RAW MYSQL DATA ===');
        console.log('First plan from MySQL (full object):', JSON.stringify(plans[0], null, 2));
        console.log('Keys in first plan:', Object.keys(plans[0]));
        const checkKeys = Object.keys(plans[0]).filter(k => 
          k.toLowerCase().includes('check') || k.toLowerCase().includes('time')
        );
        console.log('Keys with "check" or "time":', checkKeys);
        checkKeys.forEach(key => {
          const value = plans[0][key];
          console.log(`  ${key}:`, value, 'Type:', typeof value, 'IsNull:', value === null, 'IsUndefined:', value === undefined);
        });
        
        // Check a few more plans to see if any have non-null checkInTime
        const plansWithCheckIn = plans.filter(p => {
          const checkIn = p.checkInTime || p.checkinTime || p.check_in_time || p.CheckInTime;
          return checkIn != null && checkIn !== 'null' && checkIn !== '';
        });
        console.log(`Plans with non-null checkInTime in raw data: ${plansWithCheckIn.length} out of ${plans.length}`);
        if (plansWithCheckIn.length > 0) {
          console.log('Sample plan WITH checkInTime (raw):', JSON.stringify(plansWithCheckIn[0], null, 2));
        }
        console.log('=== END RAW MYSQL DATA ===');
      }
      
      // Also check database directly for checkInTime statistics
      try {
        const [stats] = await db.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(checkInTime) as with_check_in,
            COUNT(*) - COUNT(checkInTime) as without_check_in
          FROM JourneyPlan
          WHERE date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        `);
        console.log('=== DATABASE STATISTICS (last 30 days) ===');
        console.log('Total journey plans:', stats[0]?.total || 0);
        console.log('Plans with checkInTime:', stats[0]?.with_check_in || 0);
        console.log('Plans without checkInTime:', stats[0]?.without_check_in || 0);
        console.log('=== END DATABASE STATISTICS ===');
      } catch (statsError) {
        console.error('Error getting database statistics:', statsError);
      }
      
      // Normalize field names to camelCase (MySQL might return in different cases)
      const normalizedPlans = plans.map(plan => {
        const normalized = { ...plan };
        
        // Get all keys from the plan object
        const planKeys = Object.keys(plan);
        
        // Normalize checkInTime (handle case variations) - case-insensitive search
        // MySQL might return column names in different cases depending on configuration
        let checkInTimeValue = null;
        let checkInTimeKey = null;
        
        // Check if 'checkInTime' exists as a key (even if value is null)
        if ('checkInTime' in plan) {
          checkInTimeKey = 'checkInTime';
          checkInTimeValue = plan.checkInTime; // This can be null, and that's OK
        } else {
          // Case-insensitive search through all keys
          // MySQL might return: checkInTime, checkinTime, CHECKINTIME, etc.
          checkInTimeKey = planKeys.find(key => {
            const keyNormalized = key.toLowerCase().replace(/[_-]/g, '');
            return keyNormalized === 'checkintime';
          });
          
          if (checkInTimeKey) {
            checkInTimeValue = plan[checkInTimeKey];
          }
        }
        
        // Always set checkInTime in normalized object (even if null or undefined)
        // This ensures the field exists in the response
        normalized.checkInTime = checkInTimeValue;
        
        // Remove duplicate keys if we found it under a different name
        if (checkInTimeKey && checkInTimeKey !== 'checkInTime') {
          // Don't delete if it's the same object reference
          if (checkInTimeKey in normalized && normalized[checkInTimeKey] !== normalized.checkInTime) {
            delete normalized[checkInTimeKey];
          }
        }
        
        // Normalize checkoutTime (handle case variations) - case-insensitive search
        let checkoutTimeValue = null;
        let checkoutTimeKey = null;
        
        // Check if 'checkoutTime' exists as a key (even if value is null)
        if ('checkoutTime' in plan) {
          checkoutTimeKey = 'checkoutTime';
          checkoutTimeValue = plan.checkoutTime; // This can be null, and that's OK
        } else {
          // Case-insensitive search through all keys
          checkoutTimeKey = planKeys.find(key => {
            const keyNormalized = key.toLowerCase().replace(/[_-]/g, '');
            return keyNormalized === 'checkouttime';
          });
          
          if (checkoutTimeKey) {
            checkoutTimeValue = plan[checkoutTimeKey];
          }
        }
        
        // Always set checkoutTime in normalized object (even if null or undefined)
        normalized.checkoutTime = checkoutTimeValue;
        
        // Remove duplicate keys if we found it under a different name
        if (checkoutTimeKey && checkoutTimeKey !== 'checkoutTime') {
          if (checkoutTimeKey in normalized && normalized[checkoutTimeKey] !== normalized.checkoutTime) {
            delete normalized[checkoutTimeKey];
          }
        }
        
        return normalized;
      });
      
      // Debug: Log sample data to see what's being returned
      if (normalizedPlans && normalizedPlans.length > 0) {
        console.log('=== BACKEND: Journey Plans Normalization ===');
        console.log('Total plans:', normalizedPlans.length);
        
        // Check raw data from database (before normalization)
        if (plans && plans.length > 0) {
          console.log('Raw plan keys (from DB):', Object.keys(plans[0]));
          const rawKeysWithCheck = Object.keys(plans[0]).filter(k => 
            k.toLowerCase().includes('check') || k.toLowerCase().includes('time')
          );
          console.log('Raw keys containing "check" or "time":', rawKeysWithCheck);
          rawKeysWithCheck.forEach(key => {
            console.log(`  Raw ${key}:`, plans[0][key], 'Type:', typeof plans[0][key]);
          });
        }
        
        // Check normalized data
        console.log('Normalized plan keys:', Object.keys(normalizedPlans[0]));
        const normalizedKeysWithCheck = Object.keys(normalizedPlans[0]).filter(k => 
          k.toLowerCase().includes('check') || k.toLowerCase().includes('time')
        );
        console.log('Normalized keys containing "check" or "time":', normalizedKeysWithCheck);
        normalizedKeysWithCheck.forEach(key => {
          console.log(`  Normalized ${key}:`, normalizedPlans[0][key], 'Type:', typeof normalizedPlans[0][key]);
        });
        
        // Count how many have checkInTime (including null checks)
        const withCheckIn = normalizedPlans.filter(p => {
          const hasValue = p.checkInTime != null && p.checkInTime !== '' && p.checkInTime !== 'null';
          return hasValue;
        }).length;
        const withCheckOut = normalizedPlans.filter(p => {
          const hasValue = p.checkoutTime != null && p.checkoutTime !== '' && p.checkoutTime !== 'null';
          return hasValue;
        }).length;
        const withNullCheckIn = normalizedPlans.filter(p => p.checkInTime === null || p.checkInTime === undefined).length;
        console.log(`Plans with checkInTime (non-null): ${withCheckIn}, Plans with null checkInTime: ${withNullCheckIn}, Plans with checkoutTime: ${withCheckOut}`);
        
        // Log a sample that has checkInTime if available
        const sampleWithCheckIn = normalizedPlans.find(p => {
          return p.checkInTime != null && p.checkInTime !== '' && p.checkInTime !== 'null';
        });
        if (sampleWithCheckIn) {
          console.log('Sample plan WITH checkInTime:', JSON.stringify({
            id: sampleWithCheckIn.id,
            userId: sampleWithCheckIn.userId,
            clientId: sampleWithCheckIn.clientId,
            date: sampleWithCheckIn.date,
            checkInTime: sampleWithCheckIn.checkInTime,
            checkoutTime: sampleWithCheckIn.checkoutTime,
            checkInTimeType: typeof sampleWithCheckIn.checkInTime
          }, null, 2));
        } else {
          console.log('WARNING: No plans found with non-null checkInTime after normalization!');
          // Show first few plans to debug
          console.log('First 5 normalized plans sample:', normalizedPlans.slice(0, 5).map(p => ({
            id: p.id,
            userId: p.userId,
            date: p.date,
            checkInTime: p.checkInTime,
            checkInTimeType: typeof p.checkInTime,
            checkInTimeIsNull: p.checkInTime === null,
            checkInTimeIsUndefined: p.checkInTime === undefined,
            hasCheckInTimeKey: 'checkInTime' in p,
            allKeys: Object.keys(p)
          })));
        }
        console.log('=== END BACKEND DEBUG ===');
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