// OTP Utility Functions

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Generate OTP with expiry
const generateOTPWithExpiry = (expiryMinutes = 10) => {
  const otp = generateOTP();
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + expiryMinutes);
  
  return {
    otp,
    expiry
  };
};

// Verify OTP
const verifyOTP = (inputOTP, storedOTP, expiry) => {
  // Check if OTP matches
  if (inputOTP !== storedOTP) {
    return {
      valid: false,
      message: 'Invalid OTP'
    };
  }
  
  // Check if OTP is expired
  if (new Date() > new Date(expiry)) {
    return {
      valid: false,
      message: 'OTP has expired'
    };
  }
  
  return {
    valid: true,
    message: 'OTP verified successfully'
  };
};

// Format mobile number (remove spaces, add country code)
const formatMobile = (mobile) => {
  let formatted = mobile.replace(/\s/g, '');
  if (!formatted.startsWith('+')) {
    if (formatted.startsWith('0')) {
      formatted = formatted.substring(1);
    }
    formatted = '+91' + formatted;
  }
  return formatted;
};

module.exports = {
  generateOTP,
  generateOTPWithExpiry,
  verifyOTP,
  formatMobile
};
