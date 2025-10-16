import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './AuthContext.js';

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('AuthContext is not available');
  }
  return context;
};
