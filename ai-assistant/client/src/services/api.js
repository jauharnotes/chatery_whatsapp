const API_URL = '/api';

export const askQuestion = async (question) => {
  const response = await fetch(`${API_URL}/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question }),
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
