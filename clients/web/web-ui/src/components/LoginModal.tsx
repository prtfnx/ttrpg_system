import React, { useState } from 'react';
import './Auth.css';
import { useAuth } from './AuthContext';
import { Modal } from './common/Modal';

const LoginModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { login, loading, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    
    // Client-side validation
    if (!username.trim()) {
      setFormError('Username is required');
      return;
    }
    if (!password) {
      setFormError('Password is required');
      return;
    }
    if (username.length < 4) {
      setFormError('Username must be at least 4 characters long');
      return;
    }
    if (password.length < 4) {
      setFormError('Password must be at least 4 characters long');
      return;
    }

    const success = await login(username, password);
    if (success) {
      // Clear form and close modal
      setUsername('');
      setPassword('');
      setFormError('');
      onClose();
    }
  };

  const handleClose = () => {
    if (!loading) {
      setUsername('');
      setPassword('');
      setFormError('');
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Login">
      <div className="login-modal">
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              disabled={loading}
              placeholder="Enter your username"
              autoComplete="username"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </div>
          
          {(formError || error) && (
            <div className="form-error">
              {formError || error}
            </div>
          )}
          
          <button 
            type="submit" 
            disabled={loading || !username.trim() || !password}
            className="login-button"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </Modal>
  );
};

export default LoginModal;