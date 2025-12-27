const API_URL = '/api';

// =========================================
// AI/Chat API
// =========================================

export const askQuestion = async (question, connectionId = null) => {
  const response = await fetch(`${API_URL}/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question, connectionId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to get answer');
  }

  return response.json();
};

export const ingestDocument = async (content, metadata = {}) => {
  const response = await fetch(`${API_URL}/documents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content, metadata }),
  });

  if (!response.ok) {
    throw new Error('Failed to ingest document');
  }

  return response.json();
};

export const generateImage = async (prompt) => {
  const response = await fetch(`${API_URL}/image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to generate image');
  }

  return response.json();
};

// =========================================
// CONFIG API - Database Connections
// =========================================

export const getConnections = async () => {
  const response = await fetch(`${API_URL}/config/connections`);
  if (!response.ok) throw new Error('Failed to fetch connections');
  return response.json();
};

export const createConnection = async (data) => {
  const response = await fetch(`${API_URL}/config/connections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create connection');
  }
  return response.json();
};

export const updateConnection = async (id, data) => {
  const response = await fetch(`${API_URL}/config/connections/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update connection');
  return response.json();
};

export const deleteConnection = async (id) => {
  const response = await fetch(`${API_URL}/config/connections/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete connection');
  return response.json();
};

export const testConnection = async (id) => {
  const response = await fetch(`${API_URL}/config/connections/${id}/test`, {
    method: 'POST',
  });
  return response.json();
};

// =========================================
// CONFIG API - Tables
// =========================================

export const discoverTables = async (connectionId) => {
  const response = await fetch(`${API_URL}/config/connections/${connectionId}/tables`);
  if (!response.ok) throw new Error('Failed to discover tables');
  return response.json();
};

export const getTableSchema = async (connectionId, tableName) => {
  const response = await fetch(`${API_URL}/config/connections/${connectionId}/tables/${tableName}/schema`);
  if (!response.ok) throw new Error('Failed to get table schema');
  return response.json();
};

export const saveTableConfigs = async (connectionId, tables) => {
  const response = await fetch(`${API_URL}/config/connections/${connectionId}/tables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tables }),
  });
  if (!response.ok) throw new Error('Failed to save table configs');
  return response.json();
};

export const getConfiguredTables = async (connectionId) => {
  const response = await fetch(`${API_URL}/config/connections/${connectionId}/tables/configured`);
  if (!response.ok) throw new Error('Failed to get configured tables');
  return response.json();
};
