const db = require('../database/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Resend } = require('resend');

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY || 're_K1pxjovs_GPFiS82AsLzrxSkRtUcjU3Vj');

// In-memory store for password reset codes (in production, use Redis or database)
const passwordResetCodes = new Map();

const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Get staff from database by name
    const [staff] = await db.query(
      'SELECT * FROM staff WHERE name = ?',
      [username]
    );

    if (staff.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = staff[0];

    if (!user.password) {
      return res.status(401).json({ message: 'No password set for this staff member' });
    }

    // Compare password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Create JWT token
    const token = jwt.sign(
      { 
        userId: user.id,
        name: user.name,
        role: user.role 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    console.log('Login successful for user:', user.name, 'with role:', user.role);
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
    res.status(500).json({ message: 'Internal server error' });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    // Get staff from database by business_email
    const [staff] = await db.query(
      'SELECT id, name, business_email FROM staff WHERE business_email = ?',
      [email]
    );

    if (staff.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'The email does not exist' 
      });
    }

    const user = staff[0];

    // Generate a 6-digit reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 3600000; // 1 hour from now

    // Store code in memory
    passwordResetCodes.set(resetCode, {
      userId: user.id,
      username: user.name,
      email: user.business_email,
      expiresAt: expiresAt
    });

    // Clean up expired codes
    for (const [code, data] of passwordResetCodes.entries()) {
      if (data.expiresAt < Date.now()) {
        passwordResetCodes.delete(code);
      }
    }

    console.log(`Password reset code generated for user: ${user.name} (${user.business_email})`);
    
    // Send email with reset code using Resend
    try {
      const emailResult = await resend.emails.send({
        from: 'noreply@zurigas.com',
        to: user.business_email,
        subject: 'Password Reset Code - Zuri Gas',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset Code</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
              <h2 style="color: #2c3e50; margin-top: 0;">Password Reset Request</h2>
              <p>Hello ${user.name},</p>
              <p>You have requested to reset your password. Please use the following code to reset your password:</p>
              <div style="background-color: #ffffff; border: 2px dashed #3498db; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
                <h1 style="color: #3498db; font-size: 36px; letter-spacing: 8px; margin: 0;">${resetCode}</h1>
              </div>
              <p>This code will expire in <strong>1 hour</strong>.</p>
              <p>If you did not request this password reset, please ignore this email.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
              <p style="font-size: 12px; color: #999; margin: 0;">This is an automated message from Zuri Gas. Please do not reply to this email.</p>
            </div>
          </body>
          </html>
        `,
        text: `
          Password Reset Request

          Hello ${user.name},

          You have requested to reset your password. Please use the following code to reset your password:

          ${resetCode}

          This code will expire in 1 hour.

          If you did not request this password reset, please ignore this email.

          This is an automated message from Zuri Gas. Please do not reply to this email.
        `
      });

      if (emailResult.error) {
        console.error('Failed to send email:', emailResult.error);
        return res.status(500).json({ 
          success: false, 
          message: 'Failed to send reset code email. Please try again later.' 
        });
      }

      console.log('Password reset email sent successfully to:', user.business_email);
      
      res.json({ 
        success: true, 
        message: 'Password reset code has been sent to your email address. Please check your inbox.' 
      });
    } catch (emailError) {
      console.error('Error sending email:', emailError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to send reset code email. Please try again later.' 
      });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { resetCode, newPassword } = req.body;

    if (!resetCode || !newPassword) {
      return res.status(400).json({ message: 'Reset code and new password are required' });
    }

    // Validate reset code format (6 digits)
    if (!/^\d{6}$/.test(resetCode)) {
      return res.status(400).json({ message: 'Reset code must be a 6-digit number' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Check if code exists and is valid
    const codeData = passwordResetCodes.get(resetCode);

    if (!codeData) {
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }

    // Check if code has expired
    if (codeData.expiresAt < Date.now()) {
      passwordResetCodes.delete(resetCode);
      return res.status(400).json({ message: 'Reset code has expired' });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    await db.query(
      'UPDATE staff SET password = ? WHERE id = ?',
      [hashedPassword, codeData.userId]
    );

    // Remove the used code
    passwordResetCodes.delete(resetCode);

    console.log(`Password reset successful for user ID: ${codeData.userId}`);
    res.json({ 
      success: true, 
      message: 'Password has been reset successfully. You can now login with your new password.' 
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  login,
  forgotPassword,
  resetPassword
}; 