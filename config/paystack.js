// config/paystack.js
const Paystack = require('paystack');

const paystack = Paystack(process.env.PAYSTACK_SECRET_KEY);

module.exports = paystack;