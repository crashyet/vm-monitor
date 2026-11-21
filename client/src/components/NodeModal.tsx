import React, { useState } from 'react';
import { X, Server, Key, Lock, CheckCircle2, AlertCircle, Loader2, Upload } from 'lucide-react';
import { NodeItem } from '../types/index.ts';
import { api } from '../services/api.ts';

interface NodeModalProps {
  initialNode?: NodeItem | null;
  onClose: () => void;
  onSaved: () => void;
}

export const NodeModal: React.FC<NodeModalProps> = ({ initialNode, onClose, onSaved }) => {
  const isEdit = Boolean(initialNode);

  const [name, setName] = useState(initialNode?.name || '');
  const [groupName, setGroupName] = useState(initialNode?.group_name || 'HomeLab');
  const [host, setHost] = useState(initialNode?.host || '');
  const [port, setPort] = useState(initialNode?.port ? String(initialNode.port) : '22');
  const [username, setUsername] = useState(initialNode?.username || 'root');
  const [authType, setAuthType] = useState<'password' | 'key'>(initialNode?.auth_type || 'password');
  const [credential, setCredential] = useState('');

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; osInfo?: string; error?: string } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCredential((event.target?.result as string) || '');
      };
      reader.readAsText(file);
    }
  };

  const handleTestConnection = async () => {
    setErrorMessage('');
    if (!host || !username) {
      setErrorMessage('Please fill in Host and Username before testing connection.');
      return;
    }

    if (!isEdit && !credential) {
      setErrorMessage('Please enter Password or Private Key to test connection.');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      let res;
      if (isEdit && !credential) {
        // Test existing saved credentials on server
        res = await api.testSavedNode(initialNode!.id);
      } else {
        res = await api.testConnection({
          host,
          port: parseInt(port || '22', 10),
          username,
          authType,
          credential,
        });
      }
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message || 'Connection test failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!name || !host || !username) {
      setErrorMessage('Name, Host, and Username are required.');
      return;
    }

    if (!isEdit && !credential) {
      setErrorMessage('SSH Credential (Password or Private Key) is required for new VM.');
      return;
    }

    setIsSaving(true);
    try {
      if (isEdit) {
        await api.updateNode(initialNode!.id, {
          name,
          groupName,
          host,
          port: parseInt(port || '22', 10),
          username,
          authType,
          credential: credential || undefined,
        });
      } else {
        await api.createNode({
          name,
          groupName,
          host,
          port: parseInt(port || '22', 10),
          username,
          authType,
          credential,
        });
      }
      onSaved();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save node.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#141820] border border-[#2b3342] rounded-lg shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#232a37] flex items-center justify-between bg-[#191e28]">
          <div className="flex items-center space-x-2">
            <Server className="w-4 h-4 text-[#ff7a1a]" />
            <h2 className="font-semibold text-sm text-white">{isEdit ? 'Edit VM Configuration' : 'Add New VM Node'}</h2>
          </div>
          <button onClick={onClose} className="text-[#7d8b9e] hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-950/40 border border-rose-900/60 rounded text-rose-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* VM Name & Group */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#8d9ab0] font-medium mb-1">Node / VM Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. prod-db-01"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#1b2029] border border-[#2b3342] text-white rounded px-3 py-1.5 focus:outline-none focus:border-[#ff7a1a]"
              />
            </div>
            <div>
              <label className="block text-[#8d9ab0] font-medium mb-1">Group / Tag</label>
              <input
                type="text"
                placeholder="e.g. HomeLab, AWS, Proxmox"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full bg-[#1b2029] border border-[#2b3342] text-white rounded px-3 py-1.5 focus:outline-none focus:border-[#ff7a1a]"
              />
            </div>
          </div>

          {/* Host, Port, Username */}
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-6">
              <label className="block text-[#8d9ab0] font-medium mb-1">Host / IP Address *</label>
              <input
                type="text"
                required
                placeholder="192.168.1.100 or vpn.host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="w-full bg-[#1b2029] border border-[#2b3342] text-white rounded px-3 py-1.5 font-mono focus:outline-none focus:border-[#ff7a1a]"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[#8d9ab0] font-medium mb-1">Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full bg-[#1b2029] border border-[#2b3342] text-white rounded px-2.5 py-1.5 font-mono focus:outline-none focus:border-[#ff7a1a]"
              />
            </div>
            <div className="col-span-4">
              <label className="block text-[#8d9ab0] font-medium mb-1">SSH User *</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#1b2029] border border-[#2b3342] text-white rounded px-3 py-1.5 font-mono focus:outline-none focus:border-[#ff7a1a]"
              />
            </div>
          </div>

          {/* Authentication Type Selector */}
          <div>
            <label className="block text-[#8d9ab0] font-medium mb-1.5">Authentication Method</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAuthType('password')}
                className={`py-2 px-3 rounded border flex items-center justify-center space-x-2 transition-colors ${
                  authType === 'password'
                    ? 'bg-[#e66000]/15 border-[#e66000] text-white font-medium'
                    : 'bg-[#1b2029] border-[#2b3342] text-[#828f9f] hover:text-white'
                }`}
              >
                <Lock className="w-3.5 h-3.5 text-[#ff8c33]" />
                <span>SSH Password</span>
              </button>
              <button
                type="button"
                onClick={() => setAuthType('key')}
                className={`py-2 px-3 rounded border flex items-center justify-center space-x-2 transition-colors ${
                  authType === 'key'
                    ? 'bg-[#e66000]/15 border-[#e66000] text-white font-medium'
                    : 'bg-[#1b2029] border-[#2b3342] text-[#828f9f] hover:text-white'
                }`}
              >
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                <span>SSH Private Key</span>
              </button>
            </div>
          </div>

          {/* Credential Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[#8d9ab0] font-medium">
                {authType === 'password' ? 'Password' : 'Private Key (PEM / OpenSSH)'}
                {isEdit && <span className="text-[#657388] font-normal ml-1">(Leave blank to keep existing)</span>}
              </label>

              {authType === 'key' && (
                <label className="cursor-pointer text-[11px] text-[#ff8c33] hover:underline flex items-center space-x-1">
                  <Upload className="w-3 h-3" />
                  <span>Upload .pem / id_rsa</span>
                  <input type="file" onChange={handleFileUpload} className="hidden" />
                </label>
              )}
            </div>

            {authType === 'password' ? (
              <input
                type="password"
                placeholder={isEdit ? '••••••••' : 'Enter SSH password'}
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                className="w-full bg-[#1b2029] border border-[#2b3342] text-white rounded px-3 py-1.5 focus:outline-none focus:border-[#ff7a1a]"
              />
            ) : (
              <textarea
                rows={4}
                placeholder={isEdit ? 'Existing private key preserved...' : '-----BEGIN OPENSSH PRIVATE KEY-----\n...'}
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                className="w-full bg-[#1b2029] border border-[#2b3342] text-white rounded px-3 py-1.5 font-mono text-[11px] focus:outline-none focus:border-[#ff7a1a]"
              />
            )}
          </div>

          {/* Test Connection Result Box */}
          {testResult && (
            <div
              className={`p-3 rounded border text-xs flex items-start space-x-2.5 ${
                testResult.success
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-900/60 text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <div className="font-semibold">
                  {testResult.success ? 'Connection Successful!' : 'Connection Failed'}
                </div>
                {testResult.success ? (
                  <div className="text-[11px] text-emerald-200/90 mt-0.5">
                    Latency: <span className="font-mono">{testResult.latencyMs}ms</span> | Host OS: {testResult.osInfo}
                  </div>
                ) : (
                  <div className="text-[11px] text-rose-200/90 mt-0.5 font-mono">{testResult.error}</div>
                )}
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-[#232a37]">
            <button
              type="button"
              disabled={isTesting}
              onClick={handleTestConnection}
              className="px-3 py-1.5 rounded bg-[#1f2530] hover:bg-[#28303f] text-[#cfd6e2] border border-[#2e3748] flex items-center space-x-1.5 transition-colors disabled:opacity-50"
            >
              {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#ff7a1a]" /> : null}
              <span>{isTesting ? 'Testing...' : 'Test Connection'}</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded text-[#828f9f] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-1.5 rounded bg-[#e66000] hover:bg-[#ff700a] text-white font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-50 shadow-sm"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>{isSaving ? 'Saving...' : isEdit ? 'Update VM' : 'Save VM'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
