require('dotenv').config();
const mongoose = require('mongoose');
const Merchant = require('./models/Merchant');
const User = require('./models/User');

// Connect to database
const connectDB = require('./config/database');
connectDB();

async function getMerchantData() {
  try {
    // Find a merchant with products
    const merchant = await Merchant.findOne({
      products: { $exists: true, $not: { $size: 0 } }
    });
    
    if (!merchant) {
      console.log('No merchant with products found');
      return;
    }
    
    // Find or create customer
    let customer = await User.findOne({ email: 'customer@example.com' });
    if (!customer) {
      customer = new User({
        name: 'Test Customer',
        email: 'customer@example.com',
        phone: '+1555123456',
        password: 'temp_password',
        role: 'customer'
      });
      await customer.save();
    }
    
    const product = merchant.products[0];
    
    console.log('Merchant ID:', merchant._id);
    console.log('Customer ID:', customer._id);
    console.log('Product ID:', product._id);
    console.log('Product Name:', product.name);
    console.log('Product Price:', product.price);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

getMerchantData();

