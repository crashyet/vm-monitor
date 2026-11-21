import { NodeItem, SnippetItem, UserItem } from '../types/index.ts';

const API_BASE = '/api';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('nexus_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP error ${res.status}`);
  }
  return data;
}

export const api = {
  // Auth
  async checkSetupStatus(): Promise<{ needsSetup: boolean }> {
    const res = await fetch(`${API_BASE}/auth/status`);
    return handleResponse(res);
  },

  async setupAdmin(username: string, password: string): Promise<{ token: string; user: UserItem }> {
    const res = await fetch(`${API_BASE}/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return handleResponse(res);
  },

  async login(username: string, password: string): Promise<{ token: string; user: UserItem }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return handleResponse(res);
  },

  async getMe(): Promise<{ user: UserItem }> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  // Nodes
  async getNodes(): Promise<NodeItem[]> {
    const res = await fetch(`${API_BASE}/nodes`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  async createNode(data: {
    name: string;
    groupName: string;
    host: string;
    port: number;
    username: string;
    authType: 'password' | 'key';
    credential: string;
  }): Promise<NodeItem> {
    const res = await fetch(`${API_BASE}/nodes`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async updateNode(
    id: string,
    data: {
      name: string;
      groupName: string;
      host: string;
      port: number;
      username: string;
      authType: 'password' | 'key';
      credential?: string;
    }
  ): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/nodes/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async deleteNode(id: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/nodes/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  async testConnection(data: {
    host: string;
    port: number;
    username: string;
    authType: 'password' | 'key';
    credential: string;
  }): Promise<{ success: boolean; latencyMs?: number; osInfo?: string; error?: string }> {
    const res = await fetch(`${API_BASE}/nodes/test`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async testSavedNode(id: string): Promise<{ success: boolean; latencyMs?: number; osInfo?: string; error?: string }> {
    const res = await fetch(`${API_BASE}/nodes/${id}/test`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  // Power
  async rebootNode(id: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/nodes/${id}/power/reboot`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  async shutdownNode(id: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/nodes/${id}/power/shutdown`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  // Snippets
  async getSnippets(): Promise<SnippetItem[]> {
    const res = await fetch(`${API_BASE}/snippets`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  async createSnippet(data: { title: string; command: string; description?: string }): Promise<SnippetItem> {
    const res = await fetch(`${API_BASE}/snippets`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async deleteSnippet(id: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/snippets/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  async executeSnippet(
    snippetId: string,
    nodeId: string
  ): Promise<{ success: boolean; exitCode: number; stdout: string; stderr: string; executionMs: number; command: string }> {
    const res = await fetch(`${API_BASE}/snippets/${snippetId}/execute/${nodeId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },
};
