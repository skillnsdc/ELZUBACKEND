const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ei_solutions_pro', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Create default admin if not exists
    const User = require('../models/User');
    const adminExists = await User.findOne({ role: 'admin' });
    
    if (!adminExists) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await User.create({
        name: 'System Admin',
        email: 'admin@eisolutions.com',
        mobile: '9999999999',
        password: hashedPassword,
        role: 'admin',
        status: 'active',
        kycVerified: true,
        isActive: true
      });
      
      console.log('✅ Default admin created:');
      console.log('   Email: admin@eisolutions.com');
      console.log('   Password: admin123');
    }
    
    // Create default services if not exists
    const Service = require('../models/Service');
    const servicesCount = await Service.countDocuments();
    
    if (servicesCount === 0) {
      const defaultServices = [
        // Financial Services
        { name: 'AEPS Withdrawal', code: 'AEPS_WD', category: 'financial', type: 'debit', baseAmount: 0, adminCommission: 5, retailerCommission: 3 },
        { name: 'Balance Check', code: 'BAL_CHK', category: 'financial', type: 'debit', baseAmount: 0, adminCommission: 2, retailerCommission: 1 },
        { name: 'Mini Statement', code: 'MINI_STMT', category: 'financial', type: 'debit', baseAmount: 5, adminCommission: 3, retailerCommission: 2 },
        { name: 'Money Transfer', code: 'MONEY_TR', category: 'financial', type: 'debit', baseAmount: 10, adminCommission: 5, retailerCommission: 3 },
        
        // Recharge Services
        { name: 'Mobile Recharge', code: 'MOB_RECH', category: 'recharge', type: 'debit', baseAmount: 0, adminCommission: 3, retailerCommission: 2 },
        { name: 'DTH Recharge', code: 'DTH_RECH', category: 'recharge', type: 'debit', baseAmount: 0, adminCommission: 4, retailerCommission: 2.5 },
        { name: 'FASTag Recharge', code: 'FASTAG', category: 'recharge', type: 'debit', baseAmount: 0, adminCommission: 3, retailerCommission: 2 },
        
        // BBPS Services
        { name: 'Electricity Bill', code: 'ELEC_BILL', category: 'bbps', type: 'debit', baseAmount: 0, adminCommission: 5, retailerCommission: 3 },
        { name: 'Water Bill', code: 'WATER_BILL', category: 'bbps', type: 'debit', baseAmount: 0, adminCommission: 4, retailerCommission: 2.5 },
        { name: 'Gas Bill', code: 'GAS_BILL', category: 'bbps', type: 'debit', baseAmount: 0, adminCommission: 4, retailerCommission: 2.5 },
        { name: 'Broadband Bill', code: 'BB_BILL', category: 'bbps', type: 'debit', baseAmount: 0, adminCommission: 5, retailerCommission: 3 },
        
        // Govt Services
        { name: 'Aadhaar Services', code: 'AADHAAR', category: 'govt', type: 'credit', baseAmount: 50, adminCommission: 20, retailerCommission: 30 },
        { name: 'PAN Card New', code: 'PAN_NEW', category: 'govt', type: 'credit', baseAmount: 110, adminCommission: 50, retailerCommission: 60 },
        { name: 'PAN Correction', code: 'PAN_CORR', category: 'govt', type: 'credit', baseAmount: 110, adminCommission: 50, retailerCommission: 60 },
        { name: 'Voter ID', code: 'VOTER_ID', category: 'govt', type: 'credit', baseAmount: 0, adminCommission: 30, retailerCommission: 40 },
        { name: 'Passport', code: 'PASSPORT', category: 'govt', type: 'credit', baseAmount: 1500, adminCommission: 500, retailerCommission: 700 },
        { name: 'E-District', code: 'E_DIST', category: 'govt', type: 'credit', baseAmount: 0, adminCommission: 20, retailerCommission: 30 },
        
        // Health Services
        { name: 'ABDM ABHA Card', code: 'ABHA', category: 'health', type: 'credit', baseAmount: 0, adminCommission: 15, retailerCommission: 25 },
        { name: 'Ayushman Bharat', code: 'AYUSHMAN', category: 'health', type: 'credit', baseAmount: 0, adminCommission: 25, retailerCommission: 35 },
        
        // Education Services
        { name: 'NSDC Registration', code: 'NSDC', category: 'education', type: 'credit', baseAmount: 0, adminCommission: 100, retailerCommission: 150 },
        { name: 'Certificate Application', code: 'CERT_APP', category: 'education', type: 'credit', baseAmount: 0, adminCommission: 30, retailerCommission: 50 },
        
        // Business Services
        { name: 'GST Registration', code: 'GST_REG', category: 'business', type: 'credit', baseAmount: 500, adminCommission: 200, retailerCommission: 300 },
        { name: 'GST Filing', code: 'GST_FILE', category: 'business', type: 'credit', baseAmount: 300, adminCommission: 100, retailerCommission: 200 },
        { name: 'MSME Registration', code: 'MSME', category: 'business', type: 'credit', baseAmount: 0, adminCommission: 150, retailerCommission: 250 },
        { name: 'Udyam Registration', code: 'UDYAM', category: 'business', type: 'credit', baseAmount: 0, adminCommission: 150, retailerCommission: 250 },
        
        // Land Services
        { name: 'Land Tax', code: 'LAND_TAX', category: 'land', type: 'credit', baseAmount: 0, adminCommission: 20, retailerCommission: 30 },
        { name: 'Property Tax', code: 'PROP_TAX', category: 'land', type: 'credit', baseAmount: 0, adminCommission: 20, retailerCommission: 30 },
        
        // Insurance Services
        { name: 'Life Insurance', code: 'LIFE_INS', category: 'insurance', type: 'credit', baseAmount: 0, adminCommission: 500, retailerCommission: 800 },
        { name: 'Health Insurance', code: 'HEALTH_INS', category: 'insurance', type: 'credit', baseAmount: 0, adminCommission: 400, retailerCommission: 600 },
        { name: 'Vehicle Insurance', code: 'VEH_INS', category: 'insurance', type: 'credit', baseAmount: 0, adminCommission: 300, retailerCommission: 500 },
        
        // Training Services
        { name: 'Paid Training', code: 'TRAINING', category: 'training', type: 'debit', baseAmount: 300, adminCommission: 150, retailerCommission: 0 },
        
        // Job Services
        { name: 'Job Registration', code: 'JOB_REG', category: 'jobs', type: 'credit', baseAmount: 0, adminCommission: 50, retailerCommission: 100 },
        { name: 'Resume Upload', code: 'RESUME_UP', category: 'jobs', type: 'credit', baseAmount: 0, adminCommission: 20, retailerCommission: 30 }
      ];
      
      await Service.insertMany(defaultServices);
      console.log('✅ Default services created');
    }
    
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
