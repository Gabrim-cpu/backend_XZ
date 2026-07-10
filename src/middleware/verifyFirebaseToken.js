import { firebaseAuth } from '../config/firebase.js';

export const verifyFirebaseToken = async (req, res, next) => {
  // Check if Firebase is initialized
  if (!firebaseAuth) {
    console.error('Firebase not initialized');
    return res.status(500).json({ 
      success: false, 
      error: 'Authentication service unavailable' 
    });
  }
  
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      error: 'No token provided' 
    });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    console.log('🔑 Verifying Firebase token...');
    const decodedToken = await firebaseAuth.verifyIdToken(token);
    console.log('✅ Token verified for user:', decodedToken.email);
    req.firebaseUser = decodedToken;
    next();
  } catch (error) {
    console.error('❌ Token verification failed:', error.message, error.code);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ 
        success: false, 
        error: 'Token expired. Please sign in again.' 
      });
    }
    
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid token. Please sign in again.' 
    });
  }
};