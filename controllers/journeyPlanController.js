const db = require('../database/db');

const journeyPlanController = {
  // Get all journey plans
  getAllJourneyPlans: async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      console.log('=== getAllJourneyPlans called ===');
      console.log('Query params:', { startDate, endDate });
      
      let dateFilter = '';
      const params = [];
      
      // Default to current date if no date filter provided
      const today = new Date().toISOString().slice(0, 10);
      
      if (startDate && endDate) {
        dateFilter = 'AND DATE(jp.date) BETWEEN ? AND ?';
        params.push(startDate, endDate);
        console.log('Using date range filter:', startDate, 'to', endDate);
      } else if (startDate) {
        dateFilter = 'AND DATE(jp.date) >= ?';
        params.push(startDate);
        console.log('Using start date filter:', startDate);
      } else if (endDate) {
        dateFilter = 'AND DATE(jp.date) <= ?';
        params.push(endDate);
        console.log('Using end date filter:', endDate);
      } else {
        // Default to current date if no filter provided
        dateFilter = 'AND DATE(jp.date) = ?';
        params.push(today);
        console.log('No date filter provided, defaulting to current date:', today);
      }
      
      // Check if we need detailed records (for visit details modal)
      const { userId: requestedUserId } = req.query;
      const needDetails = requestedUserId !== undefined;
      
      // Group by sales rep and date, showing first checkInTime and last checkoutTime
      // Exclude records where status = 0 (Pending)
      const whereClause = `WHERE jp.status != 0 ${dateFilter}`;
      
      let query = '';
      
      if (needDetails) {
        // Return individual records for visit details modal
        query = `
          SELECT 
                 jp.id,
                 DATE(jp.date) as date,
                 jp.userId,
                 jp.checkInTime,
                 jp.checkoutTime,
                 jp.imageUrl,
                 sr.name as user_name,
                 c.name as client_name,
                 c.name as client_company_name
          FROM JourneyPlan jp
          LEFT JOIN SalesRep sr ON jp.userId = sr.id
          LEFT JOIN locations c ON jp.clientId = c.id
          ${whereClause} AND jp.userId = ?
          ORDER BY jp.checkInTime ASC
        `;
        params.push(requestedUserId);
      } else {
        // Return grouped summary data
        query = `
          SELECT 
                 DATE(jp.date) as date,
                 jp.userId,
                 sr.name as user_name,
                 MIN(jp.checkInTime) as first_checkInTime,
                 MAX(jp.checkoutTime) as last_checkoutTime,
                 COUNT(jp.id) as total_visits
          FROM JourneyPlan jp
          LEFT JOIN SalesRep sr ON jp.userId = sr.id
          ${whereClause}
          GROUP BY DATE(jp.date), jp.userId, sr.name
          ORDER BY DATE(jp.date) DESC, sr.name ASC
        `;
      }
      
      console.log('Executing query with params:', params);
      console.log('Query:', query);
      
      const [plans] = await db.query(query, params);
      
      console.log('Query executed successfully. Plans count:', plans ? plans.length : 0);
      
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
        
        if (needDetails) {
          // For detailed records, normalize checkInTime and checkoutTime
          normalized.checkInTime = plan.checkInTime || plan.checkinTime || plan.check_in_time || null;
          normalized.checkoutTime = plan.checkoutTime || plan.checkouttime || plan.check_out_time || null;
        } else {
          // For grouped records, normalize first_checkInTime and last_checkoutTime
          normalized.first_checkInTime = plan.first_checkInTime || plan.first_checkintime || plan.firstCheckInTime || null;
          normalized.last_checkoutTime = plan.last_checkoutTime || plan.last_checkouttime || plan.lastCheckoutTime || null;
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
      console.error('=== ERROR in getAllJourneyPlans ===');
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('Error code:', error.code);
      console.error('Error errno:', error.errno);
      console.error('Error sqlState:', error.sqlState);
      console.error('Error sqlMessage:', error.sqlMessage);
      console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      console.error('=== END ERROR ===');
      
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch journey plans', 
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? {
          code: error.code,
          errno: error.errno,
          sqlState: error.sqlState,
          sqlMessage: error.sqlMessage
        } : undefined
      });
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
               r.name as route_name
        FROM JourneyPlan jp
        LEFT JOIN locations c ON jp.clientId = c.id
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
               r.name as route_name
        FROM JourneyPlan jp
        LEFT JOIN SalesRep s ON jp.userId = s.id
        LEFT JOIN locations c ON jp.clientId = c.id
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
               c.name as client_company_name
        FROM JourneyPlan jp
        LEFT JOIN users u ON jp.userId = u.id
        LEFT JOIN locations c ON jp.clientId = c.id
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
               c.name as client_company_name
        FROM JourneyPlan jp
        LEFT JOIN users u ON jp.userId = u.id
        LEFT JOIN locations c ON jp.clientId = c.id
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