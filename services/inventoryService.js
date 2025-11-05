// services/inventoryService.js
const Merchant = require('../models/Merchant');

class InventoryService {
  async updateInventory(order) {
    try {
      const merchant = await Merchant.findById(order.merchant.merchantId);
      
      for (const item of order.items) {
        const product = merchant.products.id(item.productId);
        
        if (product) {
          if (product.stock < item.quantity) {
            throw new Error(`Insufficient stock for ${product.name}`);
          }
          
          product.stock -= item.quantity;
          
          if (product.stock === 0) {
            product.available = false;
          }
        }
      }
      
      await merchant.save();
      
    } catch (error) {
      console.error('Inventory update error:', error);
      throw error;
    }
  }

  async checkStockAvailability(items, merchantId) {
    try {
      const merchant = await Merchant.findById(merchantId);
      
      for (const item of items) {
        const product = merchant.products.id(item.productId);
        
        if (!product || !product.available || product.stock < item.quantity) {
          return {
            available: false,
            product: product?.name,
            requested: item.quantity,
            availableStock: product?.stock || 0
          };
        }
      }
      
      return { available: true };
      
    } catch (error) {
      console.error('Stock check error:', error);
      throw error;
    }
  }

  async restockProduct(merchantId, productId, quantity) {
    try {
      const merchant = await Merchant.findById(merchantId);
      const product = merchant.products.id(productId);
      
      if (product) {
        product.stock += quantity;
        product.available = true;
        await merchant.save();
        
        return product;
      } else {
        throw new Error('Product not found');
      }
      
    } catch (error) {
      console.error('Restock error:', error);
      throw error;
    }
  }

  async addProduct(merchantId, productData) {
    try {
      console.log(merchantId, productData);
      const merchant = await Merchant.findById(merchantId);
      if (!merchant.products) {
        merchant.products = [];
      }
      merchant.products.push(productData);
      await merchant.save();
      
      return merchant.products[merchant.products.length - 1];
      
    } catch (error) {
      console.error('Add product error:', error);
      throw error;
    }
  }
}

module.exports = InventoryService;