const status = require('../src/order.js/routes');
const users = require('../src/users/routes');
// const validateAuth = require('../middlewares/validateAuth');
// const getData = require('../middlewares/getData');

module.exports = (app) => {
  app.use('/api/webhooks', webhookRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/merchants', merchantRoutes);
app.use('/api/riders', riderRoutes);
};
