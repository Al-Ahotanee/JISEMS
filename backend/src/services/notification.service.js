const nodemailer = require('nodemailer');
const { pool } = require('../config/database');
const logger = require('../utils/logger');

class NotificationService {
  constructor() {
    this.emailTransporter = null;
    if (process.env.SMTP_HOST) {
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        disableFileAccess: true,
        disableUrlAccess: true
      });
    }

    this.smsConfig = process.env.AT_API_KEY && process.env.AT_USERNAME
      ? {
          apiKey: process.env.AT_API_KEY,
          username: process.env.AT_USERNAME,
          senderId: process.env.AT_SENDER_ID || 'GSEM'
        }
      : null;

    this.webPush = null;
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      try {
        const webPush = require('web-push');
        webPush.setVapidDetails(
          process.env.VAPID_SUBJECT || 'mailto:admin@gsem.ng',
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY
        );
        this.webPush = webPush;
      } catch (err) {
        logger.warn('Web Push not configured:', err.message);
      }
    }
  }

  async createNotification(userId, title, message, type, referenceType = null, referenceId = null) {
    try {
      const [result] = await pool.query(
        `INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, title, message, type, referenceType, referenceId]
      );
      return result.insertId;
    } catch (error) {
      logger.error('Failed to create notification:', error);
      return null;
    }
  }

  async createBulkNotifications(userIds, title, message, type, referenceType = null, referenceId = null) {
    if (!Array.isArray(userIds) || userIds.length === 0) return;
    try {
      const row = '(?, ?, ?, ?, ?, ?)';
      const values = userIds.map(() => row).join(', ');
      const params = userIds.flatMap(userId => [userId, title, message, type, referenceType, referenceId]);
      await pool.query(
        `INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id)
         VALUES ${values}`,
        params
      );
    } catch (error) {
      logger.error('Failed to create bulk notifications:', error);
    }
  }

  async sendEmail(to, subject, html) {
    if (!this.emailTransporter) {
      logger.debug('Email not configured, skipping email send');
      return false;
    }
    try {
      await this.emailTransporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@gsem.ng',
        to,
        subject: `[GSEM] ${subject}`,
        html
      });
      logger.info(`Email sent to ${to}: ${subject}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send email to ${to}:`, error);
      return false;
    }
  }

  async sendSMS(phone, message) {
    if (!this.smsConfig) {
      logger.debug('SMS not configured, skipping SMS send');
      return false;
    }
    try {
      const body = new URLSearchParams({
        username: this.smsConfig.username,
        to: phone,
        message: `GSEM: ${message}`,
        from: this.smsConfig.senderId
      });
      const response = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          apiKey: this.smsConfig.apiKey
        },
        body
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`Africa's Talking responded with ${response.status}`);
      logger.info(`SMS sent to ${phone}`);
      return Boolean(payload);
    } catch (error) {
      logger.error(`Failed to send SMS to ${phone}:`, error);
      return false;
    }
  }

  async sendPush(userId, title, body, data = {}) {
    if (!this.webPush) {
      logger.debug('Web Push not configured, skipping push send');
      return false;
    }
    try {
      const [subs] = await pool.query(
        'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
        [userId]
      );

      for (const sub of subs) {
        try {
          await this.webPush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title, body, data })
          );
        } catch (err) {
          if (err.statusCode === 410) {
            await pool.query('DELETE FROM push_subscriptions WHERE endpoint = ?', [sub.endpoint]);
          }
          logger.error(`Push notification failed for user ${userId}:`, err.message);
        }
      }
      return true;
    } catch (error) {
      logger.error(`Failed to send push to user ${userId}:`, error);
      return false;
    }
  }

  async notify(userId, title, message, type, referenceType = null, referenceId = null) {
    await this.createNotification(userId, title, message, type, referenceType, referenceId);
    try {
      const [prefs] = await pool.query(
        'SELECT email_enabled, sms_enabled, push_enabled FROM notification_preferences WHERE user_id = ? AND notification_type = ?',
        [userId, type]
      );
      const pref = prefs[0] || { email_enabled: true, sms_enabled: true, push_enabled: true };
      const [users] = await pool.query('SELECT email, phone FROM users WHERE id = ?', [userId]);
      const user = users[0];
      if (pref.email_enabled && user?.email) void this.sendEmail(user.email, title, `<h3>${title}</h3><p>${message}</p>`);
      if (pref.sms_enabled && user?.phone) void this.sendSMS(user.phone, `${title}: ${message}`);
      if (pref.push_enabled) void this.sendPush(userId, title, message, { type, referenceType, referenceId });
    } catch (error) {
      logger.error('Error checking notification preferences:', error);
    }
  }

  async notifyByRole(role, title, message, type, referenceType = null, referenceId = null, lgaId = null) {
    try {
      let query = 'SELECT id FROM users WHERE role = ? AND status = ?';
      const params = [role, 'active'];
      if (lgaId) {
        query += ' AND lga_id = ?';
        params.push(lgaId);
      }
      const [users] = await pool.query(query, params);
      for (const user of users) {
        await this.notify(user.id, title, message, type, referenceType, referenceId);
      }
    } catch (error) {
      logger.error('Error notifying by role:', error);
    }
  }
}

module.exports = new NotificationService();
