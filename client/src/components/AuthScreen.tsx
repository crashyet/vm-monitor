import React, { useState } from 'react';
import { Server, Lock, User, ShieldCheck, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../services/api.ts';
import { UserItem } from '../types/index.ts';

interface AuthScreenProps {
  needsSetup: boolean;
  onAuthenticated: (token: string, user: UserItem) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ needsSetup, onAuthenticated }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Username and password are required.');
      return;
    }

    if (needsSetup && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      if (needsSetup) {
        const res = await api.setupAdmin(username.trim(), password);
        localStorage.setItem('nexus_token', res.token);
        onAuthenticated(res.token, res.user);
      } else {
        const res = await api.login(username.trim(), password);
        localStorage.setItem('nexus_token', res.token);
        onAuthenticated(res.token, res.user);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0f14] flex flex-col justify-center items-center px-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex w-12 h-12 rounded-xl bg-gradient-to-tr from-[#e66000] to-[#ff8c33] items-center justify-center shadow-xl shadow-orange-950/40 mb-3">
            <Server className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Nexus<span className="text-[#ff7a1a]">SSH</span></h1>
          <p className="text-xs text-[#717d91] mt-1">Centralized Agentless SSH VM Control Panel</p>
        </div>

        {/* Card */}
        <div className="bg-[#14171f] border border-[#232936] rounded-xl shadow-2xl p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-white">
              {needsSetup ? 'Create Master Admin Account' : 'Sign in to Dashboard'}
            </h2>
            <p className="text-xs text-[#717d91] mt-0.5">
              {needsSetup
                ? 'Welcome! Set up the initial administrator account to protect your cluster.'
                : 'Enter your credentials to manage and monitor your virtual machines.'}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900/60 rounded text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-[#8d9ab0] font-medium mb-1">Username</label>
              <div className="relative">
                <User className="w-4 h-4 text-[#5e6b7e] absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[#1b2029] border border-[#28303e] text-white rounded pl-9 pr-3 py-2 focus:outline-none focus:border-[#ff7a1a]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[#8d9ab0] font-medium mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#5e6b7e] absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#1b2029] border border-[#28303e] text-white rounded pl-9 pr-3 py-2 focus:outline-none focus:border-[#ff7a1a]"
                />
              </div>
            </div>

            {needsSetup && (
              <div>
                <label className="block text-[#8d9ab0] font-medium mb-1">Confirm Password</label>
                <div className="relative">
                  <ShieldCheck className="w-4 h-4 text-[#5e6b7e] absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-[#1b2029] border border-[#28303e] text-white rounded pl-9 pr-3 py-2 focus:outline-none focus:border-[#ff7a1a]"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 bg-[#e66000] hover:bg-[#ff700a] text-white font-semibold rounded shadow-md shadow-orange-950/40 flex items-center justify-center space-x-2 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>{needsSetup ? 'Initialize Dashboard' : 'Sign In'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Security badge footer */}
        <div className="mt-6 text-center text-[11px] text-[#556173] flex items-center justify-center space-x-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Credential encryption active (AES-256-GCM)</span>
        </div>
      </div>
    </div>
  );
};
