// services/notificationService.js
const Order = require('../models/Order');
const Merchant = require('../models/Merchant');
const User = require('../models/User');

class NotificationService {
  async sendOrderNotification(order, notificationType) {
    try {
      const messages = {
        customer: {
          created: 'Your order has been placed successfully!',
          confirmed: 'Your order has been confirmed and is being prepared.',
          in_transit: 'Your order is on the way!',
          delivered: 'Your order has been delivered. Thank you for choosing Grundy!',
          payment_success: 'Payment successful! Your order is being processed.'
        },
        merchant: {
          created: 'New order received! Please check your dashboard.',
          confirmed: 'Order confirmed. Please start preparation.',
          ready: 'Order is ready for pickup by rider.'
        },
        rider: {
          assigned: 'New delivery assigned to you!',
          picked_up: 'Order picked up successfully.',
          delivered: 'Delivery completed successfully.'
        }
      };

      // Send to customer
      await this.sendCustomerNotification(order.customer.userId, {
        type: notificationType,
        message: messages.customer[notificationType],
        orderId: order.orderId
      });

      // Send to merchant
      await this.sendMerchantNotification(order.merchant.merchantId, {
        type: notificationType,
        message: messages.merchant[notificationType],
        orderId: order.orderId
      });

      // Send to rider if assigned
      if (order.delivery.riderId) {
        await this.sendRiderNotification(order.delivery.riderId, {
          type: notificationType,
          message: messages.rider[notificationType],
          orderId: order.orderId
        });
      }

    } catch (error) {
      console.error('Error sending order notification:', error);
    }
  }

  async sendCustomerNotification(userId, data) {
    try {
      const user = await User.findById(userId);
      
      // Send email
      await this.sendEmail(user.email, 'Order Update', data.message);
      
      // Send SMS
      await this.sendSMS(user.phone, data.message);
      
      // Send push notification
      await this.sendPushNotification(userId, data);

      console.log(`Notification sent to customer: ${user.email}`);

    } catch (error) {
      console.error('Error sending customer notification:', error);
    }
  }

  async sendMerchantNotification(merchantId, data) {
    try {
      const merchant = await Merchant.findById(merchantId).populate('userId');
      
      await this.sendEmail(merchant.userId.email, 'New Order', data.message);
      await this.sendSMS(merchant.contact.phone, data.message);

      console.log(`Notification sent to merchant: ${merchant.businessName}`);

    } catch (error) {
      console.error('Error sending merchant notification:', error);
    }
  }

  async sendRiderNotification(riderId, data) {
    try {
      // Implementation for rider notifications
      console.log(`Rider notification: ${data.message}`);
    } catch (error) {
      console.error('Error sending rider notification:', error);
    }
  }

  async sendEmail(to, subject, message) {
    // Integration with email service (SendGrid, AWS SES, etc.)
    console.log(`Email to ${to}: ${subject} - ${message}`);
  }

  async sendSMS(to, message) {
    // Integration with SMS service (Twilio, etc.)
    console.log(`SMS to ${to}: ${message}`);
  }

  async sendPushNotification(userId, data) {
    // Integration with push notification service (Firebase, etc.)
    console.log(`Push notification to user ${userId}:`, data);
  }

  async sendAdminAlert(subject, message) {
    // Send critical alerts to admin team
    const adminEmail = process.env.ADMIN_EMAIL;
    await this.sendEmail(adminEmail, `ALERT: ${subject}`, message);
  }
}

module.exports = NotificationService;