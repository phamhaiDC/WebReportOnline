import React, { useState, useEffect } from 'react';
import { APP_CONFIG } from '../config';

const Login = ({ onLogin }) => {
    const [email, setEmail] = useState('admin@dcorp.com.vn');
    const [password, setPassword] = useState('1');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Auto-login on component mount
        const timer = setTimeout(() => {
            handleSubmit(new Event('submit'));
        }, 500);
        return () => clearTimeout(timer);
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            await onLogin(email, password);
        } catch (err) {
            setError(err.message || 'Login failed');
            setLoading(false);
        }
    };

    return (
        <div className="login-shell">
            <form className="login-card" onSubmit={handleSubmit}>
                <div className="login-brand">
                    <div className="login-logo-wrap">
                        <img src={APP_CONFIG.logo} alt="Logo" className="login-logo" />
                    </div>
                    <h1>{APP_CONFIG.title}</h1>
                    <p>Please enter your details to sign in.</p>
                </div>

                {error && (
                    <div className="login-error">
                        {error}
                    </div>
                )}

                <div className="field-group">
                    <label>Email</label>
                    <input
                        type="text"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email"
                        required
                    />
                </div>

                <div className="field-group">
                    <label>Password</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                    />
                </div>

                <button type="submit" disabled={loading} className="primary-button">
                    {loading ? 'Signing in...' : 'Sign in'}
                </button>
            </form>
        </div>
    );
};

export default Login;
