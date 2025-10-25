// controllers/riderController.js
const Rider = require('../models/Rider');
const Order = require('../models/Order');
const NotificationService = require('../services/notificationService');

const notificationService = new NotificationService();

class RiderController {
  async updateLocation(req, res) {
    try {
      const riderId = req.user.riderId;
      const { lat, lng } = req.body;

      await Rider.findByIdAndUpdate(riderId, {
        'location.coordinates': { lat, lng },
        'location.lastUpdated': new Date()
      });

      res.json({
        success: true,
        message: 'Location updated successfully'
      });

    } catch (error) {
      console.error('Update rider location error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getAvailableOrders(req, res) {
    try {
      const riderId = req.user.riderId;
      const { lat, lng } = req.query;

      // Find orders that need delivery assignment
      // In production, this would use geospatial queries
      const orders = await Order.find({
        'delivery.status': 'ready',
        'delivery.riderId': { $exists: false }
      })
      .populate('merchant.merchantId', 'businessName market.location')
      .populate('customer.userId', 'name address')
      .limit(10);

      res.json({
        success: true,
        orders
      });

    } catch (error) {
      console.error('Get available orders error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async acceptOrder(req, res) {
    try {
      const riderId = req.user.riderId;
      const { orderId } = req.body;

      const order = await Order.findOne({ orderId });
      
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      if (order.delivery.riderId) {
        return res.status(400).json({
          success: false,
          error: 'Order already assigned to a rider'
        });
      }

      // Update order with rider assignment
      order.delivery.riderId = riderId;
      order.delivery.status = 'assigned';
      order.status = 'ready';
      await order.save();

      // Update rider status
      await Rider.findByIdAndUpdate(riderId, {
        status: 'busy',
        currentOrder: order._id
      });

      // Send notifications
      await notificationService.sendOrderNotification(order, 'assigned');

      res.json({
        success: true,
        order,
        message: 'Order accepted successfully'
      });

    } catch (error) {
      console.error('Accept order error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async updateOrderStatus(req, res) {
    try {
      const riderId = req.user.riderId;
      const { orderId } = req.params;
      const { status, notes } = req.body;

      const order = await Order.findOne({ 
        orderId,
        'delivery.riderId': riderId
      });
      
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found or not assigned to you'
        });
      }

      order.delivery.status = status;
      if (notes) order.delivery.deliveryNotes = notes;

      // Update order status based on delivery status
      if (status === 'picked_up') {
        order.status = 'in_transit';
      } else if (status === 'delivered') {
        order.status = 'delivered';
        order.delivery.actualDelivery = new Date();
        
        // Update rider stats
        await Rider.findByIdAndUpdate(riderId, {
          $inc: { totalDeliveries: 1, earnings: order.payment.amount * 0.1 }, // Example: 10% of order value as delivery fee
          status: 'available',
          currentOrder: null
        });
      }

      await order.save();

      // Send notification
      await notificationService.sendOrderNotification(order, status);

      res.json({
        success: true,
        order,
        message: 'Order status updated successfully'
      });

    } catch (error) {
      console.error('Update order status error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getRiderStats(req, res) {
    try {
      const riderId = req.user.riderId;

      const rider = await Rider.findById(riderId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayDeliveries = await Order.countDocuments({
        'delivery.riderId': riderId,
        'delivery.actualDelivery': { $gte: today },
        status: 'delivered'
      });

      const totalEarnings = await Order.aggregate([
        { 
          $match: { 
            'delivery.riderId': riderId,
            status: 'delivered'
          } 
        },
        { 
          $group: { 
            _id: null, 
            total: { $sum: '$payment.amount' } 
          } 
        }
      ]);

      res.json({
        success: true,
        stats: {
          totalDeliveries: rider.totalDeliveries,
          todayDeliveries,
          totalEarnings: rider.earnings,
          rating: rider.rating,
          status: rider.status
        }
      });

    } catch (error) {
      console.error('Get rider stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async onboardRider(req, res) {
    try {
      const riderData = req.body;

      // Create or update associated User
      let user;
      if (riderData.userId) {
        user = await User.findByIdAndUpdate(
          riderData.userId,
          {
            role: 'rider',
            name: riderData.name || riderData.fullName || riderData.contact?.name,
            phone: riderData.phone || riderData.contact?.phone,
            email: riderData.email || riderData.contact?.email
          },
          { new: true }
        );

        if (!user) {
          return res.status(400).json({ success: false, error: 'User not found' });
        }
      } else {
        user = new User({
          name: riderData.name || riderData.fullName || (riderData.contact && riderData.contact.name) || 'Rider',
          email: riderData.email || (riderData.contact && riderData.contact.email),
          phone: riderData.phone || (riderData.contact && riderData.contact.phone),
          password: 'temp_password_' + Date.now(),
          role: 'rider'
        });
        await user.save();
      }

      // Create Rider record
      const riderPayload = {
        userId: user._id,
        vehicle: riderData.vehicle || {},
        location: riderData.location || { coordinates: { lat: 0, lng: 0 }, lastUpdated: new Date() },
        status: riderData.status || 'available',
        totalDeliveries: riderData.totalDeliveries || 0,
        earnings: riderData.earnings || 0,
        rating: riderData.rating || 0,
        ...riderData.extra // optional: pass any other custom fields under extra
      };

      const rider = new Rider(riderPayload);
      await rider.save();

      res.json({
        success: true,
        rider: {
          id: rider._id,
          userId: user._id,
          status: rider.status
        },
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        message: 'Rider onboarded successfully'
      });
    } catch (error) {
      console.error('Onboard rider error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new RiderController();